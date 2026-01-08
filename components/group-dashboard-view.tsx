"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Activity, ExternalLink, Radio, RefreshCcw, Zap} from "lucide-react";

import {ProviderIcon} from "@/components/provider-icon";
import {StatusTimeline} from "@/components/status-timeline";
import {Badge} from "@/components/ui/badge";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "@/components/ui/hover-card";
import type {ProviderTimeline} from "@/lib/types";
import type {GroupDashboardData} from "@/lib/core/group-data";
import {OFFICIAL_STATUS_META, PROVIDER_LABEL, STATUS_META} from "@/lib/core/status";
import {cn, formatLocalTime} from "@/lib/utils";

interface GroupDashboardViewProps {
  groupName: string;
  initialData: GroupDashboardData;
}

/** 计算所有 Provider 中最近一次检查的时间戳（毫秒） */
const getLatestCheckTimestamp = (timelines: ProviderTimeline[]) => {
  const timestamps = timelines.map((timeline) =>
    new Date(timeline.latest.checkedAt).getTime()
  );
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const computeRemainingMs = (
  pollIntervalMs: number | null | undefined,
  latestCheckTimestamp: number | null,
  clock: number = Date.now()
) => {
  if (!pollIntervalMs || pollIntervalMs <= 0 || latestCheckTimestamp === null) {
    return null;
  }
  const remaining = pollIntervalMs - (clock - latestCheckTimestamp);
  return Math.max(0, remaining);
};

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

/** Provider 卡片组件 */
function ProviderCard({
  timeline,
  timeToNextRefresh,
  isCoarsePointer,
  activeOfficialCardId,
  setActiveOfficialCardId,
}: {
  timeline: ProviderTimeline;
  timeToNextRefresh: number | null;
  isCoarsePointer: boolean;
  activeOfficialCardId: string | null;
  setActiveOfficialCardId: (id: string | null) => void;
}) {
  const { id, latest, items } = timeline;
  const preset = STATUS_META[latest.status];
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
                 <Badge variant={preset.badge} className="shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-md sm:px-2.5 sm:py-1 sm:text-xs">
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
                        officialStatusMeta.color.replace('text-', 'bg-')
                      )}
                      onClick={
                        isCoarsePointer
                          ? () => setActiveOfficialCardId(activeOfficialCardId === id ? null : id)
                          : undefined
                      }
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", officialStatusMeta.color.replace('text-', 'bg-'))} />
                      {officialStatusMeta.label}
                    </button>
                  </HoverCardTrigger>
                   <HoverCardContent className="w-80 space-y-3 backdrop-blur-xl bg-background/95">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-foreground">
                        {officialStatusMeta.label}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {formatLocalTime(officialStatus.checkedAt)} 更新
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
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
            
           {/* Availability Row */}
           <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">近期可用性</span>
              <span className="font-mono text-xs font-bold text-foreground">
                 {items.length > 0
                ? `${(
                    (items.filter(
                      (item) =>
                        item.status === "operational" || item.status === "degraded"
                    ).length /
                      items.length) *
                    100
                  ).toFixed(0)}%`
                : "—"}
              </span>
           </div>
        </div>
      </div>

      {/* Timeline Section - Visual separation */}
      <div className="border-t border-border/40 bg-muted/10 px-5 py-4">
         <StatusTimeline items={items} nextRefreshInMs={timeToNextRefresh} />
      </div>
    </div>
  );
}

/**
 * 分组 Dashboard 视图
 * - 展示单个分组内的所有 Provider 卡片
 * - 支持客户端定时刷新
 */
export function GroupDashboardView({ groupName, initialData }: GroupDashboardViewProps) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lockRef = useRef(false);
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number | null>(() =>
    computeRemainingMs(
      initialData.pollIntervalMs,
      getLatestCheckTimestamp(initialData.providerTimelines),
      initialData.generatedAt
    )
  );
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [activeOfficialCardId, setActiveOfficialCardId] = useState<string | null>(null);
  const latestCheckTimestamp = useMemo(
    () => getLatestCheckTimestamp(data.providerTimelines),
    [data.providerTimelines]
  );

  const refresh = useCallback(async () => {
    if (lockRef.current) {
      return;
    }
    lockRef.current = true;
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/group/${encodeURIComponent(groupName)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("刷新数据失败");
      }
      const next = (await response.json()) as GroupDashboardData;
      setData(next);
    } catch (error) {
      console.error("[check-cx] 分组自动刷新失败", error);
    } finally {
      setIsRefreshing(false);
      lockRef.current = false;
    }
  }, [groupName]);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(pointer: coarse)");

    const updatePointerType = () => {
      const hasTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      setIsCoarsePointer(media.matches || hasTouch);
    };

    updatePointerType();
    media.addEventListener("change", updatePointerType);

    return () => media.removeEventListener("change", updatePointerType);
  }, []);

  useEffect(() => {
    if (!isCoarsePointer) {
      setActiveOfficialCardId(null);
    }
  }, [isCoarsePointer]);

  useEffect(() => {
    if (!data.pollIntervalMs || data.pollIntervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, data.pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [data.pollIntervalMs, refresh]);

  useEffect(() => {
    if (!data.pollIntervalMs || data.pollIntervalMs <= 0 || latestCheckTimestamp === null) {
      setTimeToNextRefresh(null);
      return;
    }

    const updateCountdown = () => {
      setTimeToNextRefresh(
        computeRemainingMs(data.pollIntervalMs, latestCheckTimestamp)
      );
    };

    updateCountdown();
    const countdownTimer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(countdownTimer);
  }, [data.pollIntervalMs, latestCheckTimestamp]);

  const { providerTimelines, total, lastUpdated, pollIntervalLabel, displayName } = data;
  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? formatLocalTime(lastUpdated) : null),
    [lastUpdated]
  );

  // 根据卡片数量决定宽屏列数
  const gridColsClass = useMemo(() => {
    if (total > 4) {
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
    }
    return "grid-cols-1 md:grid-cols-2";
  }, [total]);

  // 计算状态统计
  const statusSummary = useMemo(() => {
    const counts = { operational: 0, degraded: 0, failed: 0, validation_failed: 0, maintenance: 0, error: 0 };
    for (const timeline of providerTimelines) {
      const status = timeline.latest.status;
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [providerTimelines]);

  return (
    <div className="relative">
      <CornerPlus className="fixed left-4 top-4 h-6 w-6 text-border md:left-8 md:top-8" />
      <CornerPlus className="fixed right-4 top-4 h-6 w-6 text-border md:right-8 md:top-8" />
      <CornerPlus className="fixed bottom-4 left-4 h-6 w-6 text-border md:bottom-8 md:left-8" />
      <CornerPlus className="fixed bottom-4 right-4 h-6 w-6 text-border md:bottom-8 md:right-8" />

      <header className="relative z-10 mb-8 flex flex-col justify-between gap-6 sm:mb-12 sm:gap-8 lg:flex-row lg:items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background sm:h-8 sm:w-8">
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground sm:text-sm">
              Group View
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              {displayName}
            </h1>
            {data.tags && data.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {data.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="rounded-full bg-background/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {data.websiteUrl && (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-full bg-muted/50 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-6 w-6" />
              </a>
            )}
          </div>
          
           <div className="flex flex-wrap items-center gap-2.5">
            {statusSummary.operational > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                 <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {statusSummary.operational} 正常
              </span>
            )}
            {statusSummary.degraded > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {statusSummary.degraded} 延迟
              </span>
            )}
            {statusSummary.failed > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {statusSummary.failed} 异常
              </span>
            )}
            {statusSummary.validation_failed > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {statusSummary.validation_failed} 验证失败
              </span>
            )}
            {statusSummary.error > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                {statusSummary.error} 错误
              </span>
            )}
             {statusSummary.maintenance > 0 && (
               <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {statusSummary.maintenance} 维护
              </span>
            )}
            <span className="text-xs text-muted-foreground/60">|</span>
            <span className="text-xs text-muted-foreground">{total} 个配置</span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-4 lg:items-end">
           {/* Status Pill */}
           <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider">Operational</span>
           </div>

           {lastUpdatedLabel && (
             <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <RefreshCcw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                  <span>更新于 {lastUpdatedLabel}</span>
                </div>
                <span className="opacity-30">|</span>
                <span>{pollIntervalLabel} 轮询</span>
             </div>
           )}
        </div>
      </header>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/50 bg-muted/20 py-20 text-center">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">该分组下暂无配置</h3>
          </div>
      ) : (
        <section className={`grid gap-6 ${gridColsClass}`}>
          {providerTimelines.map((timeline) => (
            <ProviderCard
              key={timeline.id}
              timeline={timeline}
              timeToNextRefresh={timeToNextRefresh}
              isCoarsePointer={isCoarsePointer}
              activeOfficialCardId={activeOfficialCardId}
              setActiveOfficialCardId={setActiveOfficialCardId}
            />
          ))}
        </section>
      )}
    </div>
  );
}
