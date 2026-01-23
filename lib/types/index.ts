/**
 * 统一类型导出入口
 * 所有外部模块应从此文件导入类型
 */

// 数据库类型
export type { CheckConfigRow, CheckHistoryRow } from "./database";

// Provider 类型
export type { ProviderType, ProviderConfig } from "./provider";
export { DEFAULT_ENDPOINTS } from "./provider";

// 检查结果类型
export type { HealthStatus, CheckResult } from "./check";

// 官方状态类型
export type { OfficialHealthStatus, OfficialStatusResult } from "./official-status";

// Dashboard 类型
export type {
  TimelineItem,
  ProviderTimeline,
  GroupedProviderTimelines,
  DashboardData,
  GroupInfoSummary,
  AvailabilityPeriod,
  AvailabilityStat,
  AvailabilityStatsMap,
  RefreshMode,
  PingCacheEntry,
  HistorySnapshot,
} from "./dashboard";

// 常量
export { UNGROUPED_KEY, UNGROUPED_DISPLAY_NAME } from "./constants";
