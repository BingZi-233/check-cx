"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProviderIcon } from "@/components/provider-icon";
import { StatusTimeline } from "@/components/status-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { DashboardData } from "@/lib/types";
import { PROVIDER_LABEL, STATUS_META, OFFICIAL_STATUS_META } from "@/lib/core/status";
import { cn, formatLocalTime } from "@/lib/utils";

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

  const { providerTimelines, total, lastUpdated, pollIntervalLabel } = data;
  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? formatLocalTime(lastUpdated) : null),
    [lastUpdated]
  );

  // 根据卡片数量决定宽屏列数
  const gridColsClass = useMemo(() => {
    if (total > 4) {
      return "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3";
    }
    return "grid-cols-1 lg:grid-cols-2";
  }, [total]);

  return (
    <>
      <header className="rounded-3xl border bg-card/70 p-8 shadow-sm backdrop-blur-sm">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            实时检查多模型可用性
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            模型对话健康面板
          </h1>
          {lastUpdatedLabel ? (
            <p className="text-sm text-muted-foreground">
              最近更新：{lastUpdatedLabel} · 数据每 {pollIntervalLabel} 自动刷新{" "}
              {isRefreshing && <span className="text-primary">（同步中…）</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              尚未找到任何检测配置，请在 Supabase 的{" "}
              <span className="font-mono">check_configs</span> 表中添加至少一条{" "}
              <code>enabled = true</code> 的配置。
            </p>
          )}
        </div>
      </header>

      {total === 0 ? (
        <Card className="border-dashed bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              尚未配置任何检查目标
            </CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <section className={`grid gap-6 ${gridColsClass}`}>
          {providerTimelines.map(({ id, latest, items }) => {
            const preset = STATUS_META[latest.status];
            const officialStatus = latest.officialStatus;
            const officialStatusMeta = officialStatus
              ? OFFICIAL_STATUS_META[officialStatus.status]
              : null;
            return (
              <Card
                key={id}
                className="relative z-0 border bg-card/80 shadow-lg shadow-primary/5 transition hover:z-20 hover:border-primary/40 focus-within:z-20"
              >
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                  <div className="absolute inset-y-0 right-[-30%] h-[200%] w-[60%] rounded-full bg-gradient-to-tr from-primary/10 via-transparent to-transparent blur-3xl" />
                </div>
                <CardHeader className="relative z-10 gap-5 pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70">
                      <ProviderIcon type={latest.type} size={22} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <CardTitle className="text-lg">{latest.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {PROVIDER_LABEL[latest.type]} ·{" "}
                        <span className="font-mono">{latest.model}</span>
                      </p>
                    </div>
                    <Badge variant={preset.badge} className="text-xs">
                      {preset.label}
                    </Badge>
                  </div>

                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        最近检查
                      </p>
                      <p className="mt-1 text-foreground">
                        {formatLocalTime(latest.checkedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        对话首字
                      </p>
                      <p className="mt-1 text-foreground">
                        {formatLatency(latest.latencyMs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        端点 Ping
                      </p>
                      <p className="mt-1 text-foreground">
                        {formatLatency(latest.pingLatencyMs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        官方状态
                      </p>
                      <p className="mt-1 text-foreground">
                        {officialStatus && officialStatusMeta ? (
                          <HoverCard openDelay={200}>
                            <HoverCardTrigger asChild>
                              <span
                                className={cn(
                                  "inline-flex cursor-help items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-sm font-medium transition hover:border-border/80",
                                  officialStatusMeta.color
                                )}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-current"
                                  aria-hidden="true"
                                />
                                {officialStatusMeta.label}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="space-y-2 text-sm">
                              <div>
                                <p className="text-base font-medium text-foreground">
                                  {officialStatusMeta.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  最近更新：{formatLocalTime(officialStatus.checkedAt)}
                                </p>
                              </div>
                              <p className="text-sm text-foreground">
                                {officialStatus.message || "暂无官方说明"}
                              </p>
                              {officialStatus.affectedComponents &&
                                officialStatus.affectedComponents.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                      受影响组件
                                    </p>
                                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
                                      {officialStatus.affectedComponents.map((component, index) => (
                                        <li key={`${component}-${index}`}>{component}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                            </HoverCardContent>
                          </HoverCard>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        检测次数
                      </p>
                      <p className="mt-1 text-foreground">{items.length} 次检测</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative z-10 border-t border-border/60 pt-4">
                  <StatusTimeline items={items} nextRefreshInMs={timeToNextRefresh} />
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </>
  );
}
