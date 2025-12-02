/**
 * Provider 相关类型定义
 */

/**
 * 支持的 AI Provider 类型
 */
export type ProviderType = "openai" | "gemini" | "anthropic";

/**
 * Provider 配置
 */
export interface ProviderConfig {
  id: string; // UUID from check_configs table
  name: string;
  type: ProviderType;
  endpoint: string;
  model: string;
  apiKey: string;
  is_maintenance: boolean;
  requestHeaders?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
  groupName?: string | null;
}

/**
 * 默认 API 端点
 */
export const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com",
  anthropic: "https://api.anthropic.com/v1/messages",
};
