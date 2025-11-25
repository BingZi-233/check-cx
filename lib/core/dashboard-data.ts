/**
 * Dashboard 数据聚合模块
 *
 * 职责：
 * - 从 Supabase 读取最近的检查历史（按 Provider 聚合）
 * - 在必要时触发一次新的 Provider 检测并写入历史
 * - 结合轮询配置与官方状态，生成 DashboardView 所需的完整数据结构
 */
import { loadProviderConfigsFromDB } from "../database/config-loader";
import { runProviderChecks } from "../providers";
import { appendHistory, loadHistory } from "../database/history";
import { getPollingIntervalLabel, getPollingIntervalMs } from "./polling-config";
import { getPingCacheEntry } from "./global-state";
import { ensureOfficialStatusPoller, getOfficialStatus } from "./official-status-poller";
import type {
  ProviderTimeline,
  GroupedProviderTimelines,
  DashboardData,
  RefreshMode,
  HistorySnapshot,
  CheckResult,
} from "../types";

// 未分组标识常量
const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_DISPLAY_NAME = "未分组";

/**
 * 将 ProviderTimeline 列表按分组组织
 */
function groupTimelines(timelines: ProviderTimeline[]): GroupedProviderTimelines[] {
  // 按 groupName 分组
  const groupMap = new Map<string, ProviderTimeline[]>();

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
    groups.push({
      groupName,
      displayName: groupName,
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
  // 分离维护中的配置和正常配置
  const maintenanceConfigs = allConfigs.filter((cfg) => cfg.is_maintenance);
  const activeConfigs = allConfigs.filter((cfg) => !cfg.is_maintenance);

  const allowedIds = new Set(activeConfigs.map((item) => item.id));
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();
  const providerKey =
    allowedIds.size > 0 ? [...allowedIds].sort().join("|") : "__empty__";
  const cacheKey = `${pollIntervalMs}:${providerKey}`;
  const cacheEntry = getPingCacheEntry(cacheKey);

  const filterHistory = (history: HistorySnapshot): HistorySnapshot => {
    if (allowedIds.size === 0) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(history).filter(([id]) => allowedIds.has(id))
    );
  };

  const readFilteredHistory = async () => filterHistory(await loadHistory());

  const refreshHistory = async () => {
    if (allowedIds.size === 0) {
      return {};
    }
    const now = Date.now();
    if (cacheEntry.history && now - cacheEntry.lastPingAt < pollIntervalMs) {
      return cacheEntry.history;
    }
    if (cacheEntry.inflight) {
      return cacheEntry.inflight;
    }

    const inflightPromise = (async () => {
      const results = await runProviderChecks(activeConfigs);
      let nextHistory: HistorySnapshot;
      if (results.length > 0) {
        nextHistory = filterHistory(await appendHistory(results));
      } else {
        nextHistory = await readFilteredHistory();
      }
      cacheEntry.history = nextHistory;
      cacheEntry.lastPingAt = Date.now();
      return nextHistory;
    })();

    cacheEntry.inflight = inflightPromise;
    try {
      return await inflightPromise;
    } finally {
      if (cacheEntry.inflight === inflightPromise) {
        cacheEntry.inflight = undefined;
      }
    }
  };

  let history = await readFilteredHistory();
  const refreshMode = options?.refreshMode ?? "missing";

  if (refreshMode === "always") {
    history = await refreshHistory();
  } else if (
    refreshMode === "missing" &&
    allowedIds.size > 0 &&
    Object.keys(history).length === 0
  ) {
    history = await refreshHistory();
  }

  const mappedTimelines = Object.entries(history).map<ProviderTimeline | null>(
    ([id, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      );

      if (sorted.length === 0) {
        return null;
      }

      // 附加官方状态到最新的 CheckResult
      const latest = { ...sorted[0] };
      const officialStatus = getOfficialStatus(latest.type);
      if (officialStatus) {
        latest.officialStatus = officialStatus;
      }

      return {
        id,
        items: sorted,
        latest,
      };
    }
  );

  // 为维护中的配置生成虚拟时间线
  const maintenanceTimelines = maintenanceConfigs.map<ProviderTimeline>((config) => {
    const latest: CheckResult = {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: config.endpoint,
      model: config.model,
      status: "maintenance",
      latencyMs: null,
      pingLatencyMs: null,
      message: "配置处于维护模式",
      checkedAt: new Date().toISOString(),
      groupName: config.groupName || null,
    };

    // 附加官方状态
    const officialStatus = getOfficialStatus(config.type);
    if (officialStatus) {
      latest.officialStatus = officialStatus;
    }

    return {
      id: config.id,
      items: [],
      latest,
    };
  });

  const providerTimelines = [
    ...mappedTimelines.filter((timeline): timeline is ProviderTimeline => Boolean(timeline)),
    ...maintenanceTimelines,
  ].sort((a, b) => a.latest.name.localeCompare(b.latest.name));

  const allEntries = providerTimelines
    .flatMap((timeline) => timeline.items)
    .sort(
      (a, b) =>
        new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
    );

  const lastUpdated = allEntries.length ? allEntries[0].checkedAt : null;
  const generatedAt = Date.now();

  // 生成分组数据
  const groupedTimelines = groupTimelines(providerTimelines);

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
