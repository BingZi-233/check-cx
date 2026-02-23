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
 * availability_stats 视图的行类型
 */
export interface AvailabilityStats {
  config_id: string;
  period: "7d" | "15d" | "30d";
  total_checks: number;
  operational_count: number;
  availability_pct: number | null;
}

/**
 * group_info 表的行类型
 */
export interface GroupInfoRow {
  id: string;
  group_name: string;
  website_url?: string | null;
  tags?: string | null;
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

export interface AlertChannelRow {
  id: string;
  name: string;
  type: "webhook" | "feishu" | "dingtalk";
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface AlertRuleRow {
  id: string;
  name: string;
  condition_type: "status_change" | "consecutive_failures" | "latency_threshold";
  condition_params: Record<string, unknown>;
  channel_ids: string[];
  config_ids: string[] | null;
  enabled: boolean;
  cooldown_seconds: number;
  created_at: string;
}

export interface AlertHistoryRow {
  id: string;
  rule_id: string;
  channel_id: string;
  config_id: string;
  status: "sent" | "failed" | "skipped";
  payload: Record<string, unknown> | null;
  error_message: string | null;
  triggered_at: string;
}
