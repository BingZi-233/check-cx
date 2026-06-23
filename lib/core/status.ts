import type {HealthStatus, OfficialHealthStatus, ProviderType} from "../types";

export const STATUS_META: Record<
  HealthStatus,
  {
    label: string;
    description: string;
    badge: "default" | "secondary" | "destructive";
    dot: string;
  }
> = {
  operational: {
    label: "正常",
    description: "请求响应如常",
    badge: "default",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "延迟",
    description: "响应成功但耗时升高",
    badge: "secondary",
    dot: "bg-amber-500",
  },
  failed: {
    label: "异常",
    description: "请求失败或超时",
    badge: "destructive",
    dot: "bg-rose-500",
  },
  validation_failed: {
    label: "验证失败",
    description: "请求成功但回答未通过验证",
    badge: "secondary",
    dot: "bg-orange-500",
  },
  maintenance: {
    label: "维护中",
    description: "人工维护,已停止检查",
    badge: "secondary",
    dot: "bg-blue-500",
  },
  error: {
    label: "错误",
    description: "请求异常（网络错误、API报错、连接失败）",
    badge: "destructive",
    dot: "bg-red-600",
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
    bannerBg: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    bannerBorder: "border-amber-500/50",
  },
  down: {
    label: "故障",
    description: "官方服务出现故障",
    bannerLabel: "官方故障",
    bannerBg: "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400",
    bannerBorder: "border-rose-500/50",
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
