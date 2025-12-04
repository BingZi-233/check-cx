/**
 * Dashboard 数据聚合模块
 *
 * 职责：
 * - 从 Supabase 读取最近的检查历史（按 Provider 聚合）
 * - 在必要时触发一次新的 Provider 检测并写入历史
 * - 结合轮询配置与官方状态，生成 DashboardView 所需的完整数据结构
 */
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {loadGroupInfos} from "../database/group-info";
import {getPollingIntervalLabel, getPollingIntervalMs} from "./polling-config";
import {ensureOfficialStatusPoller} from "./official-status-poller";
import {buildProviderTimelines, loadSnapshotForScope} from "./health-snapshot-service";
import type {DashboardData, GroupedProviderTimelines, ProviderTimeline, RefreshMode,} from "../types";
import type {GroupInfoRow} from "../types/database";
import {UNGROUPED_DISPLAY_NAME, UNGROUPED_KEY} from "../types";

/**
 * 将 ProviderTimeline 列表按分组组织
 */
function groupTimelines(timelines: ProviderTimeline[], groupInfos: GroupInfoRow[]): GroupedProviderTimelines[] {
  // 按 groupName 分组
  const groupMap = new Map<string, ProviderTimeline[]>();
  
  // 建立 groupInfo 映射
  const groupInfoMap = new Map<string, GroupInfoRow>();
  for (const info of groupInfos) {
    groupInfoMap.set(info.group_name, info);
  }

  for (const timeline of timelines) {
    const groupKey = timeline.latest.groupName || UNGROUPED_KEY;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(timeline);
  }

  // 转换为数组并排序
  const groups: GroupedProviderTimelines[] = [];

  // 先处理有名称的分组（按分组名称字母序）
  const namedGroups = [...groupMap.entries()]
    .filter(([key]) => key !== UNGROUPED_KEY)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [groupName, groupTimelines] of namedGroups) {
    const info = groupInfoMap.get(groupName);
    groups.push({
      groupName,
      displayName: groupName,
      websiteUrl: info?.website_url,
      timelines: groupTimelines.sort((a, b) =>
        a.latest.name.localeCompare(b.latest.name)
      ),
    });
  }

  // 最后处理未分组的（放在最后）
  const ungrouped = groupMap.get(UNGROUPED_KEY);
  if (ungrouped && ungrouped.length > 0) {
    groups.push({
      groupName: UNGROUPED_KEY,
      displayName: UNGROUPED_DISPLAY_NAME,
      timelines: ungrouped.sort((a, b) =>
        a.latest.name.localeCompare(b.latest.name)
      ),
    });
  }

  return groups;
}

/**
 * 加载 Dashboard 数据
 *
 * @param options.refreshMode
 *  - "always"  ：每次请求都触发一次新的检测
 *  - "missing"：仅在历史为空时触发检测（避免首屏空白）
 *  - "never"  ：只读取历史，不触发新的检测
 */
export async function loadDashboardData(options?: {
  refreshMode?: RefreshMode;
}): Promise<DashboardData> {
  ensureOfficialStatusPoller();
  const allConfigs = await loadProviderConfigsFromDB();
  const maintenanceConfigs = allConfigs.filter((cfg) => cfg.is_maintenance);
  const activeConfigs = allConfigs.filter((cfg) => !cfg.is_maintenance);

  const allowedIds = new Set(activeConfigs.map((item) => item.id));
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();
  const providerKey =
    allowedIds.size > 0 ? [...allowedIds].sort().join("|") : "__empty__";
  const cacheKey = `dashboard:${pollIntervalMs}:${providerKey}`;
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

  const groupInfos = await loadGroupInfos();
  // 生成分组数据
  const groupedTimelines = groupTimelines(providerTimelines, groupInfos);

  return {
    providerTimelines,
    groupedTimelines,
    lastUpdated,
    total: providerTimelines.length,
    pollIntervalLabel,
    pollIntervalMs,
    generatedAt,
  };
}
