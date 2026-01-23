/**
 * 可用性统计查询模块
 */

import "server-only";

import {createAdminClient} from "../supabase/admin";
import {getPollingIntervalMs} from "../core/polling-config";
import type {AvailabilityStats} from "../types/database";
import type {AvailabilityStat, AvailabilityStatsMap} from "../types";
import {logError} from "../utils";

interface AvailabilityCache {
  data: AvailabilityStatsMap;
  lastFetchedAt: number;
}

interface AvailabilityCacheMetrics {
  hits: number;
  misses: number;
}

const cache: AvailabilityCache = {
  data: {},
  lastFetchedAt: 0,
};

const metrics: AvailabilityCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getAvailabilityCacheMetrics(): AvailabilityCacheMetrics {
  return { ...metrics };
}

export function resetAvailabilityCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

function normalizeIds(ids?: Iterable<string> | null): string[] | null {
  if (!ids) {
    return null;
  }
  const normalized = Array.from(ids).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

function filterStats(
  data: AvailabilityStatsMap,
  ids: string[] | null
): AvailabilityStatsMap {
  if (!ids) {
    return data;
  }
  if (ids.length === 0) {
    return {};
  }
  const result: AvailabilityStatsMap = {};
  for (const id of ids) {
    if (data[id]) {
      result[id] = data[id];
    }
  }
  return result;
}

function mapRows(rows: AvailabilityStats[] | null): AvailabilityStatsMap {
  if (!rows || rows.length === 0) {
    return {};
  }

  const mapped: AvailabilityStatsMap = {};
  for (const row of rows) {
    const entry: AvailabilityStat = {
      period: row.period,
      totalChecks: Number(row.total_checks ?? 0),
      operationalCount: Number(row.operational_count ?? 0),
      availabilityPct:
        row.availability_pct === null ? null : Number(row.availability_pct),
    };

    if (!mapped[row.config_id]) {
      mapped[row.config_id] = [];
    }
    mapped[row.config_id].push(entry);
  }

  return mapped;
}

export async function getAvailabilityStats(
  configIds?: Iterable<string> | null
): Promise<AvailabilityStatsMap> {
  const normalizedIds = normalizeIds(configIds);
  if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
    return {};
  }

  const ttl = getPollingIntervalMs();
  const now = Date.now();
  if (now - cache.lastFetchedAt < ttl && Object.keys(cache.data).length > 0) {
    metrics.hits += 1;
    return filterStats(cache.data, normalizedIds);
  }
  metrics.misses += 1;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("availability_stats")
    .select("config_id, period, total_checks, operational_count, availability_pct");

  if (error) {
    logError("读取可用性统计失败", error);
    return {};
  }

  const mapped = mapRows(data as AvailabilityStats[] | null);
  cache.data = mapped;
  cache.lastFetchedAt = now;

  return filterStats(mapped, normalizedIds);
}
