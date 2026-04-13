import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import { logError } from "@/lib/utils";
import type { CheckConfigRow, ProviderConfig, ProviderType } from "@/lib/types";
import type { CheckModelRow, CheckRequestTemplateRow } from "@/lib/types/database";

type JsonRecord = Record<string, unknown>;
type TemplateProjection = Pick<
  CheckRequestTemplateRow,
  "type" | "request_header" | "metadata"
>;
type ModelProjection = Pick<CheckModelRow, "id" | "type" | "model" | "template_id"> & {
  check_request_templates?: TemplateProjection | TemplateProjection[] | null;
};
type ConfigRowWithModel = Pick<
  CheckConfigRow,
  "id" | "name" | "type" | "model_id" | "endpoint" | "api_key" | "is_maintenance" | "group_name"
> & {
  check_models?: ModelProjection | ModelProjection[] | null;
};

interface RepositoryCache<T> {
  data: T;
  lastFetchedAt: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
}

const cache: RepositoryCache<ProviderConfig[]> = {
  data: [],
  lastFetchedAt: 0,
};

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
};

function normalizeJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function getModel(row: ConfigRowWithModel): ModelProjection | null {
  const model = Array.isArray(row.check_models) ? row.check_models[0] : row.check_models;
  if (!model || model.type !== row.type) {
    return null;
  }
  return model;
}

function getTemplate(row: ConfigRowWithModel): TemplateProjection | null {
  const model = getModel(row);
  const template = Array.isArray(model?.check_request_templates)
    ? model?.check_request_templates[0]
    : model?.check_request_templates;

  if (!template || template.type !== row.type) {
    return null;
  }
  return template;
}

function mapConfig(row: ConfigRowWithModel): ProviderConfig {
  const model = getModel(row);
  const template = getTemplate(row);

  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderType,
    endpoint: row.endpoint,
    model: model?.model ?? "",
    apiKey: row.api_key,
    is_maintenance: row.is_maintenance,
    requestHeaders: normalizeJsonRecord(template?.request_header) as Record<string, string> | null,
    metadata: normalizeJsonRecord(template?.metadata),
    groupName: row.group_name ?? null,
  };
}

export function getConfigRepositoryMetrics(): CacheMetrics {
  return { ...metrics };
}

export function resetConfigRepositoryMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

export async function listProviderConfigs(options?: {
  forceRefresh?: boolean;
}): Promise<ProviderConfig[]> {
  const now = Date.now();
  if (!options?.forceRefresh && now - cache.lastFetchedAt < getPollingIntervalMs()) {
    metrics.hits += 1;
    return cache.data;
  }

  metrics.misses += 1;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("check_configs")
      .select(
        "id, name, type, model_id, endpoint, api_key, is_maintenance, group_name, check_models(id, type, model, template_id, check_request_templates(type, request_header, metadata))"
      )
      .eq("enabled", true)
      .order("id");

    if (error) {
      logError("configRepository.listProviderConfigs", error);
      return [];
    }

    const configs = ((data ?? []) as ConfigRowWithModel[]).map(mapConfig);
    cache.data = configs;
    cache.lastFetchedAt = now;
    return configs;
  } catch (error) {
    logError("configRepository.listProviderConfigs.unexpected", error);
    return [];
  }
}
