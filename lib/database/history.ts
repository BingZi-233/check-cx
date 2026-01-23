/**
 * 历史记录管理模块
 */

import "server-only";
import type {PostgrestError} from "@supabase/supabase-js";
import {createAdminClient} from "../supabase/admin";
import type {CheckResult, HistorySnapshot} from "../types";
import {logError} from "../utils";

/**
 * 每个 Provider 最多保留的历史记录数
 */
export const MAX_POINTS_PER_PROVIDER = 60;

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

export const HISTORY_RETENTION_DAYS = (() => {
  const raw = Number(process.env.HISTORY_RETENTION_DAYS);
  if (Number.isFinite(raw)) {
    return Math.max(MIN_RETENTION_DAYS, Math.min(MAX_RETENTION_DAYS, raw));
  }
  return DEFAULT_RETENTION_DAYS;
})();

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

/**
 * SnapshotStore 负责与数据库交互，提供统一的读/写/清理接口
 */
class SnapshotStore {
  async fetch(options?: HistoryQueryOptions): Promise<HistorySnapshot> {
    const normalizedIds = normalizeAllowedIds(options?.allowedIds);
    if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
      return {};
    }

    const supabase = createAdminClient();
    const limitPerConfig = options?.limitPerConfig ?? MAX_POINTS_PER_PROVIDER;
    const { data, error } = await supabase.rpc(
      RPC_RECENT_HISTORY,
      {
        limit_per_config: limitPerConfig,
        target_config_ids: normalizedIds,
      }
    );

    if (error) {
      logError("获取历史快照失败", error);
      if (isMissingFunctionError(error)) {
        return fallbackFetchSnapshot(supabase, normalizedIds);
      }
      return {};
    }

    return mapRowsToSnapshot(data as RpcHistoryRow[] | null, limitPerConfig);
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
      logError("写入历史记录失败", error);
      return;
    }

    await this.pruneInternal(supabase);
  }

  async prune(retentionDays: number = HISTORY_RETENTION_DAYS): Promise<void> {
    const supabase = createAdminClient();
    await this.pruneInternal(supabase, retentionDays);
  }

  private async pruneInternal(
    supabase: AdminClient,
    retentionDays: number = HISTORY_RETENTION_DAYS
  ): Promise<void> {
    const { error } = await supabase.rpc(RPC_PRUNE_HISTORY, {
      retention_days: retentionDays,
    });

    if (error) {
      logError("清理历史记录失败", error);
      if (isMissingFunctionError(error)) {
        await fallbackPruneHistory(supabase, retentionDays);
      }
    }
  }
}

export const historySnapshotStore = new SnapshotStore();

/**
 * 兼容旧接口：读取全部历史快照
 */
export async function loadHistory(
  options?: HistoryQueryOptions
): Promise<HistorySnapshot> {
  return historySnapshotStore.fetch(options);
}

/**
 * 兼容旧接口：写入并返回最新快照
 */
export async function appendHistory(
  results: CheckResult[]
): Promise<HistorySnapshot> {
  await historySnapshotStore.append(results);
  return historySnapshotStore.fetch();
}

function normalizeAllowedIds(
  ids?: Iterable<string> | null
): string[] | null {
  if (!ids) {
    return null;
  }
  const array = Array.from(ids).filter(Boolean);
  return array.length > 0 ? array : [];
}

function mapRowsToSnapshot(
  rows: RpcHistoryRow[] | null,
  limitPerConfig: number = MAX_POINTS_PER_PROVIDER
): HistorySnapshot {
  if (!rows || rows.length === 0) {
    return {};
  }

  const history: HistorySnapshot = {};
  for (const row of rows) {
    const result: CheckResult = {
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

    if (!history[result.id]) {
      history[result.id] = [];
    }
    history[result.id].push(result);
  }

  for (const key of Object.keys(history)) {
    history[key] = history[key]
      .sort(
        (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      )
      .slice(0, limitPerConfig);
  }

  return history;
}

function isMissingFunctionError(error: PostgrestError | null): boolean {
  if (!error?.message) {
    return false;
  }
  return (
    error.message.includes(RPC_RECENT_HISTORY) ||
    error.message.includes(RPC_PRUNE_HISTORY)
  );
}

async function fallbackFetchSnapshot(
  supabase: AdminClient,
  allowedIds: string[] | null
): Promise<HistorySnapshot> {
  try {
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
          model,
          endpoint,
          group_name
        )
      `
      )
      .order("checked_at", { ascending: false });

    if (allowedIds) {
      query = query.in("config_id", allowedIds);
    }

    const { data, error } = await query;
    if (error) {
      logError("fallback 模式下读取历史失败", error);
      return {};
    }

    const history: HistorySnapshot = {};
    for (const record of data || []) {
      const configs = record.check_configs;
      if (!configs || !Array.isArray(configs) || configs.length === 0) {
        continue;
      }
      const config = configs[0];

      const result: CheckResult = {
        id: config.id,
        name: config.name,
        type: config.type,
        endpoint: config.endpoint,
        model: config.model,
        status: record.status as CheckResult["status"],
        latencyMs: record.latency_ms,
        pingLatencyMs: record.ping_latency_ms ?? null,
        checkedAt: record.checked_at,
        message: record.message ?? "",
        groupName: config.group_name ?? null,
      };

      if (!history[result.id]) {
        history[result.id] = [];
      }
      history[result.id].push(result);
    }

    for (const key of Object.keys(history)) {
      history[key] = history[key]
        .sort(
          (a, b) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
        )
        .slice(0, MAX_POINTS_PER_PROVIDER);
    }

    return history;
  } catch (error) {
    logError("fallback 模式下读取历史异常", error);
    return {};
  }
}

async function fallbackPruneHistory(
  supabase: AdminClient,
  retentionDays: number
): Promise<void> {
  try {
    const effectiveDays = Math.max(
      MIN_RETENTION_DAYS,
      Math.min(MAX_RETENTION_DAYS, retentionDays)
    );
    const cutoff = new Date(
      Date.now() - effectiveDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: deleteError } = await supabase
      .from("check_history")
      .delete()
      .lt("checked_at", cutoff);

    if (deleteError) {
      logError("fallback 模式下删除历史失败", deleteError);
    }
  } catch (error) {
    logError("fallback 模式下清理历史异常", error);
  }
}

