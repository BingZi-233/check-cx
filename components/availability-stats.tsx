"use client";

import type { AvailabilityPeriod, AvailabilityStat } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface AvailabilityStatsProps {
  stats?: AvailabilityStat[] | null;
  period: AvailabilityPeriod;
  isMaintenance?: boolean;
}

const PERIOD_LABELS: Record<AvailabilityPeriod, string> = {
  "7d":  "7d",
  "15d": "15d",
  "30d": "30d",
};

function getColorVar(pct: number | null | undefined, isMaintenance?: boolean): string {
  if (isMaintenance) return "var(--status-maintenance)";
  if (pct === null || pct === undefined) return "var(--muted-foreground)";
  if (pct >= 99) return "var(--status-operational)";
  if (pct >= 95) return "var(--status-degraded)";
  return "var(--status-failed)";
}

function getTextClass(pct: number | null | undefined, isMaintenance?: boolean): string {
  if (isMaintenance) return "text-[var(--status-maintenance)]";
  if (pct === null || pct === undefined) return "text-muted-foreground";
  if (pct >= 99) return "text-[var(--status-operational)]";
  if (pct >= 95) return "text-[var(--status-degraded)]";
  return "text-[var(--status-failed)]";
}

export function AvailabilityStats({ stats, period, isMaintenance }: AvailabilityStatsProps) {
  const current = stats?.find((s) => s.period === period);
  const pct = current?.availabilityPct ?? null;
  const pctLabel = pct === null ? "—" : `${pct.toFixed(2)}%`;
  const subLabel = current
    ? `${current.operationalCount}/${current.totalChecks} checks`
    : isMaintenance
    ? "paused"
    : "no data";

  const colorVar = getColorVar(pct, isMaintenance);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            Availability {PERIOD_LABELS[period]}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground/60">{subLabel}</p>
        </div>
        <span className={cn("font-mono text-base font-semibold tabular-nums leading-none", getTextClass(pct, isMaintenance))}>
          {pctLabel}
        </span>
      </div>

      {/* Progress bar — override --primary with the status color */}
      <div style={{ "--primary": colorVar } as React.CSSProperties}>
        <Progress
          value={pct ?? 0}
          className="h-1 rounded-sm bg-muted/50"
        />
      </div>
    </div>
  );
}
