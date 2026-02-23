import type { AlertRuleRow } from "../types/database";
import type { HealthStatus } from "../types";

export type AlertConditionType = AlertRuleRow["condition_type"];

interface StatusChangeParams {
  from?: HealthStatus[];
  to?: HealthStatus[];
}

interface ConsecutiveFailuresParams {
  count?: number;
  statuses?: HealthStatus[];
}

interface LatencyThresholdParams {
  threshold_ms?: number;
}

export function isValidConditionType(type: string): type is AlertConditionType {
  return ["status_change", "consecutive_failures", "latency_threshold"].includes(type);
}

export function shouldTrigger(
  rule: AlertRuleRow,
  newStatus: HealthStatus,
  latencyMs: number | null,
  recentHistory: { status: string }[]
): boolean {
  switch (rule.condition_type) {
    case "status_change": {
      const prev = recentHistory[0]?.status as HealthStatus | undefined;
      if (!prev || prev === newStatus) return false;
      const p = rule.condition_params as StatusChangeParams;
      if (p.from?.length && !p.from.includes(prev)) return false;
      if (p.to?.length && !p.to.includes(newStatus)) return false;
      return true;
    }
    case "consecutive_failures": {
      const p = rule.condition_params as ConsecutiveFailuresParams;
      const count = p.count ?? 2;
      const statuses = (p.statuses ?? ["failed", "degraded"]) as HealthStatus[];
      const toCheck = [newStatus, ...recentHistory.slice(0, count - 1).map((h) => h.status as HealthStatus)];
      if (toCheck.length < count) return false;
      return toCheck.every((s) => statuses.includes(s));
    }
    case "latency_threshold": {
      if (latencyMs == null) return false;
      const p = rule.condition_params as LatencyThresholdParams;
      return latencyMs >= (p.threshold_ms ?? 5000);
    }
    default:
      return false;
  }
}
