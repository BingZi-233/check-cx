/**
 * 历史记录管理模块
 */

import "server-only";
import { createClient } from "../supabase/server";
import type { CheckResult, HistorySnapshot } from "../types";
import { logError } from "../utils";

/**
 * 每个 Provider 最多保留的历史记录数
 */
const MAX_POINTS_PER_PROVIDER = 60;

/**
 * 从数据库加载历史记录
 * 语义：按 Provider 加载“最新的最多 60 条记录”，不再按固定时间窗口截断
 * @returns 按 config_id 分组的历史记录
 */
export async function loadHistory(): Promise<HistorySnapshot> {
  try {
    const supabase = await createClient();

    // 从数据库查询最新的记录,使用 JOIN 获取配置信息
    const { data, error } = await supabase
      .from("check_history")
      .select(
        `
        *,
        check_configs!fk_config (
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

    if (error) {
      logError("从数据库读取历史记录失败", error);
      return {};
    }

    // 转换为 HistorySnapshot 格式
    const history: HistorySnapshot = {};
    for (const record of data || []) {
      const config = record.check_configs;
      if (!config) {
        console.warn(`[check-cx] 记录 ${record.id} 的配置不存在,跳过`);
        continue;
      }

      const result: CheckResult = {
        id: config.id,
        name: config.name,
        type: config.type,
        endpoint: config.endpoint,
        model: config.model,
        status: record.status as "operational" | "degraded" | "failed",
        latencyMs: record.latency_ms,
        pingLatencyMs: record.ping_latency_ms ?? null,
        checkedAt: record.checked_at,
        message: record.message || "",
        groupName: config.group_name || null,
      };

      if (!history[result.id]) {
        history[result.id] = [];
      }
      history[result.id].push(result);
    }

    // 对每个提供商的记录进行排序和限制
    for (const key of Object.keys(history)) {
      history[key] = history[key]
        .sort(
          (a, b) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
        )
        .slice(0, MAX_POINTS_PER_PROVIDER);

      if (history[key].length === 0) {
        delete history[key];
      }
    }

    return history;
  } catch (error) {
    logError("读取历史记录失败", error);
    return {};
  }
}

/**
 * 追加新的检查结果到历史记录
 * @param results 检查结果列表
 * @returns 更新后的历史记录
 */
export async function appendHistory(
  results: CheckResult[]
): Promise<HistorySnapshot> {
  if (results.length === 0) {
    return loadHistory();
  }

  try {
    const supabase = await createClient();

    // 将结果写入数据库,仅写入必要字段
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
      logError("写入数据库失败", error);
    }

    // 清理超出限制的数据（每个提供商只保留最新 60 条记录）
    await cleanupOldHistory();

    return loadHistory();
  } catch (error) {
    logError("追加历史记录失败", error);
    return loadHistory();
  }
}

/**
 * 清理超出保留数量的旧历史记录
 */
async function cleanupOldHistory(): Promise<void> {
  try {
    const supabase = await createClient();

    // 获取所有唯一的 config_id
    const { data: providers, error: providerError } = await supabase
      .from("check_history")
      .select("config_id")
      .order("config_id");

    if (providerError) {
      logError("查询 config_id 失败", providerError);
      return;
    }

    if (!providers) {
      return;
    }

    // 去重获取唯一的 config_id
    const uniqueProviders = [...new Set(providers.map((p) => p.config_id))];

    // 对每个提供商,删除超出限制的旧记录
    for (const configId of uniqueProviders) {
      // 获取该提供商的所有记录,按时间倒序
      const { data: records, error: recordError } = await supabase
        .from("check_history")
        .select("id, checked_at")
        .eq("config_id", configId)
        .order("checked_at", { ascending: false });

      if (recordError) {
        logError(`查询 config ${configId} 的记录失败`, recordError);
        continue;
      }

      // 如果超过 60 条,删除多余的旧记录
      if (records && records.length > MAX_POINTS_PER_PROVIDER) {
        const recordsToDelete = records
          .slice(MAX_POINTS_PER_PROVIDER)
          .map((r) => r.id);

        const { error: deleteError } = await supabase
          .from("check_history")
          .delete()
          .in("id", recordsToDelete);

        if (deleteError) {
          logError(`删除 config ${configId} 的旧记录失败`, deleteError);
        }
      }
    }
  } catch (error) {
    logError("清理数据时发生错误", error);
  }
}
