import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import type { GroupInfoRow } from "@/lib/types/database";
import { logError } from "@/lib/utils";

interface CacheMetrics {
  hits: number;
  misses: number;
}

const cache = {
  data: [] as GroupInfoRow[],
  lastFetchedAt: 0,
};

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getGroupInfoRepositoryMetrics(): CacheMetrics {
  return { ...metrics };
}

export function resetGroupInfoRepositoryMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

export async function listGroupInfos(options?: {
  forceRefresh?: boolean;
}): Promise<GroupInfoRow[]> {
  const now = Date.now();
  if (!options?.forceRefresh && now - cache.lastFetchedAt < getPollingIntervalMs()) {
    metrics.hits += 1;
    return cache.data;
  }

  metrics.misses += 1;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("group_info")
    .select("*")
    .order("group_name", { ascending: true });

  if (error) {
    logError("groupInfoRepository.listGroupInfos", error);
    return [];
  }

  const rows = (data ?? []) as GroupInfoRow[];
  cache.data = rows;
  cache.lastFetchedAt = now;
  return rows;
}

export async function findGroupInfo(groupName: string): Promise<GroupInfoRow | null> {
  const infos = await listGroupInfos();
  return infos.find((item) => item.group_name === groupName) ?? null;
}
