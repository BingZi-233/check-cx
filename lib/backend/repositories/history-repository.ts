import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getHistoryRetentionDays } from "@/lib/backend/config/runtime-config";
import { logError } from "@/lib/utils";
import type { CheckResult, HistorySnapshot } from "@/lib/types";

export const MAX_POINTS_PER_PROVIDER = 60;

const RPC_RECENT_HISTORY = "get_recent_check_history";
const RPC_PRUNE_HISTORY = "prune_check_history";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface HistoryQueryOptions {
  allowedIds?: Iterable<string> | null;
  limitPerConfig?: number;
}

interface RpcHistoryRow {
  config_id: string;
  status: string;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at: string;
  message: string | null;
  name: string;
  type: string;
  model: string;
  endpoint: string | null;
  group_name: string | null;
}

function normalizeAllowedIds(ids?: Iterable<string> | null): string[] | null {
  if (!ids) {
    return null;
  }
  const normalized = Array.from(ids).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

function isMissingFunctionError(error: PostgrestError | null): boolean {
  if (!error?.message) {
    return false;
  }
  return error.message.includes(RPC_RECENT_HISTORY) || error.message.includes(RPC_PRUNE_HISTORY);
}

function mapRowsToSnapshot(
  rows: RpcHistoryRow[] | null,
  limitPerConfig: number
): HistorySnapshot {
  if (!rows || rows.length === 0) {
    return {};
  }

  const snapshot: HistorySnapshot = {};
  for (const row of rows) {
    const item: CheckResult = {
      id: row.config_id,
      name: row.name,
      type: row.type as CheckResult["type"],
      endpoint: row.endpoint ?? "",
      model: row.model,
      status: row.status as CheckResult["status"],
      latencyMs: row.latency_ms,
      pingLatencyMs: row.ping_latency_ms,
      checkedAt: row.checked_at,
      message: row.message ?? "",
      groupName: row.group_name,
    };

    if (!snapshot[item.id]) {
      snapshot[item.id] = [];
    }
    snapshot[item.id].push(item);
  }

  for (const key of Object.keys(snapshot)) {
    snapshot[key] = snapshot[key]
      .sort((left, right) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt))
      .slice(0, limitPerConfig);
  }

  return snapshot;
}

async function fallbackFetchSnapshot(
  supabase: AdminClient,
  allowedIds: string[] | null
): Promise<HistorySnapshot> {
  let query = supabase
    .from("check_history")
    .select(
      `
      id,
      config_id,
      status,
      latency_ms,
      ping_latency_ms,
      checked_at,
      message,
      check_configs (
        id,
        name,
        type,
        endpoint,
        group_name,
        check_models (
          model
        )
      )
    `
    )
    .order("checked_at", { ascending: false });

  if (allowedIds) {
    query = query.in("config_id", allowedIds);
  }

  const { data, error } = await query;
  if (error) {
    logError("historyRepository.fallbackFetchSnapshot", error);
    return {};
  }

  const snapshot: HistorySnapshot = {};
  for (const row of data ?? []) {
    const config = Array.isArray(row.check_configs) ? row.check_configs[0] : row.check_configs;
    const modelRecord = Array.isArray(config?.check_models)
      ? config.check_models[0]
      : (config?.check_models as { model?: string } | undefined);
    const modelValue = modelRecord?.model;

    if (!config?.id) {
      continue;
    }

    const item: CheckResult = {
      id: config.id,
      name: config.name,
      type: config.type as CheckResult["type"],
      endpoint: config.endpoint,
      model: modelValue ?? "",
      status: row.status as CheckResult["status"],
      latencyMs: row.latency_ms,
      pingLatencyMs: row.ping_latency_ms,
      checkedAt: row.checked_at,
      message: row.message ?? "",
      groupName: config.group_name ?? null,
    };

    if (!snapshot[item.id]) {
      snapshot[item.id] = [];
    }
    snapshot[item.id].push(item);
  }

  for (const key of Object.keys(snapshot)) {
    snapshot[key] = snapshot[key].slice(0, MAX_POINTS_PER_PROVIDER);
  }

  return snapshot;
}

async function fallbackPruneHistory(
  supabase: AdminClient,
  retentionDays: number
): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("check_history").delete().lt("checked_at", cutoff);
  if (error) {
    logError("historyRepository.fallbackPruneHistory", error);
  }
}

class HistoryRepository {
  async fetch(options?: HistoryQueryOptions): Promise<HistorySnapshot> {
    const normalizedIds = normalizeAllowedIds(options?.allowedIds);
    if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
      return {};
    }

    const limitPerConfig = options?.limitPerConfig ?? MAX_POINTS_PER_PROVIDER;
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc(RPC_RECENT_HISTORY, {
      limit_per_config: limitPerConfig,
      target_config_ids: normalizedIds,
    });

    if (error) {
      logError("historyRepository.fetch", error);
      if (isMissingFunctionError(error)) {
        return fallbackFetchSnapshot(supabase, normalizedIds);
      }
      return {};
    }

    return mapRowsToSnapshot((data ?? []) as RpcHistoryRow[], limitPerConfig);
  }

  async append(results: CheckResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    const supabase = createAdminClient();
    const records = results.map((result) => ({
      config_id: result.id,
      status: result.status,
      latency_ms: result.latencyMs,
      ping_latency_ms: result.pingLatencyMs,
      checked_at: result.checkedAt,
      message: result.message,
    }));

    const { error } = await supabase.from("check_history").insert(records);
    if (error) {
      logError("historyRepository.append", error);
      return;
    }

    await this.pruneInternal(supabase, getHistoryRetentionDays());
  }

  async prune(retentionDays = getHistoryRetentionDays()): Promise<void> {
    const supabase = createAdminClient();
    await this.pruneInternal(supabase, retentionDays);
  }

  private async pruneInternal(
    supabase: AdminClient,
    retentionDays: number
  ): Promise<void> {
    const { error } = await supabase.rpc(RPC_PRUNE_HISTORY, {
      retention_days: retentionDays,
    });

    if (error) {
      logError("historyRepository.pruneInternal", error);
      if (isMissingFunctionError(error)) {
        await fallbackPruneHistory(supabase, retentionDays);
      }
    }
  }
}

export const historyRepository = new HistoryRepository();
