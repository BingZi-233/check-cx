/**
 * 健康检查相关类型定义
 */

import type { ProviderType } from "./provider";
import type { OfficialStatusResult } from "./official-status";

/**
 * Provider 健康状态
 */
export type HealthStatus = "operational" | "degraded" | "failed" | "maintenance";

/**
 * 单次检查结果
 */
export interface CheckResult {
  id: string; // config_id from database
  name: string;
  type: ProviderType;
  endpoint: string;
  model: string;
  status: HealthStatus;
  latencyMs: number | null; // 对话首字延迟
  pingLatencyMs: number | null; // 端点 Ping 延迟
  checkedAt: string; // ISO 8601 timestamp
  message: string;
  officialStatus?: OfficialStatusResult; // 官方服务状态(可选)
  groupName?: string | null; // 分组名称
}
