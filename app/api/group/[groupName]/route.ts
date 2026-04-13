import { NextResponse } from "next/server";

import {
  applyJsonCacheHeaders,
  generateStableEtag,
} from "@/lib/backend/contracts/http-cache";
import { loadGroupDashboardData } from "@/lib/core/group-data";
import type { AvailabilityPeriod } from "@/lib/types";

interface RouteContext {
  params: Promise<{ groupName: string }>;
}

export const revalidate = 0;
export const dynamic = "force-dynamic";

const VALID_PERIODS: AvailabilityPeriod[] = ["7d", "15d", "30d"];

export async function GET(request: Request, context: RouteContext) {
  const { groupName } = await context.params;
  const decodedGroupName = decodeURIComponent(groupName);

  const { searchParams } = new URL(request.url);
  const requestedPeriod = searchParams.get("trendPeriod");
  const forceRefreshParam = searchParams.get("forceRefresh");
  const trendPeriod = VALID_PERIODS.includes(requestedPeriod as AvailabilityPeriod)
    ? (requestedPeriod as AvailabilityPeriod)
    : undefined;
  const refreshMode =
    forceRefreshParam === "1" || forceRefreshParam === "true" ? "always" : "never";

  const data = await loadGroupDashboardData(decodedGroupName, {
    refreshMode,
    trendPeriod,
  });

  if (!data) {
    return NextResponse.json({ error: "分组不存在或没有配置" }, { status: 404 });
  }

  const etag = generateStableEtag(data);
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return applyJsonCacheHeaders(NextResponse.json(data), data.pollIntervalMs, etag);
}
