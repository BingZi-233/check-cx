/**
 * Gemini Provider 健康检查（使用 OpenAI 兼容接口）
 *
 * Gemini 原生 SDK 不支持自定义 baseURL，但可以使用 OpenAI 兼容的请求方式
 */

import OpenAI, { APIUserAbortError } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

import type { CheckResult, HealthStatus, ProviderConfig } from "../types";
import { DEFAULT_ENDPOINTS } from "../types";
import { getOrCreateClientCache, stableStringify } from "../utils";
import { measureEndpointPing } from "./endpoint-ping";

/**
 * 默认超时时间 (毫秒)
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * 性能降级阈值 (毫秒)
 */
const DEGRADED_THRESHOLD_MS = 6_000;

const REQUEST_ABORTED_MESSAGE = /request was aborted/i;

function isAbortLikeError(error: Error & { name?: string }): boolean {
  if (!error) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  if (error instanceof APIUserAbortError) {
    return true;
  }
  return REQUEST_ABORTED_MESSAGE.test(error.message || "");
}

function getGeminiErrorMessage(error: Error & { name?: string }): string {
  if (isAbortLikeError(error)) {
    return "请求超时";
  }
  return error?.message || "未知错误";
}

/**
 * Gemini 客户端全局缓存
 * key = baseURL + apiKey，用于复用连接和内部缓存
 *
 * 注意: 全局类型声明在 lib/utils/client-cache.ts 中统一定义
 */
const geminiClientCache = getOrCreateClientCache<OpenAI>("__CHECK_CX_GEMINI_CLIENTS__");

/**
 * 从配置的 endpoint 推导 baseURL
 *
 * 配置中存储的是完整路径（如 https://xxx/v1/chat/completions），
 * 只需去掉 /chat/completions 后缀即可得到 SDK 所需的 baseURL
 */
function deriveGeminiBaseURL(endpoint: string | null | undefined): string {
  const raw = endpoint || DEFAULT_ENDPOINTS.gemini;
  const [withoutQuery] = raw.split("?");
  return withoutQuery.replace(/\/chat\/completions\/?$/, "");
}

/**
 * 获取（或创建）复用的 OpenAI 客户端
 */
function getGeminiClient(config: ProviderConfig): OpenAI {
  const baseURL = deriveGeminiBaseURL(config.endpoint);
  // 缓存 key 必须包含 requestHeaders，否则不同 header 配置会共用同一个客户端
  const headersKey = stableStringify(config.requestHeaders);
  const cacheKey = `${baseURL}::${config.apiKey}::${headersKey}`;

  const cached = geminiClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 构建默认 headers，如果没有自定义 User-Agent 则使用默认值
  const defaultHeaders: Record<string, string> = {
    "User-Agent": "check-cx/0.1.0",
    ...(config.requestHeaders || {}),
  };

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL,
    defaultHeaders,
    // 禁用 Next.js fetch 缓存，避免 AbortController 中止请求时的缓存错误
    fetch: (url, init) =>
      fetch(url, { ...init, cache: "no-store" }),
  });

  geminiClientCache.set(cacheKey, client);
  return client;
}

/**
 * 检查 Gemini API 健康状态（使用 OpenAI 兼容接口）
 */
export async function checkGemini(
  config: ProviderConfig
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  const displayEndpoint = config.endpoint || DEFAULT_ENDPOINTS.gemini;
  const pingPromise = measureEndpointPing(displayEndpoint);

  try {
    const client = getGeminiClient(config);

    // 使用 OpenAI 兼容的 Chat Completions 流式接口
    const requestPayload: ChatCompletionCreateParamsStreaming = {
      model: config.model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
      temperature: 0,
      stream: true,
      // 合并 metadata 中的自定义参数
      ...(config.metadata as Partial<ChatCompletionCreateParamsStreaming> || {}),
    };

    const stream = await client.chat.completions.create(requestPayload, {
      signal: controller.signal,
    });

    // 读取流式响应
    for await (const chunk of stream) {
      // 仅保证流可读，不需要组装完整内容
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      chunk.choices?.[0]?.delta?.content;
    }

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
      endpoint: displayEndpoint,
      model: config.model,
      status,
      latencyMs,
      pingLatencyMs,
      checkedAt: new Date().toISOString(),
      message,
    };
  } catch (error) {
    const err = error as Error & { name?: string };
    const message = getGeminiErrorMessage(err);

    const pingLatencyMs = await pingPromise;
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: displayEndpoint,
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
