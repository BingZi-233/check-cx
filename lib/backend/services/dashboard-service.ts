import type {
  AvailabilityPeriod,
  AvailabilityStatsMap,
  DashboardData,
  GroupInfoSummary,
  ProviderTimeline,
  RefreshMode,
} from "@/lib/types";
import { UNGROUPED_DISPLAY_NAME, UNGROUPED_KEY } from "@/lib/types";

import { getPollingIntervalLabel, getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import { generateStableEtag } from "@/lib/backend/contracts/http-cache";
import { getAvailabilityStats } from "@/lib/backend/repositories/availability-repository";
import { listProviderConfigs } from "@/lib/backend/repositories/config-repository";
import { findGroupInfo, listGroupInfos } from "@/lib/backend/repositories/group-info-repository";
import { ensureOfficialStatusRuntime } from "@/lib/backend/services/official-status-service";
import { buildProviderTimelines, loadSnapshotForScope } from "@/lib/backend/services/snapshot-service";

interface CacheMetrics {
  hits: number;
  misses: number;
  inflightHits: number;
}

interface CacheEntry<T> {
  data?: T;
  etag?: string;
  expiresAt: number;
  inflight?: Promise<{ data: T; etag: string }>;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const dashboardCache = new Map<string, CacheEntry<DashboardData>>();
const groupCache = new Map<string, CacheEntry<GroupDashboardData | null>>();

const dashboardMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  inflightHits: 0,
};

export interface DashboardLoadResult {
  data: DashboardData;
  etag: string;
}

export interface GroupDashboardData {
  groupName: string;
  displayName: string;
  tags: string;
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
  availabilityStats: AvailabilityStatsMap;
  trendPeriod: AvailabilityPeriod;
  generatedAt: number;
  websiteUrl?: string | null;
}

function getCacheTtlMs(pollIntervalMs: number): number {
  return Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
    ? pollIntervalMs
    : DEFAULT_CACHE_TTL_MS;
}

function getDashboardCacheKey(
  providerKey: string,
  trendPeriod: AvailabilityPeriod,
  pollIntervalMs: number
): string {
  return `dashboard:${pollIntervalMs}:${trendPeriod}:${providerKey}`;
}

function getGroupCacheKey(
  groupName: string,
  providerKey: string,
  trendPeriod: AvailabilityPeriod,
  pollIntervalMs: number
): string {
  return `group:${groupName}:${pollIntervalMs}:${trendPeriod}:${providerKey}`;
}

function getLastUpdated(providerTimelines: ProviderTimeline[]): string | null {
  let lastUpdated: string | null = null;
  let lastUpdatedMs = 0;

  for (const timeline of providerTimelines) {
    const checkedAtMs = Date.parse(timeline.latest.checkedAt);
    if (Number.isFinite(checkedAtMs) && checkedAtMs > lastUpdatedMs) {
      lastUpdatedMs = checkedAtMs;
      lastUpdated = timeline.latest.checkedAt;
    }
  }

  return lastUpdated;
}

function refreshGeneratedAt<T>(value: T): T {
  if (typeof value === "object" && value !== null && "generatedAt" in value) {
    const mutable = value as T & { generatedAt?: number };
    mutable.generatedAt = Date.now();
  }
  return value;
}

function buildGroupInfoSummaries(
  infos: Awaited<ReturnType<typeof listGroupInfos>>
): GroupInfoSummary[] {
  return infos.map((info) => ({
    groupName: info.group_name,
    websiteUrl: info.website_url ?? null,
    tags: info.tags ?? "",
  }));
}

async function buildDashboardPayload(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardLoadResult> {
  ensureOfficialStatusRuntime();

  const allConfigs = await listProviderConfigs();
  const maintenanceConfigs = allConfigs.filter((item) => item.is_maintenance);
  const activeConfigs = allConfigs.filter((item) => !item.is_maintenance);

  const allowedIds = new Set(activeConfigs.map((item) => item.id));
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();
  const trendPeriod = options?.trendPeriod ?? "7d";
  const history = await loadSnapshotForScope(
    {
      cacheKey: getDashboardCacheKey(
        allowedIds.size > 0 ? [...allowedIds].sort().join("|") : "__empty__",
        trendPeriod,
        pollIntervalMs
      ),
      pollIntervalMs,
      activeConfigs,
      allowedIds,
    },
    options?.refreshMode ?? "missing"
  );

  const providerTimelines = buildProviderTimelines(history, maintenanceConfigs);
  const groupInfos = buildGroupInfoSummaries(await listGroupInfos());
  const availabilityStats = await getAvailabilityStats(allConfigs.map((item) => item.id));

  const data: DashboardData = {
    providerTimelines,
    groupInfos,
    lastUpdated: getLastUpdated(providerTimelines),
    total: providerTimelines.length,
    pollIntervalLabel,
    pollIntervalMs,
    availabilityStats,
    trendPeriod,
    generatedAt: Date.now(),
  };

  return {
    etag: generateStableEtag(data),
    data,
  };
}

async function withCache<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  shouldBypassCache: boolean,
  metrics: CacheMetrics | null,
  loader: () => Promise<{ data: T; etag: string }>
): Promise<{ data: T; etag: string }> {
  const now = Date.now();
  if (!shouldBypassCache) {
    const cached = store.get(key);
    if (cached?.data && now < cached.expiresAt) {
      if (metrics) {
        metrics.hits += 1;
      }
      return {
        data: refreshGeneratedAt(cached.data),
        etag: cached.etag ?? generateStableEtag(cached.data as T & { generatedAt?: number }),
      };
    }

    if (cached?.inflight) {
      if (metrics) {
        metrics.inflightHits += 1;
      }
      return cached.inflight;
    }

    if (metrics) {
      metrics.misses += 1;
    }

    const inflight = loader().finally(() => {
      const entry = store.get(key);
      if (entry?.inflight === inflight) {
        delete entry.inflight;
      }
    });

    store.set(key, {
      data: cached?.data,
      etag: cached?.etag,
      expiresAt: cached?.expiresAt ?? 0,
      inflight,
    });

    const result = await inflight;
    store.set(key, {
      data: result.data,
      etag: result.etag,
      expiresAt: Date.now() + ttlMs,
    });
    return result;
  }

  const result = await loader();
  store.set(key, {
    data: result.data,
    etag: result.etag,
    expiresAt: Date.now() + ttlMs,
  });
  return result;
}

export function getDashboardCacheMetrics(): CacheMetrics {
  return { ...dashboardMetrics };
}

export function resetDashboardCacheMetrics(): void {
  dashboardMetrics.hits = 0;
  dashboardMetrics.misses = 0;
  dashboardMetrics.inflightHits = 0;
}

export async function loadDashboardData(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardData> {
  const result = await loadDashboardDataWithEtag(options);
  return result.data;
}

export async function loadDashboardDataWithEtag(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardLoadResult> {
  const refreshMode = options?.refreshMode ?? "missing";
  const trendPeriod = options?.trendPeriod ?? "7d";
  const allConfigs = await listProviderConfigs();
  const activeConfigs = allConfigs.filter((item) => !item.is_maintenance);
  const providerKey =
    activeConfigs.length > 0
      ? activeConfigs.map((item) => item.id).sort().join("|")
      : "__empty__";
  const pollIntervalMs = getPollingIntervalMs();

  return withCache(
    dashboardCache,
    getDashboardCacheKey(providerKey, trendPeriod, pollIntervalMs),
    getCacheTtlMs(pollIntervalMs),
    refreshMode === "always",
    dashboardMetrics,
    () => buildDashboardPayload({ refreshMode, trendPeriod })
  );
}

async function buildGroupPayload(
  targetGroupName: string,
  options?: {
    refreshMode?: RefreshMode;
    trendPeriod?: AvailabilityPeriod;
  }
): Promise<{ data: GroupDashboardData | null; etag: string }> {
  ensureOfficialStatusRuntime();

  const allConfigs = await listProviderConfigs();
  const isUngrouped = targetGroupName === UNGROUPED_KEY;
  const groupConfigs = allConfigs.filter((config) =>
    isUngrouped ? !config.groupName : config.groupName === targetGroupName
  );

  if (groupConfigs.length === 0) {
    return {
      data: null,
      etag: generateStableEtag({ groupName: targetGroupName, generatedAt: 0 }),
    };
  }

  const maintenanceConfigs = groupConfigs.filter((config) => config.is_maintenance);
  const activeConfigs = groupConfigs.filter((config) => !config.is_maintenance);
  const allowedIds = new Set(activeConfigs.map((config) => config.id));
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();
  const trendPeriod = options?.trendPeriod ?? "7d";

  const history = await loadSnapshotForScope(
    {
      cacheKey: getGroupCacheKey(
        targetGroupName,
        allowedIds.size > 0 ? [...allowedIds].sort().join("|") : "__empty__",
        trendPeriod,
        pollIntervalMs
      ),
      pollIntervalMs,
      activeConfigs,
      allowedIds,
    },
    options?.refreshMode ?? "missing"
  );

  const providerTimelines = buildProviderTimelines(history, maintenanceConfigs);
  const availabilityStats = await getAvailabilityStats(groupConfigs.map((config) => config.id));

  let websiteUrl: string | null | undefined;
  let tags = "";
  if (!isUngrouped) {
    const groupInfo = await findGroupInfo(targetGroupName);
    websiteUrl = groupInfo?.website_url ?? null;
    tags = groupInfo?.tags ?? "";
  }

  const data: GroupDashboardData = {
    groupName: targetGroupName,
    displayName: isUngrouped ? UNGROUPED_DISPLAY_NAME : targetGroupName,
    tags,
    providerTimelines,
    lastUpdated: getLastUpdated(providerTimelines),
    total: providerTimelines.length,
    pollIntervalLabel,
    pollIntervalMs,
    availabilityStats,
    trendPeriod,
    generatedAt: Date.now(),
    websiteUrl,
  };

  return {
    data,
    etag: generateStableEtag(data),
  };
}

export async function loadGroupDashboardData(
  targetGroupName: string,
  options?: {
    refreshMode?: RefreshMode;
    trendPeriod?: AvailabilityPeriod;
  }
): Promise<GroupDashboardData | null> {
  const refreshMode = options?.refreshMode ?? "missing";
  const trendPeriod = options?.trendPeriod ?? "7d";
  const allConfigs = await listProviderConfigs();
  const matchingConfigs = allConfigs.filter((config) =>
    targetGroupName === UNGROUPED_KEY ? !config.groupName : config.groupName === targetGroupName
  );
  const activeConfigs = matchingConfigs.filter((config) => !config.is_maintenance);
  const providerKey =
    activeConfigs.length > 0
      ? activeConfigs.map((item) => item.id).sort().join("|")
      : "__empty__";
  const pollIntervalMs = getPollingIntervalMs();

  const result = await withCache(
    groupCache,
    getGroupCacheKey(targetGroupName, providerKey, trendPeriod, pollIntervalMs),
    getCacheTtlMs(pollIntervalMs),
    refreshMode === "always",
    null,
    () => buildGroupPayload(targetGroupName, { refreshMode, trendPeriod })
  );

  return result.data;
}

export async function getAvailableGroups(): Promise<string[]> {
  const allConfigs = await listProviderConfigs();
  const groups = new Set<string>();

  for (const config of allConfigs) {
    if (config.groupName) {
      groups.add(config.groupName);
    }
  }

  if (allConfigs.some((config) => !config.groupName)) {
    groups.add(UNGROUPED_KEY);
  }

  return [...groups].sort();
}
