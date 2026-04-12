import type {HealthStatus, OfficialHealthStatus, ProviderType} from "../types";

export const STATUS_META: Record<
  HealthStatus,
  {
    label: string;
    description: string;
    badge: "success" | "warning" | "danger" | "secondary";
    dot: string;
  }
> = {
  operational: {
    label: "正常",
    description: "请求响应如常",
    badge: "success",
    dot: "bg-[var(--status-operational)]",
  },
  degraded: {
    label: "延迟",
    description: "响应成功但耗时升高",
    badge: "warning",
    dot: "bg-[var(--status-degraded)]",
  },
  failed: {
    label: "异常",
    description: "请求失败或超时",
    badge: "danger",
    dot: "bg-[var(--status-failed)]",
  },
  validation_failed: {
    label: "验证失败",
    description: "请求成功但回答未通过验证",
    badge: "warning",
    dot: "bg-[var(--status-validation)]",
  },
  maintenance: {
    label: "维护中",
    description: "人工维护,已停止检查",
    badge: "secondary",
    dot: "bg-[var(--status-maintenance)]",
  },
  error: {
    label: "错误",
    description: "请求异常（网络错误、API报错、连接失败）",
    badge: "danger",
    dot: "bg-[var(--status-error)]",
  },
};

export const OFFICIAL_STATUS_META: Record<
  OfficialHealthStatus,
  {
    label: string;
    description: string;
    bannerLabel?: string;
    bannerBg?: string;
    bannerBorder?: string;
  }
> = {
  operational: {
    label: "正常",
    description: "官方服务正常运行",
  },
  degraded: {
    label: "降级",
    description: "官方服务性能降级",
    bannerLabel: "官方降级",
    bannerBg: "bg-[var(--status-degraded)]/10 border-[var(--status-degraded)]/30 text-[var(--status-degraded)]",
    bannerBorder: "border-[var(--status-degraded)]/50",
  },
  down: {
    label: "故障",
    description: "官方服务出现故障",
    bannerLabel: "官方故障",
    bannerBg: "bg-[var(--status-failed)]/10 border-[var(--status-failed)]/30 text-[var(--status-failed)]",
    bannerBorder: "border-[var(--status-failed)]/50",
  },
  unknown: {
    label: "未知",
    description: "无法获取官方状态",
  },
};

export const PROVIDER_LABEL: Record<ProviderType, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
};
