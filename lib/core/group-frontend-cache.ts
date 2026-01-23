/**
 * 分组页面前端内存缓存模块（SWR）
 */

import type {AvailabilityPeriod} from "../types";
import type {GroupDashboardData} from "./group-data";

/** 缓存有效期默认值：5 分钟 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface GroupCacheMetrics {
  hits: number;
  misses: number;
  staleHits: number;
  forcedRefreshes: number;
}

const metrics: GroupCacheMetrics = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  forcedRefreshes: 0,
};

const globalMetrics = globalThis as Record<string, unknown>;
if (typeof window !== "undefined") {
  globalMetrics.__CHECK_CX_GROUP_CACHE_METRICS__ = metrics;
}

function recordHit(isStale: boolean): void {
  metrics.hits += 1;
  if (isStale) {
    metrics.staleHits += 1;
  }
}

function recordMiss(isForced: boolean): void {
  metrics.misses += 1;
  if (isForced) {
    metrics.forcedRefreshes += 1;
  }
}

export function getGroupCacheMetrics(): GroupCacheMetrics {
  return { ...metrics };
}

export function resetGroupCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.staleHits = 0;
  metrics.forcedRefreshes = 0;
}

interface CacheEntry {
  data: GroupDashboardData;
  timestamp: number;
  etag?: string;
  ttlMs: number;
}

function getCacheKey(groupName: string, trendPeriod: AvailabilityPeriod): string {
  return `group:${groupName}:${trendPeriod}`;
}

const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<GroupDashboardData | null>>();

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp >= entry.ttlMs;
}

function isFresh(entry: CacheEntry): boolean {
  return !isExpired(entry);
}

export function getGroupCache(
  groupName: string,
  trendPeriod: AvailabilityPeriod
): CacheEntry | null {
  const key = getCacheKey(groupName, trendPeriod);
  const entry = cache.get(key);
  return entry ?? null;
}

export function setGroupCache(
  groupName: string,
  trendPeriod: AvailabilityPeriod,
  data: GroupDashboardData,
  etag?: string
): void {
  const key = getCacheKey(groupName, trendPeriod);
  const ttlMs =
    Number.isFinite(data.pollIntervalMs) && data.pollIntervalMs > 0
      ? data.pollIntervalMs
      : DEFAULT_CACHE_TTL_MS;
  cache.set(key, {
    data,
    timestamp: Date.now(),
    etag,
    ttlMs,
  });
}

function touchCache(groupName: string, trendPeriod: AvailabilityPeriod): void {
  const key = getCacheKey(groupName, trendPeriod);
  const entry = cache.get(key);
  if (entry) {
    entry.timestamp = Date.now();
  }
}

export function clearGroupCache(): void {
  cache.clear();
}

export async function prefetchGroupData(
  groupName: string,
  periods: AvailabilityPeriod[],
  currentPeriod?: AvailabilityPeriod
): Promise<void> {
  const targets = periods.filter((period) => period !== currentPeriod);
  await Promise.all(
    targets.map(async (trendPeriod) => {
      const key = getCacheKey(groupName, trendPeriod);
      const cached = cache.get(key);
      if (cached && isFresh(cached)) {
        return;
      }
      if (pendingRequests.has(key)) {
        return;
      }

      const request = fetchFromNetwork(groupName, trendPeriod, cached?.etag)
        .then(({ data, etag }) => {
          if (data) {
            setGroupCache(groupName, trendPeriod, data, etag);
          } else if (cached) {
            touchCache(groupName, trendPeriod);
          }
          return data;
        })
        .catch((error) => {
          console.error("[check-cx] 预取分组数据失败", error);
          return null;
        })
        .finally(() => {
          pendingRequests.delete(key);
        });

      pendingRequests.set(key, request);
      await request;
    })
  );
}

async function fetchFromNetwork(
  groupName: string,
  trendPeriod: AvailabilityPeriod,
  etag?: string,
  forceFresh?: boolean
): Promise<{ data: GroupDashboardData | null; etag?: string }> {
  const params = new URLSearchParams({ trendPeriod });
  if (forceFresh) {
    params.set("forceRefresh", "1");
    params.set("_t", String(Date.now()));
  }

  const headers: HeadersInit = {};
  if (etag) {
    headers["If-None-Match"] = etag;
  }

  const response = await fetch(
    `/api/group/${encodeURIComponent(groupName)}?${params.toString()}`,
    { headers }
  );

  if (response.status === 304) {
    return { data: null, etag };
  }

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const data = (await response.json()) as GroupDashboardData;
  const newEtag = response.headers.get("ETag") ?? undefined;

  return { data, etag: newEtag };
}

function revalidateInBackground(
  groupName: string,
  trendPeriod: AvailabilityPeriod,
  etag?: string,
  onUpdate?: (data: GroupDashboardData) => void
): void {
  const key = getCacheKey(groupName, trendPeriod);

  if (pendingRequests.has(key)) {
    return;
  }

  const request = fetchFromNetwork(groupName, trendPeriod, etag)
    .then(({ data, etag: newEtag }) => {
      if (data) {
        setGroupCache(groupName, trendPeriod, data, newEtag);
        onUpdate?.(data);
        return data;
      }
      touchCache(groupName, trendPeriod);
      return null;
    })
    .catch((error) => {
      console.error("[check-cx] 分组后台刷新失败", error);
      return null;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
}

export interface FetchGroupWithCacheOptions {
  groupName: string;
  trendPeriod: AvailabilityPeriod;
  forceFresh?: boolean;
  onBackgroundUpdate?: (data: GroupDashboardData) => void;
  revalidateIfFresh?: boolean;
}

export interface FetchGroupWithCacheResult {
  data: GroupDashboardData;
  fromCache: boolean;
  isRevalidating: boolean;
}

export async function fetchGroupWithCache(
  options: FetchGroupWithCacheOptions
): Promise<FetchGroupWithCacheResult> {
  const {
    groupName,
    trendPeriod,
    forceFresh,
    onBackgroundUpdate,
    revalidateIfFresh,
  } = options;
  const cached = getGroupCache(groupName, trendPeriod);
  const key = getCacheKey(groupName, trendPeriod);

  if (forceFresh) {
    const { data, etag } = await fetchFromNetwork(
      groupName,
      trendPeriod,
      undefined,
      true
    );
    if (data) {
      recordMiss(true);
      setGroupCache(groupName, trendPeriod, data, etag);
      return { data, fromCache: false, isRevalidating: false };
    }
    if (cached) {
      recordHit(true);
      return { data: cached.data, fromCache: true, isRevalidating: false };
    }
    throw new Error("无数据可用");
  }

  if (cached && !isExpired(cached)) {
    if (revalidateIfFresh) {
      revalidateInBackground(
        groupName,
        trendPeriod,
        cached.etag,
        onBackgroundUpdate
      );
      recordHit(false);
      return { data: cached.data, fromCache: true, isRevalidating: true };
    }
    recordHit(false);
    return { data: cached.data, fromCache: true, isRevalidating: false };
  }

  if (cached) {
    revalidateInBackground(groupName, trendPeriod, cached.etag, onBackgroundUpdate);
    recordHit(true);
    return { data: cached.data, fromCache: true, isRevalidating: true };
  }

  const inflight = pendingRequests.get(key);
  if (inflight) {
    const data = await inflight;
    const latestCache = getGroupCache(groupName, trendPeriod);
    if (data) {
      recordHit(false);
      return { data, fromCache: true, isRevalidating: false };
    }
    if (latestCache) {
      recordHit(true);
      return { data: latestCache.data, fromCache: true, isRevalidating: false };
    }
  }

  const { data, etag } = await fetchFromNetwork(groupName, trendPeriod);
  if (data) {
    recordMiss(false);
    setGroupCache(groupName, trendPeriod, data, etag);
    return { data, fromCache: false, isRevalidating: false };
  }

  throw new Error("无数据可用");
}
