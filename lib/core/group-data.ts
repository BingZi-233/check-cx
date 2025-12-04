/**
 * 分组数据加载模块
 *
 * 职责：
 * - 加载指定分组的 Dashboard 数据
 * - 获取所有可用的分组列表
 */
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {getGroupInfo} from "../database/group-info";
import {getPollingIntervalLabel, getPollingIntervalMs} from "./polling-config";
import {ensureOfficialStatusPoller} from "./official-status-poller";
import {buildProviderTimelines, loadSnapshotForScope} from "./health-snapshot-service";
import type {ProviderTimeline, RefreshMode} from "../types";
import {UNGROUPED_DISPLAY_NAME, UNGROUPED_KEY} from "../types";

/**
 * 分组 Dashboard 数据结构
 */
export interface GroupDashboardData {
  groupName: string;
  displayName: string;
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
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
  options?: { refreshMode?: RefreshMode }
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

  const allEntries = providerTimelines
    .flatMap((timeline) => timeline.items)
    .sort(
      (a, b) =>
        new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
    );

  const lastUpdated = allEntries.length ? allEntries[0].checkedAt : null;
  const generatedAt = Date.now();

  // 获取分组信息（仅对有名分组）
  let websiteUrl: string | undefined | null;
  if (!isTargetUngrouped) {
    const groupInfo = await getGroupInfo(targetGroupName);
    websiteUrl = groupInfo?.website_url;
  }

  return {
    groupName: targetGroupName,
    displayName: isTargetUngrouped ? UNGROUPED_DISPLAY_NAME : targetGroupName,
    providerTimelines,
    lastUpdated,
    total: providerTimelines.length,
    pollIntervalLabel,
    pollIntervalMs,
    generatedAt,
    websiteUrl,
  };
}
