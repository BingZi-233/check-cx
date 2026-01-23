"use client";

import {Radio, Zap} from "lucide-react";

import {ProviderIcon} from "@/components/provider-icon";
import {StatusTimeline} from "@/components/status-timeline";
import {AvailabilityStats} from "@/components/availability-stats";
import {Badge} from "@/components/ui/badge";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "@/components/ui/hover-card";
import type {AvailabilityPeriod, AvailabilityStat, ProviderTimeline} from "@/lib/types";
import {OFFICIAL_STATUS_META, PROVIDER_LABEL, STATUS_META} from "@/lib/core/status";
import {ClientTime} from "@/components/client-time";
import {cn} from "@/lib/utils";

interface ProviderCardProps {
  timeline: ProviderTimeline;
  timeToNextRefresh: number | null;
  isCoarsePointer: boolean;
  activeOfficialCardId: string | null;
  setActiveOfficialCardId: (id: string | null) => void;
  availabilityStats?: AvailabilityStat[] | null;
  selectedPeriod: AvailabilityPeriod;
}

const formatLatency = (value: number | null | undefined) =>
  typeof value === "number" ? `${value} ms` : "—";

/** Tech-style decorative corner plus marker */
const CornerPlus = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    className={cn("absolute h-4 w-4 text-muted-foreground/40", className)}
  >
    <line x1="12" y1="0" x2="12" y2="24" />
    <line x1="0" y1="12" x2="24" y2="12" />
  </svg>
);

export function ProviderCard({
  timeline,
  timeToNextRefresh,
  isCoarsePointer,
  activeOfficialCardId,
  setActiveOfficialCardId,
  availabilityStats,
  selectedPeriod,
}: ProviderCardProps) {
  const { id, latest, items } = timeline;
  const preset = STATUS_META[latest.status];
  const isMaintenance = latest.status === "maintenance";
  const officialStatus = latest.officialStatus;
  const officialStatusMeta = officialStatus
    ? OFFICIAL_STATUS_META[officialStatus.status]
    : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
      {/* Decorative markers */}
      <CornerPlus className="left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" />
      <CornerPlus className="right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex-1 p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/80 to-white/20 shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-105 dark:from-white/10 dark:to-white/5 dark:ring-white/10 sm:h-12 sm:w-12 sm:rounded-2xl">
              <div className="scale-75 sm:scale-100">
                <ProviderIcon type={latest.type} size={26} className="text-foreground/80" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex-1 truncate text-base font-bold leading-none tracking-tight text-foreground sm:text-lg">
                  {latest.name}
                </h3>
                <Badge
                  variant={preset.badge}
                  className="shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-md sm:px-2.5 sm:py-1 sm:text-xs"
                >
                  {preset.label}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 font-medium text-muted-foreground/80">
                  {PROVIDER_LABEL[latest.type]}
                </span>
                <span className="break-all font-mono opacity-60">{latest.model}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/30 p-3 transition-colors group-hover:bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">对话延迟</span>
            </div>
            <div className="mt-1 font-mono text-lg font-medium leading-none text-foreground">
              {formatLatency(latest.latencyMs)}
            </div>
          </div>

          <div className="rounded-xl bg-muted/30 p-3 transition-colors group-hover:bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">端点 PING</span>
            </div>
            <div className="mt-1 font-mono text-lg font-medium leading-none text-foreground">
              {formatLatency(latest.pingLatencyMs)}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-border/30 pt-4">
          {/* Official Status Row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">官方状态</span>
            {officialStatus && officialStatusMeta ? (
              <HoverCard
                openDelay={isCoarsePointer ? 0 : 200}
                open={isCoarsePointer ? activeOfficialCardId === id : undefined}
                onOpenChange={
                  isCoarsePointer
                    ? (nextOpen) => setActiveOfficialCardId(nextOpen ? id : null)
                    : undefined
                }
              >
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted",
                      officialStatusMeta.color.replace("text-", "bg-")
                    )}
                    onClick={
                      isCoarsePointer
                        ? () =>
                            setActiveOfficialCardId(
                              activeOfficialCardId === id ? null : id
                            )
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        officialStatusMeta.color.replace("text-", "bg-")
                      )}
                    />
                    {officialStatusMeta.label}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 space-y-3 backdrop-blur-xl bg-background/95">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-foreground">
                      {officialStatusMeta.label}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      <ClientTime value={officialStatus.checkedAt} /> 更新
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    {officialStatus.message || "暂无官方说明"}
                  </p>
                  {officialStatus.affectedComponents &&
                    officialStatus.affectedComponents.length > 0 && (
                      <div className="rounded-md bg-muted/50 p-2 text-xs">
                        <p className="mb-1.5 font-medium text-foreground">受影响组件</p>
                        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                          {officialStatus.affectedComponents.map((component, index) => (
                            <li key={`${component}-${index}`}>{component}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </HoverCardContent>
              </HoverCard>
            ) : (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>

          <AvailabilityStats stats={availabilityStats} period={selectedPeriod} isMaintenance={isMaintenance} />
        </div>
      </div>

      {/* Timeline Section - Visual separation */}
      <div className="border-t border-border/40 bg-muted/10 px-5 py-4">
        <StatusTimeline items={items} nextRefreshInMs={timeToNextRefresh} isMaintenance={isMaintenance} />
      </div>
    </div>
  );
}
