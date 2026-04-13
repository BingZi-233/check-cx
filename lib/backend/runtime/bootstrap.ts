import { getPollingIntervalMs } from "@/lib/backend/config/runtime-config";
import { listProviderConfigs } from "@/lib/backend/repositories/config-repository";
import { historyRepository } from "@/lib/backend/repositories/history-repository";
import {
  getLastPollStartedAt,
  getPollerTimer,
  isPollerRunning,
  setLastPollStartedAt,
  setPollerRunning,
  setPollerTimer,
} from "@/lib/backend/runtime/registry";
import { ensureOfficialStatusRuntime } from "@/lib/backend/services/official-status-service";
import { ensurePollerLeadership, isPollerLeader } from "@/lib/backend/services/poller-leadership-service";
import { runConfiguredChecks } from "@/lib/backend/services/provider-check-service";
import type { CheckResult, HealthStatus } from "@/lib/types";

const FAILURE_STATUSES: ReadonlySet<HealthStatus> = new Set([
  "failed",
  "validation_failed",
  "error",
]);

function isFailureResult(result: CheckResult): boolean {
  return FAILURE_STATUSES.has(result.status);
}

function formatDuration(value: number | null): string {
  return typeof value === "number" ? `${value}ms` : "N/A";
}

function normalizeGroupName(groupName: string | null | undefined): string {
  return groupName?.trim() || "默认分组";
}

function logFullMessage(message: string): void {
  for (const line of message.replace(/\r\n/g, "\n").split("\n")) {
    console.error(`[check-cx]     message: ${line}`);
  }
}

function logFailedResultsByGroup(results: CheckResult[]): void {
  const failedResults = results.filter(isFailureResult);
  if (failedResults.length === 0) {
    return;
  }

  const groupedResults = new Map<string, CheckResult[]>();
  for (const result of failedResults) {
    const groupName = normalizeGroupName(result.groupName);
    const items = groupedResults.get(groupName);
    if (items) {
      items.push(result);
      continue;
    }
    groupedResults.set(groupName, [result]);
  }

  console.error("[check-cx] ==================================================");
  console.error(
    `[check-cx] 本轮检测失败批次：共 ${failedResults.length} 条，分为 ${groupedResults.size} 组`
  );

  for (const [groupName, items] of [...groupedResults.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    console.error(`[check-cx] [${groupName}] ${items.length} 条`);
    for (const result of items.sort((left, right) => left.name.localeCompare(right.name))) {
      console.error(
        `[check-cx]   - ${result.name}(${result.type}/${result.model}) -> ${result.status} | latency=${formatDuration(
          result.latencyMs
        )} | ping=${formatDuration(result.pingLatencyMs)} | endpoint=${result.endpoint}`
      );
      logFullMessage(result.logMessage || result.message || "无");
    }
    console.error("[check-cx] --------------------------------------------------");
  }

  console.error("[check-cx] ====================== 批次结束 =====================");
}

export async function runPollerCycle(): Promise<void> {
  try {
    await ensurePollerLeadership();
  } catch (error) {
    console.error("[check-cx] 主节点选举失败，跳过本轮轮询", error);
    return;
  }

  if (!isPollerLeader()) {
    return;
  }

  if (isPollerRunning()) {
    const lastStartedAt = getLastPollStartedAt();
    const duration = lastStartedAt ? Date.now() - lastStartedAt : null;
    console.log(
      `[check-cx] 跳过 ping：上一轮仍在执行${duration !== null ? `（已耗时 ${duration}ms）` : ""}`
    );
    return;
  }

  setPollerRunning(true);
  setLastPollStartedAt(Date.now());

  try {
    const configs = (await listProviderConfigs()).filter((config) => !config.is_maintenance);
    if (configs.length === 0) {
      return;
    }

    const results = await runConfiguredChecks(configs);
    await historyRepository.append(results);
    logFailedResultsByGroup(results);
  } catch (error) {
    console.error("[check-cx] 轮询检测失败", error);
  } finally {
    setPollerRunning(false);
  }
}

let runtimeInitPromise: Promise<void> | null = null;

export async function ensureBackendRuntime(): Promise<void> {
  if (getPollerTimer()) {
    return;
  }
  if (runtimeInitPromise) {
    return runtimeInitPromise;
  }

  runtimeInitPromise = (async () => {
    const pollIntervalMs = getPollingIntervalMs();
    console.log(
      `[check-cx] 初始化后台轮询运行时，interval=${pollIntervalMs}ms`
    );

    await ensurePollerLeadership().catch((error) => {
      console.error("[check-cx] 初始化主节点选举失败", error);
    });

    const timer = setInterval(() => {
      runPollerCycle().catch((error) => {
        console.error("[check-cx] 定时检测失败", error);
      });
    }, pollIntervalMs);

    setPollerTimer(timer);
    ensureOfficialStatusRuntime();
  })();

  await runtimeInitPromise;
}
