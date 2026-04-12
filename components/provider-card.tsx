"use client";

import { AlertTriangle, Radio, Zap } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusTimeline } from "@/components/status-timeline";
import { AvailabilityStats } from "@/components/availability-stats";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AvailabilityPeriod, AvailabilityStat, ProviderTimeline } from "@/lib/types";
import { OFFICIAL_STATUS_META, PROVIDER_LABEL, STATUS_META } from "@/lib/core/status";
import { cn } from "@/lib/utils";

interface ProviderCardProps {
  timeline: ProviderTimeline;
  timeToNextRefresh: number | null;
  availabilityStats?: AvailabilityStat[] | null;
  selectedPeriod: AvailabilityPeriod;
}

const fmt = (v: number | null | undefined) =>
  typeof v === "number" ? `${v} ms` : "—";

const STATUS_VAR: Record<string, string> = {
  operational:       "var(--status-operational)",
  degraded:          "var(--status-degraded)",
  failed:            "var(--status-failed)",
  error:             "var(--status-error)",
  maintenance:       "var(--status-maintenance)",
  validation_failed: "var(--status-validation)",
};

export function ProviderCard({
  timeline,
  timeToNextRefresh,
  availabilityStats,
  selectedPeriod,
}: ProviderCardProps) {
  const { latest, items } = timeline;
  const preset = STATUS_META[latest.status];
  const isMaintenance = latest.status === "maintenance";

  const officialMeta = latest.officialStatus
    ? OFFICIAL_STATUS_META[latest.officialStatus.status]
    : null;
  const banner = officialMeta?.bannerLabel ? officialMeta : null;
  const accentColor = STATUS_VAR[latest.status] ?? "var(--border)";

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-sm">
      {/* Status accent strip */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
        aria-hidden="true"
      />

      {/* Official status banner */}
      {banner && latest.officialStatus && (
        <div
          className={cn(
            "flex items-start gap-2 border-b px-4 py-2 pl-5",
            banner.bannerBg
          )}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{banner.bannerLabel}</p>
            {latest.officialStatus.message && (
              <p className="text-2xs opacity-80">{latest.officialStatus.message}</p>
            )}
            {latest.officialStatus.affectedComponents &&
              latest.officialStatus.affectedComponents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {latest.officialStatus.affectedComponents.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="rounded bg-current/10 px-1 py-0.5 text-2xs font-medium"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      <CardContent className="flex flex-col gap-3.5 p-4 pl-5 pt-4">
        {/* Header: icon + name + badge */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <ProviderIcon type={latest.type} size={20} className="text-foreground/70" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold leading-none text-foreground">
                {latest.name}
              </h3>
              <Badge
                variant={preset.badge}
                className="shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide"
              >
                {preset.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {PROVIDER_LABEL[latest.type]}
              <span className="mx-1 opacity-40">·</span>
              <span className="font-mono opacity-70">{latest.model}</span>
            </p>
          </div>
        </div>

        <Separator />

        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="cursor-default text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Latency
                </p>
              </TooltipTrigger>
              <TooltipContent>Time to first token</TooltipContent>
            </Tooltip>
            <p className="mt-1 font-mono text-base font-semibold leading-none tabular-nums">
              {fmt(latest.latencyMs)}
            </p>
          </div>
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="cursor-default text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Ping
                </p>
              </TooltipTrigger>
              <TooltipContent>Endpoint round-trip time</TooltipContent>
            </Tooltip>
            <p className="mt-1 font-mono text-base font-semibold leading-none tabular-nums">
              {fmt(latest.pingLatencyMs)}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <AvailabilityStats
              stats={availabilityStats}
              period={selectedPeriod}
              isMaintenance={isMaintenance}
            />
          </div>
        </div>

        <Separator />

        {/* Timeline */}
        <StatusTimeline
          items={items}
          nextRefreshInMs={timeToNextRefresh}
          isMaintenance={isMaintenance}
        />
      </CardContent>
    </Card>
  );
}
