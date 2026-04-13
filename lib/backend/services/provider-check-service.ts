import pLimit from "p-limit";

import { getCheckConcurrency } from "@/lib/backend/config/runtime-config";
import { checkWithAiSdk } from "@/lib/providers/ai-sdk-check";
import { getErrorMessage, getSanitizedErrorDetail, logError } from "@/lib/utils";
import type { CheckResult, ProviderConfig } from "@/lib/types";

const MAX_REQUEST_ABORT_RETRIES = 2;
const REQUEST_ABORTED_PATTERN = /request was aborted\.?/i;

function shouldRetryRequestAborted(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return REQUEST_ABORTED_PATTERN.test(message);
}

async function runCheckWithRetry(config: ProviderConfig): Promise<CheckResult> {
  for (let attempt = 0; attempt <= MAX_REQUEST_ABORT_RETRIES; attempt += 1) {
    try {
      const result = await checkWithAiSdk(config);
      if (
        result.status === "failed" &&
        shouldRetryRequestAborted(result.message) &&
        attempt < MAX_REQUEST_ABORT_RETRIES
      ) {
        console.warn(
          `[check-cx] ${config.name} 请求异常（Request was aborted），正在重试第 ${attempt + 2} 次`
        );
        continue;
      }
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      if (
        shouldRetryRequestAborted(message) &&
        attempt < MAX_REQUEST_ABORT_RETRIES
      ) {
        console.warn(
          `[check-cx] ${config.name} 请求异常（Request was aborted），正在重试第 ${attempt + 2} 次`
        );
        continue;
      }

      logError(`providerCheckService.runCheckWithRetry(${config.name})`, error);
      return {
        id: config.id,
        name: config.name,
        type: config.type,
        endpoint: config.endpoint,
        model: config.model,
        status: "error",
        latencyMs: null,
        pingLatencyMs: null,
        checkedAt: new Date().toISOString(),
        message,
        logMessage: getSanitizedErrorDetail(error),
        groupName: config.groupName ?? null,
      };
    }
  }

  throw new Error("Unexpected provider retry loop exit");
}

export async function runConfiguredChecks(
  configs: ProviderConfig[]
): Promise<CheckResult[]> {
  if (configs.length === 0) {
    return [];
  }

  const limit = pLimit(getCheckConcurrency());
  const results = await Promise.all(
    configs.map((config) => limit(() => runCheckWithRetry(config)))
  );

  return results.sort((left, right) => left.name.localeCompare(right.name));
}
