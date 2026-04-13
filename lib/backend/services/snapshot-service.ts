import type { CheckResult, HistorySnapshot, ProviderConfig, ProviderTimeline, RefreshMode } from "@/lib/types";

import { historyRepository } from "@/lib/backend/repositories/history-repository";
import { getSnapshotCacheEntry } from "@/lib/backend/runtime/registry";

import { getOfficialStatus } from "./official-status-service";
import { ensurePollerLeadership, isPollerLeader } from "./poller-leadership-service";
import { runConfiguredChecks } from "./provider-check-service";

export interface SnapshotScope {
  cacheKey: string;
  pollIntervalMs: number;
  activeConfigs: ProviderConfig[];
  allowedIds: Set<string>;
  limitPerConfig?: number;
}

async function readSnapshot(scope: SnapshotScope): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }

  return historyRepository.fetch({
    allowedIds: scope.allowedIds,
    limitPerConfig: scope.limitPerConfig,
  });
}

async function refreshSnapshot(scope: SnapshotScope): Promise<HistorySnapshot> {
  const cacheEntry = getSnapshotCacheEntry(scope.cacheKey);

  try {
    await ensurePollerLeadership();
  } catch (error) {
    console.error("[check-cx] 主节点选举失败，跳过主动刷新", error);
    return readSnapshot(scope);
  }

  if (!isPollerLeader()) {
    const snapshot = await readSnapshot(scope);
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = Date.now();
    return snapshot;
  }

  if (cacheEntry.inflight) {
    return cacheEntry.inflight;
  }

  const inflight = (async () => {
    const results = await runConfiguredChecks(scope.activeConfigs);
    await historyRepository.append(results);
    const snapshot = await readSnapshot(scope);
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = Date.now();
    return snapshot;
  })();

  cacheEntry.inflight = inflight;
  try {
    return await inflight;
  } finally {
    if (cacheEntry.inflight === inflight) {
      cacheEntry.inflight = undefined;
    }
  }
}

export async function loadSnapshotForScope(
  scope: SnapshotScope,
  refreshMode: RefreshMode
): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }

  const cacheEntry = getSnapshotCacheEntry(scope.cacheKey);
  const now = Date.now();
  const cacheIsFresh = cacheEntry.history && now - cacheEntry.lastPingAt < scope.pollIntervalMs;

  if (refreshMode === "never" && cacheIsFresh) {
    return cacheEntry.history ?? {};
  }

  let snapshot = await readSnapshot(scope);

  if (refreshMode === "never") {
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = now;
    return snapshot;
  }

  const shouldRefresh =
    refreshMode === "always" ||
    (refreshMode === "missing" && scope.activeConfigs.length > 0 && Object.keys(snapshot).length === 0);

  if (shouldRefresh && scope.activeConfigs.length > 0) {
    snapshot = await refreshSnapshot(scope);
  } else {
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = now;
  }

  return snapshot;
}

function attachOfficialStatus(result: CheckResult): CheckResult {
  const officialStatus = getOfficialStatus(result.type);
  if (!officialStatus) {
    return result;
  }
  return { ...result, officialStatus };
}

function createMaintenanceTimeline(config: ProviderConfig): ProviderTimeline {
  const latest: CheckResult = {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    status: "maintenance",
    latencyMs: null,
    pingLatencyMs: null,
    message: "配置处于维护模式",
    checkedAt: new Date().toISOString(),
    groupName: config.groupName ?? null,
  };

  return {
    id: config.id,
    items: [],
    latest: attachOfficialStatus(latest),
  };
}

export function buildProviderTimelines(
  history: HistorySnapshot,
  maintenanceConfigs: ProviderConfig[]
): ProviderTimeline[] {
  const timelines = Object.entries(history)
    .map<ProviderTimeline | null>(([id, items]) => {
      if (items.length === 0) {
        return null;
      }
      return {
        id,
        items,
        latest: attachOfficialStatus({ ...items[0] }),
      };
    })
    .filter((timeline): timeline is ProviderTimeline => Boolean(timeline));

  const maintenanceTimelines = maintenanceConfigs.map(createMaintenanceTimeline);
  return [...timelines, ...maintenanceTimelines].sort((left, right) =>
    left.latest.name.localeCompare(right.latest.name)
  );
}
