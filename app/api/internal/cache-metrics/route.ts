import { NextResponse } from "next/server";
import { getAvailabilityCacheMetrics, resetAvailabilityCacheMetrics } from "@/lib/database/availability";
import { getConfigCacheMetrics, resetConfigCacheMetrics } from "@/lib/database/config-loader";
import { getGroupInfoCacheMetrics, resetGroupInfoCacheMetrics } from "@/lib/database/group-info";
import { getDashboardCacheMetrics, resetDashboardCacheMetrics } from "@/lib/core/dashboard-data";

export const revalidate = 0;
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const token = process.env.INTERNAL_METRICS_TOKEN;
  if (!token) {
    return true;
  }
  const headerToken = request.headers.get("x-internal-token");
  return headerToken === token;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const shouldReset = searchParams.get("reset") === "1";

  if (shouldReset) {
    resetAvailabilityCacheMetrics();
    resetConfigCacheMetrics();
    resetGroupInfoCacheMetrics();
    resetDashboardCacheMetrics();
  }

  const availability = getAvailabilityCacheMetrics();
  const config = getConfigCacheMetrics();
  const groupInfo = getGroupInfoCacheMetrics();
  const dashboard = getDashboardCacheMetrics();

  return NextResponse.json({
    availabilityCache: availability,
    configCache: config,
    groupInfoCache: groupInfo,
    dashboardCache: dashboard,
    combinedDbCache: {
      hits: availability.hits + config.hits + groupInfo.hits,
      misses: availability.misses + config.misses + groupInfo.misses,
    },
    generatedAt: new Date().toISOString(),
  });
}
