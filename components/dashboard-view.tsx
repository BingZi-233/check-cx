"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import {Activity, ChevronDown, ExternalLink, Github, Radio, RefreshCcw, Zap} from "lucide-react";

import {ProviderIcon} from "@/components/provider-icon";
import {StatusTimeline} from "@/components/status-timeline";
import {ThemeToggle} from "@/components/theme-toggle";
import {Badge} from "@/components/ui/badge";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "@/components/ui/hover-card";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import type {DashboardData, GroupedProviderTimelines, ProviderTimeline} from "@/lib/types";
import {OFFICIAL_STATUS_META, PROVIDER_LABEL, STATUS_META} from "@/lib/core/status";
import {cn, formatLocalTime} from "@/lib/utils";

interface DashboardViewProps {
  /** 首屏由服务端注入的聚合数据，用作前端轮询的初始快照 */
  initialData: DashboardData;
}

/** 计算所有 Provider 中最近一次检查的时间戳（毫秒） */
const getLatestCheckTimestamp = (
  timelines: DashboardData["providerTimelines"]
) => {
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

// 未分组标识常量
const UNGROUPED_KEY = "__ungrouped__";

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
      
      <div className="flex-1 p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/80 to-white/20 shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-105 dark:from-white/10 dark:to-white/5 dark:ring-white/10">
              <ProviderIcon type={latest.type} size={26} className="text-foreground/80" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                 <h3 className="flex-1 truncate font-bold leading-none tracking-tight text-foreground">
                   {latest.name}
                 </h3>
                 <Badge variant={preset.badge} className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider shadow-sm backdrop-blur-md">
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
                        officialStatusMeta.color.replace('text-', 'text-')
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

/** 分组面板组件 */
function GroupPanel({
  group,
  timeToNextRefresh,
  isCoarsePointer,
  activeOfficialCardId,
  setActiveOfficialCardId,
  gridColsClass,
  defaultOpen = false,
}: {
  group: GroupedProviderTimelines;
  timeToNextRefresh: number | null;
  isCoarsePointer: boolean;
  activeOfficialCardId: string | null;
  setActiveOfficialCardId: (id: string | null) => void;
  gridColsClass: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const statusSummary = useMemo(() => {
    const counts = { operational: 0, degraded: 0, failed: 0, maintenance: 0 };
    for (const timeline of group.timelines) {
      const status = timeline.latest.status;
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [group.timelines]);

  const groupLink = `/group/${encodeURIComponent(group.groupName)}`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-3xl border bg-white/30 p-6 backdrop-blur-sm dark:bg-black/10">
      <div className="flex items-center justify-between gap-4">
        <CollapsibleTrigger className="group flex flex-1 min-w-0 items-center gap-4 text-left transition hover:opacity-80 focus-visible:outline-none">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-colors group-hover:bg-white/80 dark:bg-white/10 dark:ring-white/10">
            <ChevronDown className="h-5 w-5 text-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">
                {group.displayName}
              </h2>
              {group.websiteUrl && (
                <a
                  href={group.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-full bg-muted/50 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
               {statusSummary.operational > 0 && (
                 <span className="flex items-center gap-1.5 whitespace-nowrap">
                   <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                   {statusSummary.operational} 正常
                 </span>
               )}
               {statusSummary.degraded > 0 && (
                 <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {statusSummary.degraded} 延迟
                 </span>
               )}
               {statusSummary.failed > 0 && (
                 <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {statusSummary.failed} 异常
                 </span>
               )}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <Link
            href={groupLink}
            className="group flex h-10 shrink-0 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all hover:bg-foreground/90 hover:px-6"
        >
            <span className="whitespace-nowrap">详情</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
        </Link>
      </div>

      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-2">
        <div className={`mt-2 grid gap-6 ${gridColsClass}`}>
          {group.timelines.map((timeline) => (
            <ProviderCard
              key={timeline.id}
              timeline={timeline}
              timeToNextRefresh={timeToNextRefresh}
              isCoarsePointer={isCoarsePointer}
              activeOfficialCardId={activeOfficialCardId}
              setActiveOfficialCardId={setActiveOfficialCardId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Dashboard 主视图
 * - 负责渲染整体头部统计与 Provider 卡片
 * - 在浏览器端按 pollIntervalMs 定时拉取 /api/dashboard 并维护倒计时
 */
export function DashboardView({ initialData }: DashboardViewProps) {
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
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("刷新数据失败");
      }
      const next = (await response.json()) as DashboardData;
      setData(next);
    } catch (error) {
      console.error("[check-cx] 自动刷新失败", error);
    } finally {
      setIsRefreshing(false);
      lockRef.current = false;
    }
  }, []);

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

  const { providerTimelines, groupedTimelines, total, lastUpdated, pollIntervalLabel } = data;
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

  const hasMultipleGroups = useMemo(() => {
    return (
      groupedTimelines.length > 1 ||
      (groupedTimelines.length === 1 && groupedTimelines[0].groupName !== UNGROUPED_KEY)
    );
  }, [groupedTimelines]);

  return (
    <div className="relative">
       {/* Corner decorative markers for the main container */}
       <CornerPlus className="fixed left-4 top-4 h-6 w-6 text-border md:left-8 md:top-8" />
       <CornerPlus className="fixed right-4 top-4 h-6 w-6 text-border md:right-8 md:top-8" />
       <CornerPlus className="fixed bottom-4 left-4 h-6 w-6 text-border md:bottom-8 md:left-8" />
       <CornerPlus className="fixed bottom-4 right-4 h-6 w-6 text-border md:bottom-8 md:right-8" />

      <header className="relative z-10 mb-12 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              System Status
            </span>
            <div className="h-4 w-[1px] bg-border/60" />
            <Link
              href="https://github.com/BingZi-233/check-cx"
              target="_blank"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </Link>
            <div className="h-4 w-[1px] bg-border/60" />
            <ThemeToggle />
          </div>
          
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            AI SERVICES <br />
            <span className="text-muted-foreground">INTELLIGENCE MONITOR</span>
          </h1>
          
          <div className="flex max-w-lg flex-col gap-2 text-muted-foreground">
             <p className="leading-relaxed">
               实时追踪各大 AI 模型对话接口的可用性、延迟与官方服务状态。
               <br />
               Advanced performance metrics for next-gen intelligence.
             </p>
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

      <main className="relative z-10 min-h-[50vh]">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/50 bg-muted/20 py-20 text-center">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">尚无监控目标</h3>
            <p className="text-muted-foreground">请配置检查端点以开始监控</p>
          </div>
        ) : hasMultipleGroups ? (
          <div className="space-y-4">
            {groupedTimelines.map((group) => (
              <GroupPanel
                key={group.groupName}
                group={group}
                timeToNextRefresh={timeToNextRefresh}
                isCoarsePointer={isCoarsePointer}
                activeOfficialCardId={activeOfficialCardId}
                setActiveOfficialCardId={setActiveOfficialCardId}
                gridColsClass={gridColsClass}
                defaultOpen={false}
              />
            ))}
          </div>
        ) : (
          <div className={`grid gap-6 ${gridColsClass}`}>
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
          </div>
        )}
      </main>
    </div>
  );
}
