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
  request_header?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
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

/**
 * group_info 表的行类型
 */
export interface GroupInfoRow {
  id: string;
  group_name: string;
  website_url?: string | null;
  tags?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * system_notifications 表的行类型
 */
export interface SystemNotificationRow {
  id: string;
  message: string;
  is_active: boolean;
  level: "info" | "warning" | "error";
  created_at: string;
}
