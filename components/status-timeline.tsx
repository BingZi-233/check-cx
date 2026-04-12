"use client";

import { useEffect, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import { STATUS_META } from "@/lib/core/status";
import type { TimelineItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusTimelineProps {
  items: TimelineItem[];
  nextRefreshInMs?: number | null;
  isMaintenance?: boolean;
}

const SEGMENT_LIMIT = 60;

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const fmt = (v: number | null | undefined) =>
  typeof v === "number" ? `${v} ms` : "—";

export function StatusTimeline({ items, nextRefreshInMs, isMaintenance }: StatusTimelineProps) {
  const [isCoarse, setIsCoarse] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarse(mq.matches || navigator.maxTouchPoints > 0);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Empty / maintenance state
  if (items.length === 0) {
    return (
      <p className={cn(
        "text-2xs font-medium",
        isMaintenance
          ? "text-[var(--status-maintenance)]"
          : "text-muted-foreground"
      )}>
        {isMaintenance ? "Paused — maintenance mode" : "No history yet"}
      </p>
    );
  }

  const segments = Array.from({ length: SEGMENT_LIMIT }, (_, i) => items[i] ?? null);
  const count = Math.min(items.length, SEGMENT_LIMIT);
  const nextLabel = typeof nextRefreshInMs === "number"
    ? formatRemaining(nextRefreshInMs)
    : null;

  return (
    <div className="space-y-2">
      {/* Legend row */}
      <div className="flex items-center justify-between text-2xs font-medium text-muted-foreground">
        <span>History · {count} pts</span>
        <span>
          {nextLabel ? `Next in ${nextLabel}` : "Manual refresh"}
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-6 w-full overflow-hidden rounded-sm bg-muted/30">
        <div className="flex h-full w-full flex-row-reverse gap-px p-px">
          {segments.map((seg, i) => {
            if (!seg) {
              return (
                <div
                  key={`ph-${i}`}
                  className="flex-1 rounded-[1px] bg-muted/20"
                  aria-hidden="true"
                />
              );
            }
            const preset = STATUS_META[seg.status];
            const key = `${seg.id}-${seg.checkedAt}`;
            const isOpen = activeKey === key;

            return (
              <HoverCard
                key={key}
                open={isOpen}
                openDelay={isCoarse ? 0 : 80}
                onOpenChange={(open) =>
                  setActiveKey((cur) => {
                    if (open) return key;
                    return cur === key ? null : cur;
                  })
                }
              >
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "relative flex-1 rounded-[1px] transition-all duration-150",
                      preset?.dot,
                      "hover:opacity-75 hover:scale-y-110",
                      isOpen && "scale-y-110 ring-1 ring-foreground/20 z-10"
                    )}
                    aria-label={`${seg.checkedAt} · ${preset?.label}`}
                    onClick={() =>
                      setActiveKey((cur) => (cur === key ? null : key))
                    }
                  />
                </HoverCardTrigger>
                <HoverCardContent
                  side="top"
                  className="w-56 space-y-2.5 rounded-lg border bg-popover p-3 shadow-md"
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <Badge variant={preset.badge} className="h-5 px-1.5 text-2xs">
                      {preset.label}
                    </Badge>
                    <ClientTime
                      value={seg.checkedAt}
                      className="font-mono text-2xs text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latency</span>
                      <span className="font-mono font-medium">{fmt(seg.latencyMs)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ping</span>
                      <span className="font-mono font-medium">{fmt(seg.pingLatencyMs)}</span>
                    </div>
                  </div>
                  {seg.message && (
                    <p className="rounded bg-muted/40 px-2 py-1.5 text-2xs text-muted-foreground break-words">
                      {seg.message}
                    </p>
                  )}
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      </div>

      {/* Axis */}
      <div className="flex justify-between text-2xs text-muted-foreground/40">
        <span>Oldest</span>
        <span>Now</span>
      </div>
    </div>
  );
}
