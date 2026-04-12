"use client";

import type {AvailabilityPeriod, AvailabilityStat} from "@/lib/types";
import {cn} from "@/lib/utils";

interface AvailabilityStatsProps {
  stats?: AvailabilityStat[] | null;
  period: AvailabilityPeriod;
  isMaintenance?: boolean;
}

const PERIOD_LABELS: Record<AvailabilityPeriod, string> = {
  "7d": "7 天",
  "15d": "15 天",
  "30d": "30 天",
};

function getAvailabilityColorClass(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "text-muted-foreground";
  if (pct >= 99) return "text-[var(--status-operational)]";
  if (pct >= 95) return "text-[var(--status-degraded)]";
  return "text-[var(--status-failed)]";
}

export function AvailabilityStats({ stats, period, isMaintenance }: AvailabilityStatsProps) {
  const current = stats?.find((item) => item.period === period);
  const pct = current?.availabilityPct ?? null;
  const pctLabel = pct === null ? "—" : `${pct.toFixed(2)}%`;

  if (isMaintenance) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-[var(--status-maintenance)]/30 bg-[var(--status-maintenance)]/5 px-3 py-2">
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--status-maintenance)]">
            可用性 ({PERIOD_LABELS[period]})
          </p>
          <p className="text-2xs text-[var(--status-maintenance)]/70">
            {current
              ? `维护前 ${current.operationalCount}/${current.totalChecks} 成功`
              : "维护中 · 已暂停统计"}
          </p>
        </div>
        <span className="font-mono text-sm font-bold text-[var(--status-maintenance)]">
          {pctLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
      <div className="space-y-1">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          可用性 ({PERIOD_LABELS[period]})
        </p>
        <p className="text-2xs text-muted-foreground">
          {current
            ? `${current.operationalCount}/${current.totalChecks} 成功`
            : "暂无数据"}
        </p>
      </div>
      <span className={cn("font-mono text-sm font-bold", getAvailabilityColorClass(pct))}>
        {pctLabel}
      </span>
    </div>
  );
}
