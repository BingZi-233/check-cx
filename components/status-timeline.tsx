"use client";

import {useEffect, useState} from "react";
import {Clock} from "lucide-react";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "@/components/ui/hover-card";
import {Badge} from "@/components/ui/badge";
import {ClientTime} from "@/components/client-time";
import {STATUS_META} from "@/lib/core/status";
import type {TimelineItem} from "@/lib/types";
import {cn} from "@/lib/utils";

interface StatusTimelineProps {
  /** 时间线条目列表，通常为最近 60 条按时间倒序的检测结果 */
  items: TimelineItem[];
  /** 距离下一次轮询刷新的剩余毫秒数，用于展示倒计时徽标 */
  nextRefreshInMs?: number | null;
  /** 是否处于维护模式 */
  isMaintenance?: boolean;
}

/** 时间线最多绘制的片段数量 */
const SEGMENT_LIMIT = 60;

const formatRemainingTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
};

const formatLatency = (value: number | null | undefined) =>
  typeof value === "number" ? `${value} ms` : "—";

export function StatusTimeline({ items, nextRefreshInMs, isMaintenance }: StatusTimelineProps) {
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [activeSegmentKey, setActiveSegmentKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(pointer: coarse)");
    const updatePointerType = () => {
      const hasTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      const nextIsCoarse = media.matches || hasTouch;
      setIsCoarsePointer((prev) => {
        if (prev && !nextIsCoarse) {
          setActiveSegmentKey(null);
        }
        return nextIsCoarse;
      });
    };

    updatePointerType();
    media.addEventListener("change", updatePointerType);

    return () => media.removeEventListener("change", updatePointerType);
  }, []);

  if (items.length === 0) {
    if (isMaintenance) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-4 text-xs text-blue-500">
          维护中 · 已暂停时间线采集
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/10 p-4 text-xs text-muted-foreground">
        NO DATA AVAILABLE
      </div>
    );
  }

  const segments = Array.from({ length: SEGMENT_LIMIT }, (_, index) =>
    items[index] ?? null
  );
  const segmentCount = Math.min(items.length, SEGMENT_LIMIT);
  const nextRefreshLabel =
    typeof nextRefreshInMs === "number" ? formatRemainingTime(nextRefreshInMs) : null;

  return (
    <div className="space-y-3">
      {/* Header / Legend */}
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{segmentCount <= 1 ? "History (latest)" : `History (${segmentCount}pts)`}</span>
        </div>
        <div className="flex items-center gap-2">
           {nextRefreshLabel ? (
             <span className="flex items-center gap-1.5 text-primary">
               <Clock className="h-3 w-3" />
               Next update in {nextRefreshLabel}
             </span>
           ) : (
             <span className="opacity-50">Manual Refresh</span>
           )}
        </div>
      </div>

      {/* Timeline Bar */}
      <div className="relative h-8 w-full overflow-hidden rounded-sm bg-muted/20">
        <div className="flex h-full w-full flex-row-reverse gap-[2px] p-[2px]">
          {segments.map((segment, index) => {
            if (!segment) {
              return (
                <div
                  key={`placeholder-${index}`}
                  className="flex-1 rounded-[1px] bg-muted/10"
                  aria-label="No Data"
                />
              );
            }

            const preset = STATUS_META[segment.status];
            const segmentKey = `${segment.id}-${segment.checkedAt}`;
            const isOpen = activeSegmentKey === segmentKey;

            return (
              <HoverCard
                key={segmentKey}
                open={isOpen}
                openDelay={isCoarsePointer ? 0 : 100}
                onOpenChange={(nextOpen) =>
                  setActiveSegmentKey(nextOpen ? segmentKey : null)
                }
              >
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "relative block h-full w-full flex-1 rounded-[1px] transition-all duration-200",
                      preset?.dot, // Use the existing bg utility from meta
                      "hover:opacity-80 hover:scale-y-110",
                      isOpen && "ring-1 ring-foreground/20 scale-y-110 z-10"
                    )}
                    aria-label={`${segment.checkedAt} · ${preset.label}`}
                    onClick={() =>
                      setActiveSegmentKey((current) =>
                        current === segmentKey ? null : segmentKey
                      )
                    }
                  />
                </HoverCardTrigger>
                <HoverCardContent
                  side="top"
                  className="w-64 space-y-3 rounded-xl border-border/50 bg-background/95 p-4 shadow-xl backdrop-blur-xl"
                >
                   <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <Badge variant={preset.badge} className="h-5 px-1.5 text-[10px]">{preset.label}</Badge>
                      <ClientTime value={segment.checkedAt} className="font-mono text-[10px] text-muted-foreground" />
                   </div>
                   
                   <div className="grid gap-2 text-xs">
                      <div className="flex items-center justify-between">
                         <span className="text-muted-foreground">Latency</span>
                         <span className="font-mono font-medium">{formatLatency(segment.latencyMs)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                         <span className="text-muted-foreground">Ping</span>
                         <span className="font-mono font-medium">{formatLatency(segment.pingLatencyMs)}</span>
                      </div>
                   </div>
                   
                   {segment.message && (
                     <div className="rounded bg-muted/30 p-2 text-[10px] text-muted-foreground break-words">
                       {segment.message}
                     </div>
                   )}
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      </div>
      
      {/* Axis labels */}
      <div className="flex justify-between text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50">
        <span>Past</span>
        <span>Now</span>
      </div>
    </div>
  );
}
