/**
 * 数据库配置加载模块
 */

import "server-only";
import { createClient } from "../supabase/server";
import type { CheckConfigRow, ProviderConfig, ProviderType } from "../types";
import { logError } from "../utils";

/**
 * 从数据库加载启用的 Provider 配置
 * @returns Provider 配置列表
 */
export async function loadProviderConfigsFromDB(): Promise<ProviderConfig[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("check_configs")
      .select("id, name, type, model, endpoint, api_key, is_maintenance, user_agent, group_name")
      .eq("enabled", true)
      .order("id");

    if (error) {
      logError("从数据库加载配置失败", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("[check-cx] 数据库中没有找到启用的配置");
      return [];
    }

    const configs: ProviderConfig[] = data.map(
      (row: Pick<CheckConfigRow, "id" | "name" | "type" | "model" | "endpoint" | "api_key" | "is_maintenance" | "user_agent" | "group_name">) => ({
        id: row.id,
        name: row.name,
        type: row.type as ProviderType,
        endpoint: row.endpoint,
        model: row.model,
        apiKey: row.api_key,
        is_maintenance: row.is_maintenance,
        userAgent: row.user_agent,
        groupName: row.group_name || null,
      })
    );

    return configs;
  } catch (error) {
    logError("加载配置时发生异常", error);
    return [];
  }
}
