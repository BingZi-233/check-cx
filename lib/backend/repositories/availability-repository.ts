import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import { logError } from "@/lib/utils";
import type { AvailabilityStat, AvailabilityStatsMap } from "@/lib/types";
import type { AvailabilityStats } from "@/lib/types/database";

interface CacheMetrics {
  hits: number;
  misses: number;
}

const cache = {
  data: {} as AvailabilityStatsMap,
  lastFetchedAt: 0,
};

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
};

function normalizeIds(ids?: Iterable<string> | null): string[] | null {
  if (!ids) {
    return null;
  }
  const normalized = Array.from(ids).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

function filterStats(data: AvailabilityStatsMap, ids: string[] | null): AvailabilityStatsMap {
  if (!ids) {
    return data;
  }
  if (ids.length === 0) {
    return {};
  }

  const filtered: AvailabilityStatsMap = {};
  for (const id of ids) {
    if (data[id]) {
      filtered[id] = data[id];
    }
  }
  return filtered;
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
      availabilityPct: row.availability_pct === null ? null : Number(row.availability_pct),
    };
    if (!mapped[row.config_id]) {
      mapped[row.config_id] = [];
    }
    mapped[row.config_id].push(entry);
  }
  return mapped;
}

export function getAvailabilityRepositoryMetrics(): CacheMetrics {
  return { ...metrics };
}

export function resetAvailabilityRepositoryMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

export async function getAvailabilityStats(
  configIds?: Iterable<string> | null
): Promise<AvailabilityStatsMap> {
  const normalizedIds = normalizeIds(configIds);
  if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
    return {};
  }

  const now = Date.now();
  if (now - cache.lastFetchedAt < getPollingIntervalMs() && Object.keys(cache.data).length > 0) {
    metrics.hits += 1;
    return filterStats(cache.data, normalizedIds);
  }

  metrics.misses += 1;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("availability_stats")
    .select("config_id, period, total_checks, operational_count, availability_pct")
    .order("config_id", { ascending: true })
    .order("period", { ascending: true });

  if (error) {
    logError("availabilityRepository.getAvailabilityStats", error);
    return {};
  }

  const mapped = mapRows((data ?? []) as AvailabilityStats[]);
  cache.data = mapped;
  cache.lastFetchedAt = now;
  return filterStats(mapped, normalizedIds);
}
