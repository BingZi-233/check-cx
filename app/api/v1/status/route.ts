import { NextRequest, NextResponse } from "next/server";
import { loadHistory } from "@/lib/database/history";
import { loadProviderConfigsFromDB } from "@/lib/database/config-loader";
import { getPollingIntervalMs, getPollingIntervalLabel } from "@/lib/core/polling-config";
import type { CheckResult, HealthStatus } from "@/lib/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";

interface ProviderStatistics {
  totalChecks: number;
  operationalCount: number;
  degradedCount: number;
  failedCount: number;
  validationFailedCount: number;
  successRate: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
}

interface ProviderStatus {
  id: string;
  name: string;
  type: string;
  model: string;
  group: string | null;
  endpoint: string;
  latest: {
    status: HealthStatus;
    latencyMs: number | null;
    pingLatencyMs: number | null;
    checkedAt: string;
    message: string;
  } | null;
  statistics: ProviderStatistics;
  timeline: Array<{
    status: HealthStatus;
    latencyMs: number | null;
    pingLatencyMs: number | null;
    checkedAt: string;
    message: string;
  }>;
}

interface StatusSummary {
  total: number;
  operational: number;
  degraded: number;
  failed: number;
  validationFailed: number;
  maintenance: number;
  avgLatencyMs: number | null;
}

interface ApiResponse {
  providers: ProviderStatus[];
  summary: StatusSummary;
  metadata: {
    generatedAt: string;
    pollIntervalMs: number;
    pollIntervalLabel: string;
    filters: {
      group: string | null;
      model: string | null;
    };
  };
}

function computeStatistics(items: CheckResult[]): ProviderStatistics {
  if (items.length === 0) {
    return {
      totalChecks: 0,
      operationalCount: 0,
      degradedCount: 0,
      failedCount: 0,
      validationFailedCount: 0,
      successRate: 0,
      avgLatencyMs: null,
      minLatencyMs: null,
      maxLatencyMs: null,
    };
  }

  let operationalCount = 0;
  let degradedCount = 0;
  let failedCount = 0;
  let validationFailedCount = 0;
  const latencies: number[] = [];

  for (const item of items) {
    switch (item.status) {
      case "operational":
        operationalCount++;
        break;
      case "degraded":
        degradedCount++;
        break;
      case "failed":
        failedCount++;
        break;
      case "validation_failed":
        validationFailedCount++;
        break;
    }
    if (item.latencyMs !== null) {
      latencies.push(item.latencyMs);
    }
  }

  const successCount = operationalCount + degradedCount;
  const successRate = items.length > 0 ? (successCount / items.length) * 100 : 0;

  let avgLatencyMs: number | null = null;
  let minLatencyMs: number | null = null;
  let maxLatencyMs: number | null = null;

  if (latencies.length > 0) {
    avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    minLatencyMs = Math.min(...latencies);
    maxLatencyMs = Math.max(...latencies);
  }

  return {
    totalChecks: items.length,
    operationalCount,
    degradedCount,
    failedCount,
    validationFailedCount,
    successRate: Math.round(successRate * 100) / 100,
    avgLatencyMs,
    minLatencyMs,
    maxLatencyMs,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const groupFilter = searchParams.get("group");
  const modelFilter = searchParams.get("model");

  const allConfigs = await loadProviderConfigsFromDB();
  const activeConfigs = allConfigs.filter((cfg) => !cfg.is_maintenance);
  const maintenanceConfigIds = new Set(
    allConfigs.filter((cfg) => cfg.is_maintenance).map((cfg) => cfg.id)
  );

  const allowedIds = new Set(activeConfigs.map((cfg) => cfg.id));
  const history = await loadHistory({ allowedIds });

  const providers: ProviderStatus[] = [];

  for (const config of allConfigs) {
    if (groupFilter && config.groupName !== groupFilter) {
      continue;
    }
    if (modelFilter && config.model !== modelFilter) {
      continue;
    }

    const items = history[config.id] || [];

    const latest = items[0] || null;
    const statistics = computeStatistics(items);

    const isMaintenance = maintenanceConfigIds.has(config.id);

    providers.push({
      id: config.id,
      name: config.name,
      type: config.type,
      model: config.model,
      group: config.groupName || null,
      endpoint: config.endpoint,
      latest: latest
        ? {
            status: isMaintenance ? "maintenance" : latest.status,
            latencyMs: latest.latencyMs,
            pingLatencyMs: latest.pingLatencyMs,
            checkedAt: latest.checkedAt,
            message: latest.message,
          }
        : null,
      statistics,
      timeline: items.map((item) => ({
        status: isMaintenance ? "maintenance" : item.status,
        latencyMs: item.latencyMs,
        pingLatencyMs: item.pingLatencyMs,
        checkedAt: item.checkedAt,
        message: item.message,
      })),
    });
  }

  let summaryOperational = 0;
  let summaryDegraded = 0;
  let summaryFailed = 0;
  let summaryValidationFailed = 0;
  let summaryMaintenance = 0;
  const allLatencies: number[] = [];

  for (const provider of providers) {
    if (!provider.latest) continue;

    switch (provider.latest.status) {
      case "operational":
        summaryOperational++;
        break;
      case "degraded":
        summaryDegraded++;
        break;
      case "failed":
        summaryFailed++;
        break;
      case "validation_failed":
        summaryValidationFailed++;
        break;
      case "maintenance":
        summaryMaintenance++;
        break;
    }

    if (provider.latest.latencyMs !== null) {
      allLatencies.push(provider.latest.latencyMs);
    }
  }

  const summary: StatusSummary = {
    total: providers.length,
    operational: summaryOperational,
    degraded: summaryDegraded,
    failed: summaryFailed,
    validationFailed: summaryValidationFailed,
    maintenance: summaryMaintenance,
    avgLatencyMs:
      allLatencies.length > 0
        ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length)
        : null,
  };

  const response: ApiResponse = {
    providers,
    summary,
    metadata: {
      generatedAt: new Date().toISOString(),
      pollIntervalMs: getPollingIntervalMs(),
      pollIntervalLabel: getPollingIntervalLabel(),
      filters: {
        group: groupFilter,
        model: modelFilter,
      },
    },
  };

  return NextResponse.json(response);
}
