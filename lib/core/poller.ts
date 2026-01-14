/**
 * 后台轮询器
 * 在应用启动时自动初始化并持续运行
 */

import {historySnapshotStore} from "../database/history";
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {runProviderChecks} from "../providers";
import {getPollingIntervalMs} from "./polling-config";
import {getLastPingStartedAt, getPollerTimer, setLastPingStartedAt, setPollerTimer,} from "./global-state";
import {startOfficialStatusPoller} from "./official-status-poller";
import {ensurePollerLeadership, isPollerLeader} from "./poller-leadership";
import type {HealthStatus} from "../types";

const POLL_INTERVAL_MS = getPollingIntervalMs();

/**
 * 执行一次轮询检查
 */
async function tick() {
  try {
    await ensurePollerLeadership();
  } catch (error) {
    console.error("[check-cx] 主节点选举失败，跳过本轮轮询", error);
    return;
  }
  if (!isPollerLeader()) {
    console.log("[check-cx] 当前节点为 standby，跳过本轮轮询");
    return;
  }
  // 原子操作：检查并设置运行状态
  if (globalThis.__checkCxPollerRunning) {
    const lastStartedAt = getLastPingStartedAt();
    const duration = lastStartedAt ? Date.now() - lastStartedAt : null;
    console.log(
      `[check-cx] 跳过 ping：上一轮仍在执行${
        duration !== null ? `（已耗时 ${duration}ms）` : ""
      }`
    );
    return;
  }
  globalThis.__checkCxPollerRunning = true;

  const startedAt = Date.now();
  setLastPingStartedAt(startedAt);
  console.log(
    `[check-cx] 后台 ping 开始 · ${new Date(
      startedAt
    ).toISOString()} · interval=${POLL_INTERVAL_MS}ms`
  );
  try {
    const allConfigs = await loadProviderConfigsFromDB();
    // 过滤掉维护中的配置
    const configs = allConfigs.filter((cfg) => !cfg.is_maintenance);

    if (configs.length === 0) {
      console.log(`[check-cx] 数据库中未找到启用的配置，本轮 ping 结束`);
      return;
    }

    const results = await runProviderChecks(configs);

    console.log("[check-cx] 本轮检测明细：");
    results.forEach((result) => {
      const latency =
        typeof result.latencyMs === "number" ? `${result.latencyMs}ms` : "N/A";
      const pingLatency =
        typeof result.pingLatencyMs === "number"
          ? `${result.pingLatencyMs}ms`
          : "N/A";
      const sanitizedMessage = (result.message || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      console.log(
        `[check-cx]   · ${result.name}(${result.type}/${result.model}) -> ${
          result.status
        } | latency=${latency} | ping=${pingLatency} | endpoint=${
          result.endpoint
        } | message=${
          sanitizedMessage || "无"
        }`
      );
    });

    console.log(`[check-cx] 正在写入历史记录（${results.length} 条）…`);
    await historySnapshotStore.append(results);
    const providerCount = new Set(results.map((item) => item.id)).size;
    console.log(
      `[check-cx] 历史记录更新完成：providers=${providerCount}，本轮新增=${results.length}`
    );

    const statusCounts: Record<HealthStatus, number> = {
      operational: 0,
      degraded: 0,
      failed: 0,
      validation_failed: 0,
      maintenance: 0,
      error: 0,
    };
    results.forEach((result) => {
      statusCounts[result.status] += 1;
    });

    const elapsed = Date.now() - startedAt;
    const nextSchedule = new Date(startedAt + POLL_INTERVAL_MS).toISOString();

    console.log(
      `[check-cx] 本轮 ping 完成，用时 ${elapsed}ms；operational=${
        statusCounts.operational
      } degraded=${statusCounts.degraded} failed=${
        statusCounts.failed
      } error=${statusCounts.error}。下次预计 ${nextSchedule}`
    );
  } catch (error) {
    console.error("[check-cx] 轮询检测失败", error);
  } finally {
    globalThis.__checkCxPollerRunning = false;
  }
}

// 自动初始化轮询器
if (!getPollerTimer()) {
  const firstCheckAt = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();
  console.log(
    `[check-cx] 初始化后台轮询器，interval=${POLL_INTERVAL_MS}ms，首次检测预计 ${firstCheckAt}`
  );
  ensurePollerLeadership().catch((error) => {
    console.error("[check-cx] 初始化主节点选举失败", error);
  });
  const timer = setInterval(() => {
    tick().catch((error) => console.error("[check-cx] 定时检测失败", error));
  }, POLL_INTERVAL_MS);
  setPollerTimer(timer);

  // 启动官方状态轮询器
  startOfficialStatusPoller();
}
