import { NextResponse } from "next/server";

import { applyJsonCacheHeaders } from "@/lib/backend/contracts/http-cache";
import { loadDashboardDataWithEtag } from "@/lib/core/dashboard-data";
import type { AvailabilityPeriod } from "@/lib/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const VALID_PERIODS: AvailabilityPeriod[] = ["7d", "15d", "30d"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedPeriod = searchParams.get("trendPeriod");
  const forceRefreshParam = searchParams.get("forceRefresh");
  const trendPeriod = VALID_PERIODS.includes(requestedPeriod as AvailabilityPeriod)
    ? (requestedPeriod as AvailabilityPeriod)
    : undefined;
  const refreshMode =
    forceRefreshParam === "1" || forceRefreshParam === "true" ? "always" : "never";

  const { data, etag } = await loadDashboardDataWithEtag({
    refreshMode,
    trendPeriod,
  });

  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return applyJsonCacheHeaders(NextResponse.json(data), data.pollIntervalMs, etag);
}
