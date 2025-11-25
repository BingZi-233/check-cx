/**
 * 数据库表类型定义
 * 对应 Supabase 的 check_configs 和 check_history 表
 */

/**
 * check_configs 表的行类型
 */
export interface CheckConfigRow {
  id: string;
  name: string;
  type: string;
  model: string;
  endpoint: string;
  api_key: string;
  enabled: boolean;
  is_maintenance: boolean;
  user_agent?: string | null;
  group_name?: string | null;
  created_at?: string;
}

/**
 * check_history 表的行类型
 */
export interface CheckHistoryRow {
  id: string;
  config_id: string;
  status: string;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at: string;
  message: string | null;
}
