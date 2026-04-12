"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";

import { NotificationBanner } from "@/components/notification-banner";
import { GroupTags } from "@/components/group-tags";
import { ProviderCard } from "@/components/provider-card";
import { Topbar } from "@/components/topbar";
import { ClientTime } from "@/components/client-time";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { fetchGroupWithCache, prefetchGroupData, setGroupCache } from "@/lib/core/group-frontend-cache";
import type { AvailabilityPeriod, ProviderTimeline } from "@/lib/types";
import type { GroupDashboardData } from "@/lib/core/group-data";
import { cn } from "@/lib/utils";

interface GroupDashboardViewProps {
  groupName: string;
  initialData: GroupDashboardData;
}

const PERIOD_OPTIONS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d",  label: "7d" },
  { value: "15d", label: "15d" },
  { value: "30d", label: "30d" },
];

const STATUS_BADGE_MAP = [
  { key: "operational" as const,       variant: "success"   as const, label: "ok" },
  { key: "degraded" as const,          variant: "warning"   as const, label: "slow" },
  { key: "failed" as const,            variant: "danger"    as const, label: "down" },
  { key: "validation_failed" as const, variant: "warning"   as const, label: "invalid" },
  { key: "error" as const,             variant: "danger"    as const, label: "error" },
  { key: "maintenance" as const,       variant: "secondary" as const, label: "maint" },
];

function getLatestTs(timelines: ProviderTimeline[]) {
  const ts = timelines.map((t) => new Date(t.latest.checkedAt).getTime());
  return ts.length ? Math.max(...ts) : null;
}

function computeRemaining(
  ms: number | null | undefined,
  latestTs: number | null,
  clock = Date.now()
) {
  if (!ms || ms <= 0 || latestTs === null) return null;
  return Math.max(0, ms - (clock - latestTs));
}

export function GroupDashboardView({ groupName, initialData }: GroupDashboardViewProps) {
  const [data, setData] = useState(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<AvailabilityPeriod>(
    initialData.trendPeriod ?? "7d"
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lockRef = useRef(false);

  const latestTs = useMemo(
    () => getLatestTs(data.providerTimelines),
    [data.providerTimelines]
  );
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number | null>(() =>
    computeRemaining(
      initialData.pollIntervalMs,
      getLatestTs(initialData.providerTimelines),
      initialData.generatedAt
    )
  );

  const refresh = useCallback(
    async (period?: AvailabilityPeriod, force?: boolean, revalidate?: boolean) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setIsRefreshing(true);
      try {
        const result = await fetchGroupWithCache({
          groupName,
          trendPeriod: period ?? selectedPeriod,
          forceFresh: force,
          revalidateIfFresh: revalidate,
          onBackgroundUpdate: setData,
        });
        setData(result.data);
      } catch (e) {
        console.error("[check-cx] group refresh failed", e);
      } finally {
        setIsRefreshing(false);
        lockRef.current = false;
      }
    },
    [groupName, selectedPeriod]
  );

  useEffect(() => {
    setData(initialData);
    if (initialData.trendPeriod)
      setGroupCache(groupName, initialData.trendPeriod, initialData);
  }, [groupName, initialData]);

  useEffect(() => {
    prefetchGroupData(
      groupName,
      ["7d", "15d", "30d"],
      data.trendPeriod ?? "7d"
    ).catch(() => {});
  }, [data.trendPeriod, groupName]);

  useEffect(() => {
    if (!data.pollIntervalMs || data.pollIntervalMs <= 0) return;
    const t = window.setInterval(
      () => refresh(undefined, false, true).catch(() => {}),
      data.pollIntervalMs
    );
    return () => window.clearInterval(t);
  }, [data.pollIntervalMs, refresh]);

  useEffect(() => {
    if (selectedPeriod !== data.trendPeriod) refresh(selectedPeriod).catch(() => {});
  }, [data.trendPeriod, refresh, selectedPeriod]);

  useEffect(() => {
    if (!data.pollIntervalMs || !latestTs) {
      setTimeToNextRefresh(null);
      return;
    }
    const tick = () =>
      setTimeToNextRefresh(computeRemaining(data.pollIntervalMs, latestTs));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [data.pollIntervalMs, latestTs]);

  const {
    providerTimelines,
    total,
    lastUpdated,
    pollIntervalLabel,
    displayName,
    availabilityStats,
  } = data;

  const gridCols = useMemo(
    () =>
      total > 4
        ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2",
    [total]
  );

  const statusCounts = useMemo(() => {
    const c = {
      operational: 0, degraded: 0, failed: 0,
      validation_failed: 0, maintenance: 0, error: 0,
    };
    for (const t of providerTimelines) {
      const s = t.latest.status;
      if (s in c) c[s as keyof typeof c]++;
    }
    return c;
  }, [providerTimelines]);

  // Topbar controls
  const topbarControls = (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroup
          type="single"
          value={selectedPeriod}
          onValueChange={(v) => v && setSelectedPeriod(v as AvailabilityPeriod)}
          size="sm"
          className="rounded-md border border-border/60 bg-background"
        >
          {PERIOD_OPTIONS.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              className="h-8 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </TooltipTrigger>
      <TooltipContent>Availability window</TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <NotificationBanner />
      <Topbar controls={topbarControls} />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-2 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              <GroupTags tags={data.tags} />
              {data.websiteUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={data.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Official status page</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Status summary */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {STATUS_BADGE_MAP.map(({ key, variant, label }) => {
                const n = statusCounts[key];
                if (!n) return null;
                return (
                  <Badge key={key} variant={variant} className="rounded font-normal">
                    {n} {label}
                  </Badge>
                );
              })}
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{total} total</span>
            </div>
          </div>

          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <RefreshCcw
                    className={cn(
                      "h-3.5 w-3.5 cursor-default",
                      isRefreshing && "animate-spin"
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>Polling every {pollIntervalLabel}</TooltipContent>
              </Tooltip>
              <span>
                Updated <ClientTime value={lastUpdated} />
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh(selectedPeriod, true)}
                disabled={isRefreshing}
                className="h-7 rounded-md px-2.5 text-xs"
              >
                Refresh
              </Button>
            </div>
          )}
        </div>

        {/* Grid */}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              No services in this group.
            </p>
          </div>
        ) : (
          <div className={cn("grid gap-4", gridCols)}>
            {providerTimelines.map((t) => (
              <ProviderCard
                key={t.id}
                timeline={t}
                timeToNextRefresh={timeToNextRefresh}
                availabilityStats={availabilityStats[t.id]}
                selectedPeriod={selectedPeriod}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
