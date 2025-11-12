import { appendHistory } from "@/lib/history-store";
import { runProviderChecks } from "@/lib/checks";
import { getPollingIntervalMs } from "@/lib/polling-config";

const POLL_INTERVAL_MS = getPollingIntervalMs();

const globalWithPoller = globalThis as typeof globalThis & {
  __checkCxPoller?: NodeJS.Timeout;
  __checkCxPollerRunning?: boolean;
};

async function tick() {
  if (globalWithPoller.__checkCxPollerRunning) {
    console.log("[check-cx] 跳过 ping：上一轮仍在执行");
    return;
  }

  const startedAt = Date.now();
  console.log(
    `[check-cx] 后台 ping 开始（${new Date(startedAt).toISOString()}）`
  );

  globalWithPoller.__checkCxPollerRunning = true;
  try {
    const results = await runProviderChecks();
    if (results.length === 0) {
      console.log("[check-cx] 未检测到任何配置，本轮 ping 结束");
      return;
    }

    await appendHistory(results);

    const summary = results
      .map((result) => {
        const latency =
          typeof result.latencyMs === "number" ? `${result.latencyMs}ms` : "N/A";
        return `${result.name}:${result.status}(${latency})`;
      })
      .join(" | ");

    console.log(
      `[check-cx] 本轮 ping 完成，${results.length} 项，用时 ${
        Date.now() - startedAt
      }ms -> ${summary}`
    );
  } catch (error) {
    console.error("[check-cx] 轮询检测失败", error);
  } finally {
    globalWithPoller.__checkCxPollerRunning = false;
  }
}

if (!globalWithPoller.__checkCxPoller) {
  tick().catch((error) => console.error("[check-cx] 初次检测失败", error));
  globalWithPoller.__checkCxPoller = setInterval(() => {
    tick().catch((error) => console.error("[check-cx] 定时检测失败", error));
  }, POLL_INTERVAL_MS);
}
