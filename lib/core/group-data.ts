/**
 * 分组数据加载模块
 *
 * 职责：
 * - 加载指定分组的 Dashboard 数据
 * - 获取所有可用的分组列表
 */
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {getGroupInfo} from "../database/group-info";
import {getAvailabilityStats} from "../database/availability";
import {getPollingIntervalLabel, getPollingIntervalMs} from "./polling-config";
import {ensureOfficialStatusPoller} from "./official-status-poller";
import {buildProviderTimelines, loadSnapshotForScope} from "./health-snapshot-service";
import type {AvailabilityPeriod, AvailabilityStatsMap, ProviderTimeline, RefreshMode} from "../types";
import {UNGROUPED_DISPLAY_NAME, UNGROUPED_KEY} from "../types";

interface GroupDashboardCacheEntry {
  data?: GroupDashboardData | null;
  expiresAt: number;
  inflight?: Promise<GroupDashboardData | null>;
}

const DEFAULT_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;
const groupDashboardCache = new Map<string, GroupDashboardCacheEntry>();

function getGroupCacheKey(
  groupName: string,
  pollIntervalMs: number,
  providerKey: string,
  trendPeriod: AvailabilityPeriod
): string {
  return `group:${groupName}:${pollIntervalMs}:${trendPeriod}:${providerKey}`;
}

function getGroupCacheTtlMs(pollIntervalMs: number): number {
  if (Number.isFinite(pollIntervalMs) && pollIntervalMs > 0) {
    return pollIntervalMs;
  }
  return DEFAULT_GROUP_CACHE_TTL_MS;
}

/**
 * 分组 Dashboard 数据结构
 */
export interface GroupDashboardData {
  groupName: string;
  displayName: string;
  tags: string;
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
  availabilityStats: AvailabilityStatsMap;
  trendPeriod: AvailabilityPeriod;
  generatedAt: number;
  websiteUrl?: string | null;
}

/**
 * 获取所有可用的分组名称
 */
export async function getAvailableGroups(): Promise<string[]> {
  const allConfigs = await loadProviderConfigsFromDB();
  const groupSet = new Set<string>();

  for (const config of allConfigs) {
    if (config.groupName) {
      groupSet.add(config.groupName);
    }
  }

  // 如果存在未分组的配置，也添加到列表
  const hasUngrouped = allConfigs.some((config) => !config.groupName);
  if (hasUngrouped) {
    groupSet.add(UNGROUPED_KEY);
  }

  return [...groupSet].sort();
}

/**
 * 加载指定分组的 Dashboard 数据
 *
 * @param targetGroupName 目标分组名称（使用 "__ungrouped__" 表示未分组）
 * @param options.refreshMode
 *  - "always"  ：每次请求都触发一次新的检测
 *  - "missing"：仅在历史为空时触发检测（避免首屏空白）
 *  - "never"  ：只读取历史，不触发新的检测
 */
export async function loadGroupDashboardData(
  targetGroupName: string,
  options?: { refreshMode?: RefreshMode; trendPeriod?: AvailabilityPeriod }
): Promise<GroupDashboardData | null> {
  ensureOfficialStatusPoller();

  const allConfigs = await loadProviderConfigsFromDB();

  // 筛选指定分组的配置
  const isTargetUngrouped = targetGroupName === UNGROUPED_KEY;
  const groupConfigs = allConfigs.filter((config) => {
    if (isTargetUngrouped) {
      return !config.groupName;
    }
    return config.groupName === targetGroupName;
  });

  // 分组不存在或没有配置
  if (groupConfigs.length === 0) {
    return null;
  }

  const maintenanceConfigs = groupConfigs.filter((cfg) => cfg.is_maintenance);
  const activeConfigs = groupConfigs.filter((cfg) => !cfg.is_maintenance);

  const allowedIds = new Set(activeConfigs.map((item) => item.id));
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();
  const providerKey =
    allowedIds.size > 0 ? [...allowedIds].sort().join("|") : "__empty__";
  const cacheKey = `group:${targetGroupName}:${pollIntervalMs}:${providerKey}`;
  const refreshMode = options?.refreshMode ?? "missing";
  const trendPeriod = options?.trendPeriod ?? "7d";
  const cacheKeyWithPeriod = getGroupCacheKey(
    targetGroupName,
    pollIntervalMs,
    providerKey,
    trendPeriod
  );
  const cacheTtlMs = getGroupCacheTtlMs(pollIntervalMs);
  const now = Date.now();
  const shouldBypassCache = refreshMode === "always";

  const loadData = async (): Promise<GroupDashboardData | null> => {
    const history = await loadSnapshotForScope(
      {
        cacheKey,
        pollIntervalMs,
        activeConfigs,
        allowedIds,
      },
      refreshMode
    );

    const providerTimelines = buildProviderTimelines(history, maintenanceConfigs);

    let lastUpdated: string | null = null;
    let lastUpdatedMs = 0;
    for (const timeline of providerTimelines) {
      const checkedAtMs = Date.parse(timeline.latest.checkedAt);
      if (Number.isFinite(checkedAtMs) && checkedAtMs > lastUpdatedMs) {
        lastUpdatedMs = checkedAtMs;
        lastUpdated = timeline.latest.checkedAt;
      }
    }

    const generatedAt = Date.now();
    const configIds = groupConfigs.map((config) => config.id);
    const availabilityStats = await getAvailabilityStats(configIds);

    // 获取分组信息（仅对有名分组）
    let websiteUrl: string | undefined | null;
    let tags = "";
    if (!isTargetUngrouped) {
      const groupInfo = await getGroupInfo(targetGroupName);
      websiteUrl = groupInfo?.website_url;
      tags = groupInfo?.tags ?? "";
    }

    const data: GroupDashboardData = {
      groupName: targetGroupName,
      displayName: isTargetUngrouped ? UNGROUPED_DISPLAY_NAME : targetGroupName,
      tags,
      providerTimelines,
      lastUpdated,
      total: providerTimelines.length,
      pollIntervalLabel,
      pollIntervalMs,
      availabilityStats,
      trendPeriod,
      generatedAt,
      websiteUrl,
    };

    groupDashboardCache.set(cacheKeyWithPeriod, {
      data,
      expiresAt: Date.now() + cacheTtlMs,
    });

    return data;
  };

  if (!shouldBypassCache) {
    const cached = groupDashboardCache.get(cacheKeyWithPeriod);
    if (cached && now < cached.expiresAt) {
      if (cached.data) {
        cached.data.generatedAt = now;
      }
      return cached.data ?? null;
    }
    if (cached?.inflight) {
      return cached.inflight;
    }

    const inflight = loadData().finally(() => {
      const entry = groupDashboardCache.get(cacheKeyWithPeriod);
      if (entry?.inflight === inflight) {
        delete entry.inflight;
      }
    });
    groupDashboardCache.set(cacheKeyWithPeriod, {
      data: cached?.data,
      expiresAt: cached?.expiresAt ?? 0,
      inflight,
    });
    return inflight;
  }

  return loadData();
}
