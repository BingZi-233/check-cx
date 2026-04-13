import type { CheckResult, HealthStatus } from "@/lib/types";

import { getPollingIntervalLabel, getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import { listProviderConfigs } from "@/lib/backend/repositories/config-repository";
import { historyRepository } from "@/lib/backend/repositories/history-repository";

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

export interface PublicStatusResponse {
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
        operationalCount += 1;
        break;
      case "degraded":
        degradedCount += 1;
        break;
      case "failed":
        failedCount += 1;
        break;
      case "validation_failed":
        validationFailedCount += 1;
        break;
    }

    if (item.latencyMs !== null) {
      latencies.push(item.latencyMs);
    }
  }

  const successCount = operationalCount + degradedCount;
  return {
    totalChecks: items.length,
    operationalCount,
    degradedCount,
    failedCount,
    validationFailedCount,
    successRate: Math.round(((successCount / items.length) * 100) * 100) / 100,
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : null,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
  };
}

export async function buildPublicStatusResponse(filters: {
  group?: string | null;
  model?: string | null;
}): Promise<PublicStatusResponse> {
  const allConfigs = await listProviderConfigs();
  const activeConfigs = allConfigs.filter((config) => !config.is_maintenance);
  const maintenanceConfigIds = new Set(
    allConfigs.filter((config) => config.is_maintenance).map((config) => config.id)
  );
  const allowedIds = new Set(activeConfigs.map((config) => config.id));
  const history = await historyRepository.fetch({ allowedIds });

  const providers: ProviderStatus[] = [];
  for (const config of allConfigs) {
    if (filters.group && config.groupName !== filters.group) {
      continue;
    }
    if (filters.model && config.model !== filters.model) {
      continue;
    }

    const items = history[config.id] ?? [];
    const latest = items[0] ?? null;
    const isMaintenance = maintenanceConfigIds.has(config.id);

    providers.push({
      id: config.id,
      name: config.name,
      type: config.type,
      model: config.model,
      group: config.groupName ?? null,
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
      statistics: computeStatistics(items),
      timeline: items.map((item) => ({
        status: isMaintenance ? "maintenance" : item.status,
        latencyMs: item.latencyMs,
        pingLatencyMs: item.pingLatencyMs,
        checkedAt: item.checkedAt,
        message: item.message,
      })),
    });
  }

  let operational = 0;
  let degraded = 0;
  let failed = 0;
  let validationFailed = 0;
  let maintenance = 0;
  const latencies: number[] = [];

  for (const provider of providers) {
    if (!provider.latest) {
      continue;
    }

    switch (provider.latest.status) {
      case "operational":
        operational += 1;
        break;
      case "degraded":
        degraded += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "validation_failed":
        validationFailed += 1;
        break;
      case "maintenance":
        maintenance += 1;
        break;
    }

    if (provider.latest.latencyMs !== null) {
      latencies.push(provider.latest.latencyMs);
    }
  }

  return {
    providers,
    summary: {
      total: providers.length,
      operational,
      degraded,
      failed,
      validationFailed,
      maintenance,
      avgLatencyMs:
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      pollIntervalMs: getPollingIntervalMs(),
      pollIntervalLabel: getPollingIntervalLabel(),
      filters: {
        group: filters.group ?? null,
        model: filters.model ?? null,
      },
    },
  };
}
