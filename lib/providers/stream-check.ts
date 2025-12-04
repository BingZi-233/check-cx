/**
 * 流式响应检查通用逻辑
 */

import type { CheckResult, HealthStatus, ProviderConfig } from "../types";
import { DEFAULT_ENDPOINTS } from "../types";
import { extractMessage } from "../utils";
import { measureEndpointPing } from "./endpoint-ping";

/**
 * 默认超时时间 (毫秒)
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * 性能降级阈值 (毫秒)
 */
const DEGRADED_THRESHOLD_MS = 6_000;

/**
 * 流式响应解析器类型
 */
export type StreamParser = (
  reader: ReadableStreamDefaultReader<Uint8Array>
) => Promise<string>;

/**
 * 流式检查参数
 */
export interface StreamCheckParams {
  url: string;
  displayEndpoint?: string;
  init: RequestInit;
  parseStream: StreamParser;
  headers?: Record<string, string> | null;
}

/**
 * 运行流式检查
 */
export async function runStreamCheck(
  config: ProviderConfig,
  params: StreamCheckParams
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  const displayEndpoint =
    params.displayEndpoint || config.endpoint || DEFAULT_ENDPOINTS[config.type];
  const pingPromise = measureEndpointPing(displayEndpoint);

  // 构建请求头，如果没有自定义 User-Agent 则使用默认值
  const requestHeaders: Record<string, string> = {
    "User-Agent": "check-cx/0.1.0",
    ...(config.requestHeaders || {}),
    ...(params.headers || {}),
  };

  try {
    const response = await fetch(params.url, {
      method: "POST",
      signal: controller.signal,
      ...params.init,
      headers: {
        ...requestHeaders,
        ...(params.init.headers || {}),
      },
    });

    if (!response.ok) {
      const latencyMs = Date.now() - startedAt;
      const errorBody = await response.text();
      const message = extractMessage(errorBody) || `HTTP ${response.status}`;

      const pingLatencyMs = await pingPromise;
      return {
        id: config.id,
        name: config.name,
        type: config.type,
        endpoint: params.displayEndpoint || params.url,
        model: config.model,
        status: "failed",
        latencyMs,
        pingLatencyMs,
        checkedAt: new Date().toISOString(),
        message,
      };
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();

    // 解析流式响应
    await params.parseStream(reader);

    const latencyMs = Date.now() - startedAt;
    const status: HealthStatus =
      latencyMs <= DEGRADED_THRESHOLD_MS ? "operational" : "degraded";

    const message =
      status === "degraded"
        ? `响应成功但耗时 ${latencyMs}ms`
        : `流式响应正常 (${latencyMs}ms)`;

    const pingLatencyMs = await pingPromise;
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status,
      latencyMs,
      pingLatencyMs,
      checkedAt: new Date().toISOString(),
      message,
    };
  } catch (error) {
    const err = error as Error & { name?: string };
    const isAbortError =
      err?.name === "AbortError" ||
      /request was aborted/i.test(err?.message || "");
    const message = isAbortError ? "请求超时" : err?.message || "未知错误";
    const pingLatencyMs = await pingPromise;
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status: "failed",
      latencyMs: null,
      pingLatencyMs,
      checkedAt: new Date().toISOString(),
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
