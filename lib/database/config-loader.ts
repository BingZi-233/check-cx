/**
 * 数据库配置加载模块
 */

import "server-only";
import {createAdminClient} from "../supabase/admin";
import {getPollingIntervalMs} from "../core/polling-config";
import type {CheckConfigRow, ProviderConfig, ProviderType} from "../types";
import {logError} from "../utils";

interface ConfigCache {
  data: ProviderConfig[];
  lastFetchedAt: number;
}

interface ConfigCacheMetrics {
  hits: number;
  misses: number;
}

const cache: ConfigCache = {
  data: [],
  lastFetchedAt: 0,
};

const metrics: ConfigCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getConfigCacheMetrics(): ConfigCacheMetrics {
  return { ...metrics };
}

export function resetConfigCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

/**
 * 从数据库加载启用的 Provider 配置
 * @returns Provider 配置列表
 */
export async function loadProviderConfigsFromDB(options?: {
  forceRefresh?: boolean;
}): Promise<ProviderConfig[]> {
  try {
    const now = Date.now();
    const ttl = getPollingIntervalMs();
    if (!options?.forceRefresh && now - cache.lastFetchedAt < ttl) {
      metrics.hits += 1;
      return cache.data;
    }
    metrics.misses += 1;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("check_configs")
      .select("id, name, type, model, endpoint, api_key, is_maintenance, request_header, metadata, group_name")
      .eq("enabled", true)
      .order("id");

    if (error) {
      logError("从数据库加载配置失败", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("[check-cx] 数据库中没有找到启用的配置");
      cache.data = [];
      cache.lastFetchedAt = now;
      return [];
    }

    const configs: ProviderConfig[] = data.map(
      (row: Pick<CheckConfigRow, "id" | "name" | "type" | "model" | "endpoint" | "api_key" | "is_maintenance" | "request_header" | "metadata" | "group_name">) => ({
        id: row.id,
        name: row.name,
        type: row.type as ProviderType,
        endpoint: row.endpoint,
        model: row.model,
        apiKey: row.api_key,
        is_maintenance: row.is_maintenance,
        requestHeaders: row.request_header || null,
        metadata: row.metadata || null,
        groupName: row.group_name || null,
      })
    );

    cache.data = configs;
    cache.lastFetchedAt = now;
    return configs;
  } catch (error) {
    logError("加载配置时发生异常", error);
    return [];
  }
}
