"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Activity, ExternalLink, RefreshCcw} from "lucide-react";

import {GroupTags} from "@/components/group-tags";
import {ProviderCard} from "@/components/provider-card";
import {ClientTime} from "@/components/client-time";
import {fetchGroupWithCache, prefetchGroupData, setGroupCache} from "@/lib/core/group-frontend-cache";
import type {AvailabilityPeriod, ProviderTimeline} from "@/lib/types";
import type {GroupDashboardData} from "@/lib/core/group-data";
import {cn} from "@/lib/utils";

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

const PERIOD_OPTIONS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d", label: "7 天" },
  { value: "15d", label: "15 天" },
  { value: "30d", label: "30 天" },
];

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

/**
 * 分组 Dashboard 视图
 * - 展示单个分组内的所有 Provider 卡片
 * - 支持客户端定时刷新
 */
export function GroupDashboardView({ groupName, initialData }: GroupDashboardViewProps) {
  const [data, setData] = useState(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<AvailabilityPeriod>(
    initialData.trendPeriod ?? "7d"
  );
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

  const refresh = useCallback(
    async (
      period?: AvailabilityPeriod,
      forceFresh?: boolean,
      revalidateIfFresh?: boolean
    ) => {
    if (lockRef.current) {
      return;
    }
    lockRef.current = true;
    setIsRefreshing(true);
    try {
      const targetPeriod = period ?? selectedPeriod;
      const result = await fetchGroupWithCache({
        groupName,
        trendPeriod: targetPeriod,
        forceFresh,
        revalidateIfFresh,
        onBackgroundUpdate: (newData) => {
          setData(newData);
        },
      });
      setData(result.data);
    } catch (error) {
      console.error("[check-cx] 分组自动刷新失败", error);
    } finally {
      setIsRefreshing(false);
      lockRef.current = false;
    }
  }, [groupName, selectedPeriod]);

  useEffect(() => {
    setData(initialData);
    if (initialData.trendPeriod) {
      setGroupCache(groupName, initialData.trendPeriod, initialData);
    }
  }, [groupName, initialData]);

  useEffect(() => {
    const currentPeriod = data.trendPeriod ?? "7d";
    prefetchGroupData(groupName, ["7d", "15d", "30d"], currentPeriod).catch(() => undefined);
  }, [data.trendPeriod, groupName]);

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
      refresh(undefined, false, true).catch(() => undefined);
    }, data.pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [data.pollIntervalMs, refresh]);

  useEffect(() => {
    if (selectedPeriod === data.trendPeriod) {
      return;
    }
    refresh(selectedPeriod).catch(() => undefined);
  }, [data.trendPeriod, refresh, selectedPeriod]);

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
  const { availabilityStats } = data;

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
          
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              {displayName}
            </h1>
            <GroupTags tags={data.tags} />
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
           <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
             <span className="pl-1">可用性区间</span>
             <div className="flex items-center gap-1 rounded-full bg-muted/30 p-0.5">
               {PERIOD_OPTIONS.map((option) => (
                 <button
                   key={option.value}
                   type="button"
                   onClick={() => setSelectedPeriod(option.value)}
                   className={cn(
                     "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                     selectedPeriod === option.value
                       ? "bg-foreground text-background"
                       : "text-muted-foreground hover:text-foreground"
                   )}
                 >
                   {option.label}
                 </button>
               ))}
             </div>
           </div>

           {/* Status Pill */}
           <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider">Operational</span>
           </div>

           {lastUpdated && (
             <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <RefreshCcw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                  <span>更新于 <ClientTime value={lastUpdated} /></span>
                </div>
                <span className="opacity-30">|</span>
                <span>{pollIntervalLabel} 轮询</span>
                <button
                  type="button"
                  onClick={() => refresh(selectedPeriod, true)}
                  disabled={isRefreshing}
                  className={cn(
                    "rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground",
                    isRefreshing && "cursor-not-allowed opacity-60"
                  )}
                >
                  刷新
                </button>
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
              availabilityStats={availabilityStats[timeline.id]}
              selectedPeriod={selectedPeriod}
            />
          ))}
        </section>
      )}
    </div>
  );
}
