/**
 * 健康快照服务
 * - 统一管理历史读取、刷新和时间线装配
 */

import type {CheckResult, HistorySnapshot, ProviderConfig, ProviderTimeline, RefreshMode,} from "../types";
import {historySnapshotStore} from "../database/history";
import {runProviderChecks} from "../providers";
import {getPingCacheEntry} from "./global-state";
import {getOfficialStatus} from "./official-status-poller";
import {ensurePollerLeadership, isPollerLeader} from "./poller-leadership";

export interface SnapshotScope {
  cacheKey: string;
  pollIntervalMs: number;
  activeConfigs: ProviderConfig[];
  allowedIds: Set<string>;
  limitPerConfig?: number;
}

async function readHistoryForScope(scope: SnapshotScope): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }
  return historySnapshotStore.fetch({
    allowedIds: scope.allowedIds,
    limitPerConfig: scope.limitPerConfig,
  });
}

export async function loadSnapshotForScope(
  scope: SnapshotScope,
  refreshMode: RefreshMode
): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }

  const cacheEntry = getPingCacheEntry(scope.cacheKey);
  const now = Date.now();

  if (refreshMode === "never") {
    if (
      cacheEntry.history &&
      now - cacheEntry.lastPingAt < scope.pollIntervalMs
    ) {
      return cacheEntry.history;
    }
    const snapshot = await readHistoryForScope(scope);
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = now;
    return snapshot;
  }

  const refreshHistory = async (): Promise<HistorySnapshot> => {
    if (scope.activeConfigs.length === 0) {
      return {};
    }

    try {
      await ensurePollerLeadership();
    } catch (error) {
      console.error("[check-cx] 主节点选举失败，跳过主动刷新", error);
      return readHistoryForScope(scope);
    }
    if (!isPollerLeader()) {
      const snapshot = await readHistoryForScope(scope);
      cacheEntry.history = snapshot;
      cacheEntry.lastPingAt = Date.now();
      return snapshot;
    }

    if (
      cacheEntry.history &&
      now - cacheEntry.lastPingAt < scope.pollIntervalMs
    ) {
      return cacheEntry.history;
    }

    if (cacheEntry.inflight) {
      return cacheEntry.inflight;
    }

    const inflightPromise = (async () => {
      const results = await runProviderChecks(scope.activeConfigs);
      await historySnapshotStore.append(results);
      const nextHistory = await readHistoryForScope(scope);
      cacheEntry.history = nextHistory;
      cacheEntry.lastPingAt = Date.now();
      return nextHistory;
    })();

    cacheEntry.inflight = inflightPromise;
    try {
      return await inflightPromise;
    } finally {
      if (cacheEntry.inflight === inflightPromise) {
        cacheEntry.inflight = undefined;
      }
    }
  };

  let history = await readHistoryForScope(scope);

  if (refreshMode === "always") {
    history = await refreshHistory();
  } else if (
    refreshMode === "missing" &&
    scope.activeConfigs.length > 0 &&
    Object.keys(history).length === 0
  ) {
    history = await refreshHistory();
  }

  return history;
}

export function buildProviderTimelines(
  history: HistorySnapshot,
  maintenanceConfigs: ProviderConfig[]
): ProviderTimeline[] {
  const mapped = Object.entries(history)
    .map<ProviderTimeline | null>(([id, items]) => {
      if (items.length === 0) {
        return null;
      }
      // historySnapshotStore 已按 checkedAt 倒序返回
      const latest = attachOfficialStatus({ ...items[0] });
      return {
        id,
        items,
        latest,
      };
    })
    .filter((timeline): timeline is ProviderTimeline => Boolean(timeline));

  const maintenanceTimelines = maintenanceConfigs.map(createMaintenanceTimeline);

  return [...mapped, ...maintenanceTimelines].sort((a, b) =>
    a.latest.name.localeCompare(b.latest.name)
  );
}

function attachOfficialStatus(result: CheckResult): CheckResult {
  const officialStatus = getOfficialStatus(result.type);
  if (!officialStatus) {
    return result;
  }
  return { ...result, officialStatus };
}

function createMaintenanceTimeline(config: ProviderConfig): ProviderTimeline {
  const base: CheckResult = {
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
    groupName: config.groupName || null,
  };

  return {
    id: config.id,
    items: [],
    latest: attachOfficialStatus(base),
  };
}
