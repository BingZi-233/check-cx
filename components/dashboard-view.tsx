"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpDown,
  ChevronDown,
  ExternalLink,
  GripVertical,
  RefreshCcw,
  Search,
} from "lucide-react";
import Link from "next/link";

import { NotificationBanner } from "@/components/notification-banner";
import { GroupTags } from "@/components/group-tags";
import { ProviderCard } from "@/components/provider-card";
import { Topbar } from "@/components/topbar";
import { ClientTime } from "@/components/client-time";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { fetchWithCache, prefetchDashboardData, setCache } from "@/lib/core/frontend-cache";
import { prefetchGroupData } from "@/lib/core/group-frontend-cache";
import type {
  AvailabilityPeriod,
  AvailabilityStatsMap,
  DashboardData,
  GroupedProviderTimelines,
  GroupInfoSummary,
} from "@/lib/types";
import { UNGROUPED_DISPLAY_NAME } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getTagColorClass, parseTagList } from "@/lib/utils/tag-colors";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  initialData: DashboardData;
}

type SortMode = "custom" | "group" | "name";

const UNGROUPED_KEY = "__ungrouped__";

const PERIOD_OPTIONS: Array<{ value: AvailabilityPeriod; label: string }> = [
  { value: "7d",  label: "7d" },
  { value: "15d", label: "15d" },
  { value: "30d", label: "30d" },
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "custom", label: "Custom order" },
  { value: "group",  label: "By tag" },
  { value: "name",   label: "By name" },
];

const SORT_LABELS: Record<SortMode, string> = {
  custom: "Custom",
  group:  "Tag",
  name:   "Name",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLatestTs(timelines: DashboardData["providerTimelines"]) {
  const ts = timelines.map((t) => new Date(t.latest.checkedAt).getTime());
  return ts.length > 0 ? Math.max(...ts) : null;
}

function computeRemaining(
  intervalMs: number | null | undefined,
  latestTs: number | null,
  clock = Date.now()
) {
  if (!intervalMs || intervalMs <= 0 || latestTs === null) return null;
  return Math.max(0, intervalMs - (clock - latestTs));
}

function buildGroupedTimelines(
  timelines: DashboardData["providerTimelines"],
  groupInfos: GroupInfoSummary[]
): GroupedProviderTimelines[] {
  const groupMap = new Map<string, typeof timelines>();
  const infoMap = new Map<string, GroupInfoSummary>();
  for (const g of groupInfos) infoMap.set(g.groupName, g);
  for (const t of timelines) {
    const key = t.latest.groupName || UNGROUPED_KEY;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  const named = [...groupMap.entries()]
    .filter(([k]) => k !== UNGROUPED_KEY)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => {
      const info = infoMap.get(name);
      return {
        groupName: name,
        displayName: name,
        websiteUrl: info?.websiteUrl ?? null,
        tags: info?.tags ?? "",
        timelines: [...items].sort((a, b) =>
          a.latest.name.localeCompare(b.latest.name)
        ),
      };
    });

  const ungrouped = groupMap.get(UNGROUPED_KEY);
  if (ungrouped?.length) {
    named.push({
      groupName: UNGROUPED_KEY,
      displayName: UNGROUPED_DISPLAY_NAME,
      websiteUrl: null,
      tags: "",
      timelines: [...ungrouped].sort((a, b) =>
        a.latest.name.localeCompare(b.latest.name)
      ),
    });
  }
  return named;
}

// ─── Status badges ────────────────────────────────────────────────────────────

type StatusCounts = {
  operational: number;
  degraded: number;
  failed: number;
  validation_failed: number;
  maintenance: number;
  error: number;
};

function computeStatus(
  timelines: GroupedProviderTimelines["timelines"]
): StatusCounts {
  const c = {
    operational: 0, degraded: 0, failed: 0,
    validation_failed: 0, maintenance: 0, error: 0,
  };
  for (const t of timelines) {
    const s = t.latest.status;
    if (s in c) c[s as keyof typeof c]++;
  }
  return c;
}

const STATUS_BADGE_MAP = [
  { key: "operational" as const,       variant: "success"   as const, label: "ok" },
  { key: "degraded" as const,          variant: "warning"   as const, label: "slow" },
  { key: "failed" as const,            variant: "danger"    as const, label: "down" },
  { key: "validation_failed" as const, variant: "warning"   as const, label: "invalid" },
  { key: "error" as const,             variant: "danger"    as const, label: "error" },
  { key: "maintenance" as const,       variant: "secondary" as const, label: "maint" },
];

function StatusBadges({ counts }: { counts: StatusCounts }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STATUS_BADGE_MAP.map(({ key, variant, label }) => {
        const n = counts[key];
        if (!n) return null;
        return (
          <Badge key={key} variant={variant} className="rounded font-normal">
            {n} {label}
          </Badge>
        );
      })}
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: GroupedProviderTimelines;
  timeToNextRefresh: number | null;
  gridCols: string;
  availabilityStats: AvailabilityStatsMap;
  selectedPeriod: AvailabilityPeriod;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

function GroupSection({
  group,
  timeToNextRefresh,
  gridCols,
  availabilityStats,
  selectedPeriod,
  dragHandleProps,
}: GroupSectionProps) {
  const [open, setOpen] = useState(true);
  const counts = useMemo(() => computeStatus(group.timelines), [group.timelines]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="cursor-grab p-1 text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}

        <CollapsibleTrigger className="group flex items-center gap-2 text-left hover:opacity-80 focus-visible:outline-none">
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          <h2 className="text-sm font-semibold">{group.displayName}</h2>
          <GroupTags tags={group.tags} />
          {group.websiteUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={group.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Official status page</TooltipContent>
            </Tooltip>
          )}
        </CollapsibleTrigger>

        {open && <StatusBadges counts={counts} />}

        <Separator className="flex-1" />

        <Button variant="ghost" size="sm" asChild className="h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
          <Link href={`/group/${encodeURIComponent(group.groupName)}`}>
            Details
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      {/* Cards */}
      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-1">
        <div className={cn("mt-4 grid gap-4", gridCols)}>
          {group.timelines.map((t) => (
            <ProviderCard
              key={t.id}
              timeline={t}
              timeToNextRefresh={timeToNextRefresh}
              availabilityStats={availabilityStats[t.id]}
              selectedPeriod={selectedPeriod}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SortableGroupSection(props: GroupSectionProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <GroupSection {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Main DashboardView ───────────────────────────────────────────────────────

export function DashboardView({ initialData }: DashboardViewProps) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<AvailabilityPeriod>(
    initialData.trendPeriod ?? "7d"
  );
  const [sortMode, setSortMode] = useState<SortMode>("custom");
  const [isDndReady, setIsDndReady] = useState(false);

  const { providerTimelines, total, lastUpdated, pollIntervalLabel } = data;
  const availabilityStats: AvailabilityStatsMap = data.availabilityStats ?? {};

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

  const initialGroups = useMemo(
    () => buildGroupedTimelines(initialData.providerTimelines, initialData.groupInfos),
    [initialData.groupInfos, initialData.providerTimelines]
  );
  const groups = useMemo(
    () => buildGroupedTimelines(data.providerTimelines, data.groupInfos),
    [data.groupInfos, data.providerTimelines]
  );
  const groupNames = useMemo(() => groups.map((g) => g.groupName), [groups]);
  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.groupName, g])),
    [groups]
  );

  const [orderedNames, setOrderedNames] = useState<string[]>(() =>
    initialGroups.map((g) => g.groupName)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { setIsDndReady(true); }, []);

  useEffect(() => {
    const savedSort = localStorage.getItem("check-cx-sort-mode");
    if (savedSort && ["custom", "group", "name"].includes(savedSort))
      setSortMode(savedSort as SortMode);

    const savedOrder = localStorage.getItem("check-cx-group-order");
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          setOrderedNames(() => {
            const cur = new Set(initialGroups.map((g) => g.groupName));
            const valid = parsed.filter((n) => cur.has(n));
            const added = initialGroups
              .map((g) => g.groupName)
              .filter((n) => !valid.includes(n));
            return [...valid, ...added];
          });
        }
      } catch {}
    }

    const savedTags = localStorage.getItem("check-cx-selected-tags");
    if (savedTags) {
      try {
        const parsed = JSON.parse(savedTags);
        if (Array.isArray(parsed))
          setSelectedTags(parsed.filter((t): t is string => typeof t === "string"));
      } catch {}
    }
  }, [initialGroups]);

  useEffect(() => {
    localStorage.setItem("check-cx-sort-mode", sortMode);
  }, [sortMode]);
  useEffect(() => {
    localStorage.setItem("check-cx-selected-tags", JSON.stringify(selectedTags));
  }, [selectedTags]);

  useEffect(() => {
    setOrderedNames((prev) => {
      const cur = new Set(groupNames);
      const valid = prev.filter((n) => cur.has(n));
      const added = groupNames.filter((n) => !prev.includes(n));
      if (valid.length === prev.length && !added.length) return prev;
      return [...valid, ...added];
    });
  }, [groupNames]);

  const refresh = useCallback(
    async (period?: AvailabilityPeriod, force?: boolean, revalidate?: boolean) => {
      setIsRefreshing(true);
      try {
        const p = period ?? selectedPeriod;
        const result = await fetchWithCache({
          trendPeriod: p,
          forceFresh: force,
          revalidateIfFresh: revalidate,
          onBackgroundUpdate: setData,
        });
        setData(result.data);
      } catch (e) {
        console.error("[check-cx] refresh failed", e);
      } finally {
        setIsRefreshing(false);
      }
    },
    [selectedPeriod]
  );

  useEffect(() => {
    setData(initialData);
    if (initialData.trendPeriod) setCache(initialData.trendPeriod, initialData);
  }, [initialData]);

  useEffect(() => {
    prefetchDashboardData(["7d", "15d", "30d"], data.trendPeriod ?? "7d").catch(() => {});
  }, [data.trendPeriod]);

  useEffect(() => {
    const first = groups.find((g) => g.groupName !== UNGROUPED_KEY);
    if (!first) return;
    prefetchGroupData(first.groupName, ["7d", "15d", "30d"], data.trendPeriod ?? "7d").catch(
      () => {}
    );
  }, [data.trendPeriod, groups]);

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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedNames((prev) => {
      const next = arrayMove(
        prev,
        prev.indexOf(active.id as string),
        prev.indexOf(over.id as string)
      );
      localStorage.setItem("check-cx-group-order", JSON.stringify(next));
      return next;
    });
  }, []);

  const gridCols = useMemo(
    () =>
      total > 4
        ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2",
    [total]
  );

  const hasMultipleGroups = useMemo(
    () =>
      groups.length > 1 ||
      (groups.length === 1 && groups[0].groupName !== UNGROUPED_KEY),
    [groups]
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const t of parseTagList(g.tags)) s.add(t);
    return [...s].sort();
  }, [groups]);

  useEffect(() => {
    setSelectedTags((prev) => {
      const valid = prev.filter((t) => allTags.includes(t));
      return valid.length === prev.length ? prev : valid;
    });
  }, [allTags]);

  const filteredNames = useMemo(() => {
    let names = sortMode === "custom" ? orderedNames : groupNames;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      names = names.filter((n) =>
        groupMap.get(n)?.displayName.toLowerCase().includes(q)
      );
    }
    if (selectedTags.length) {
      names = names.filter((n) => {
        const tags = parseTagList(groupMap.get(n)?.tags);
        return selectedTags.some((t) => tags.includes(t));
      });
    }
    if (sortMode !== "custom") {
      names = [...names].sort((a, b) => {
        if (a === UNGROUPED_KEY) return 1;
        if (b === UNGROUPED_KEY) return -1;
        const ga = groupMap.get(a)!;
        const gb = groupMap.get(b)!;
        if (sortMode === "group") {
          const ta = parseTagList(ga.tags).map((x) => x.toLowerCase());
          const tb = parseTagList(gb.tags).map((x) => x.toLowerCase());
          for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
            const cmp = (ta[i] ?? "").localeCompare(tb[i] ?? "");
            if (cmp !== 0) return cmp;
          }
        }
        return ga.displayName
          .toLowerCase()
          .localeCompare(gb.displayName.toLowerCase());
      });
    }
    return names;
  }, [groupNames, groupMap, orderedNames, searchQuery, selectedTags, sortMode]);

  // ── Topbar controls ──────────────────────────────────────────────────────
  const topbarControls = (
    <>
      {hasMultipleGroups && (
        <SearchInput
          id="search-groups"
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search groups…"
          className="w-36 sm:w-52"
        />
      )}

      {hasMultipleGroups && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md text-xs">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{SORT_LABELS[sortMode]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Sort groups by
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortMode}
              onValueChange={(v) => setSortMode(v as SortMode)}
            >
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} className="text-sm">
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <NotificationBanner />
      <Topbar controls={topbarControls} />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-2 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {total} service{total !== 1 ? "s" : ""} monitored
            </p>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <RefreshCcw
                    className={cn("h-3.5 w-3.5 cursor-default", isRefreshing && "animate-spin")}
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

        {/* Tag filter bar */}
        {hasMultipleGroups && allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter by tag:</span>
            <ToggleGroup
              type="multiple"
              value={selectedTags}
              onValueChange={setSelectedTags}
              className="flex flex-wrap gap-1.5"
            >
              {allTags.map((tag) => (
                <ToggleGroupItem
                  key={tag}
                  value={tag}
                  className={cn(
                    "h-6 rounded px-2 text-xs font-semibold border-0",
                    "data-[state=on]:ring-2 data-[state=on]:ring-foreground/20",
                    getTagColorClass(tag)
                  )}
                >
                  {tag}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {selectedTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTags([])}
                className="h-6 rounded px-2 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Main content */}
        {total === 0 ? (
          <EmptyState
            message="No services configured"
            sub="Add check configurations to your Supabase database to start monitoring."
          />
        ) : hasMultipleGroups ? (
          <GroupList
            filteredNames={filteredNames}
            groupMap={groupMap}
            searchQuery={searchQuery}
            selectedTags={selectedTags}
            sortMode={sortMode}
            isDndReady={isDndReady}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onClearFilters={() => {
              setSearchQuery("");
              setSelectedTags([]);
            }}
            timeToNextRefresh={timeToNextRefresh}
            gridCols={gridCols}
            availabilityStats={availabilityStats}
            selectedPeriod={selectedPeriod}
          />
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

// ─── Group list (with DnD) ───────────────────────────────────────────────────

interface GroupListProps {
  filteredNames: string[];
  groupMap: Map<string, GroupedProviderTimelines>;
  searchQuery: string;
  selectedTags: string[];
  sortMode: SortMode;
  isDndReady: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (e: DragEndEvent) => void;
  onClearFilters: () => void;
  timeToNextRefresh: number | null;
  gridCols: string;
  availabilityStats: AvailabilityStatsMap;
  selectedPeriod: AvailabilityPeriod;
}

function GroupList({
  filteredNames,
  groupMap,
  searchQuery,
  selectedTags,
  sortMode,
  isDndReady,
  sensors,
  onDragEnd,
  onClearFilters,
  timeToNextRefresh,
  gridCols,
  availabilityStats,
  selectedPeriod,
}: GroupListProps) {
  if (filteredNames.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        message="No groups match your filters"
        sub="Try adjusting your search or tag selection."
        action={
          (searchQuery || selectedTags.length > 0) ? (
            <Button size="sm" onClick={onClearFilters} className="rounded-md">
              Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  const useDnd = isDndReady && sortMode === "custom";

  const content = (
    <div className="space-y-10">
      {filteredNames.map((name) => {
        const group = groupMap.get(name);
        if (!group) return null;
        const shared = { group, timeToNextRefresh, gridCols, availabilityStats, selectedPeriod };
        return useDnd ? (
          <SortableGroupSection key={name} id={name} {...shared} />
        ) : (
          <GroupSection key={name} {...shared} />
        );
      })}
    </div>
  );

  if (!useDnd) return content;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={filteredNames} strategy={verticalListSortingStrategy}>
        {content}
      </SortableContext>
    </DndContext>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  message,
  sub,
  action,
}: {
  icon?: React.ReactNode;
  message: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold">{message}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
