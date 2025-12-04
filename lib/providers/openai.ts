/**
 * OpenAI Provider 健康检查
 * - 标准 /chat/completions 端点使用官方 SDK
 * - /responses 端点使用 Responses API
 */

import OpenAI, { APIUserAbortError } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

import type { CheckResult, HealthStatus, ProviderConfig } from "../types";
import { DEFAULT_ENDPOINTS } from "../types";
import { getOrCreateClientCache, stableStringify } from "../utils";
import { measureEndpointPing } from "./endpoint-ping";

/**
 * 默认超时时间 (毫秒)
 * 与其他 Provider 保持一致
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * 性能降级阈值 (毫秒)
 * 与其他 Provider 保持一致
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

function getOpenAIErrorMessage(error: Error & { name?: string }): string {
  if (isAbortLikeError(error)) {
    return "请求超时";
  }
  return error?.message || "未知错误";
}

/**
 * OpenAI 客户端全局缓存
 * key = baseURL + apiKey，用于复用连接和内部缓存
 *
 * 注意: 全局类型声明在 lib/utils/client-cache.ts 中统一定义
 */
const openAIClientCache = getOrCreateClientCache<OpenAI>("__CHECK_CX_OPENAI_CLIENTS__");

type ReasoningEffortValue = NonNullable<
  ChatCompletionCreateParamsStreaming["reasoning_effort"]
>;

const EFFORT_ALIAS_MAP: Record<string, ReasoningEffortValue> = {
  mini: "minimal",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
};

// 部分 OpenAI 兼容网关（例如 PackyAPI）要求显式传递 reasoning_effort，
// 因此在未指定指令时为常见的推理模型提供一个安全的默认值。
const REASONING_MODEL_HINTS = [
  /codex/i,
  /\bgpt-5/i,
  /\bo[1-9]/i,
  /deepseek-r1/i,
  /qwq/i,
];

function resolveModelPreferences(model: string): {
  requestModel: string;
  reasoningEffort?: ReasoningEffortValue;
} {
  const trimmed = model.trim();
  if (!trimmed) {
    return { requestModel: model };
  }

  const directiveMatch = trimmed.match(
    /^(.*?)[@#](mini|minimal|low|medium|high)$/i
  );
  if (directiveMatch) {
    const [, base, effortRaw] = directiveMatch;
    const normalizedBase = base.trim() || trimmed;
    const normalizedEffort =
      EFFORT_ALIAS_MAP[
        effortRaw.toLowerCase() as keyof typeof EFFORT_ALIAS_MAP
      ];
    return {
      requestModel: normalizedBase,
      reasoningEffort: normalizedEffort,
    };
  }

  if (REASONING_MODEL_HINTS.some((regex) => regex.test(trimmed))) {
    return { requestModel: trimmed, reasoningEffort: "medium" };
  }

  return { requestModel: trimmed };
}

/**
 * 从配置的 endpoint 推导 openai SDK 的 baseURL
 *
 * 配置中存储的是完整路径（如 https://api.openai.com/v1/chat/completions），
 * 只需去掉 /chat/completions 后缀即可得到 SDK 所需的 baseURL
 */
function deriveOpenAIBaseURL(endpoint: string | null | undefined): string {
  const raw = endpoint || DEFAULT_ENDPOINTS.openai;
  const [withoutQuery] = raw.split("?");
  return withoutQuery.replace(/\/chat\/completions\/?$/, "");
}

/**
 * 获取（或创建）复用的 OpenAI 客户端
 */
function getOpenAIClient(config: ProviderConfig): OpenAI {
  const baseURL = deriveOpenAIBaseURL(config.endpoint);
  // 缓存 key 必须包含 requestHeaders，否则不同 header 配置会共用同一个客户端
  const headersKey = stableStringify(config.requestHeaders);
  const cacheKey = `${baseURL}::${config.apiKey}::${headersKey}`;

  const cached = openAIClientCache.get(cacheKey);
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
    // 某些代理/网关（例如启用了 Cloudflare「封锁 AI 爬虫」规则的站点）
    // 会对默认的 OpenAI User-Agent（如 `OpenAI/TS ...`）返回 402 Your request was blocked.
    // 这里统一改成一个普通应用的 UA，避免被误判为爬虫。
    defaultHeaders,
    // 禁用 Next.js fetch 缓存，避免 AbortController 中止请求时的缓存错误
    fetch: (url, init) =>
      fetch(url, { ...init, cache: "no-store" }),
  });

  openAIClientCache.set(cacheKey, client);
  return client;
}

/**
 * 检查 endpoint 是否是 /responses 路径（OpenAI Responses API）
 */
function isResponsesEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  const [withoutQuery] = endpoint.split("?");
  return /\/responses\/?$/.test(withoutQuery);
}

/**
 * 从 /responses 端点推导 OpenAI SDK 的 baseURL
 * 例如：https://privnode.com/v1/responses -> https://privnode.com/v1
 */
function deriveResponsesBaseURL(endpoint: string): string {
  const [withoutQuery] = endpoint.split("?");
  return withoutQuery.replace(/\/responses\/?$/, "");
}

/**
 * 获取 Responses API 客户端（缓存独立于 Chat Completions）
 */
function getResponsesClient(config: ProviderConfig): OpenAI {
  const baseURL = deriveResponsesBaseURL(config.endpoint!);
  // 缓存 key 必须包含 requestHeaders
  const headersKey = stableStringify(config.requestHeaders);
  const cacheKey = `responses::${baseURL}::${config.apiKey}::${headersKey}`;

  const cached = openAIClientCache.get(cacheKey);
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

  openAIClientCache.set(cacheKey, client);
  return client;
}

/**
 * 使用 Responses API 检查（/v1/responses 端点）
 */
async function checkOpenAIResponses(
  config: ProviderConfig
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  const displayEndpoint = config.endpoint!;
  const pingPromise = measureEndpointPing(displayEndpoint);
  const { requestModel, reasoningEffort } = resolveModelPreferences(config.model);

  try {
    const client = getResponsesClient(config);

    // 构建 Responses API 请求参数
    // 使用数组格式的 input 以兼容更多代理
    const requestParams: Parameters<typeof client.responses.create>[0] = {
      model: requestModel,
      input: [{ type: "message", role: "user", content: "hi" }],
      stream: true,
      // 合并 metadata 中的自定义参数
      ...(config.metadata || {}),
    };

    // Responses API 使用 reasoning.effort 而非 reasoning_effort
    if (reasoningEffort) {
      (requestParams as Record<string, unknown>).reasoning = { effort: reasoningEffort };
    }

    const stream = await client.responses.create(requestParams, {
      signal: controller.signal,
    });

    // 读取首个事件即可确认服务可用
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream as AsyncIterable<unknown>) {
      break;
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
    const message = getOpenAIErrorMessage(err);

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

/**
 * 检查 OpenAI API 健康状态（流式）
 */
export async function checkOpenAI(
  config: ProviderConfig
): Promise<CheckResult> {
  // Responses API 端点
  if (isResponsesEndpoint(config.endpoint)) {
    return checkOpenAIResponses(config);
  }

  // 非标准端点暂不支持，回退到默认 Chat Completions
  // 如需支持其他端点，可在此添加分支

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  const displayEndpoint = config.endpoint || DEFAULT_ENDPOINTS.openai;
  const pingPromise = measureEndpointPing(displayEndpoint);
  const { requestModel, reasoningEffort } = resolveModelPreferences(
    config.model
  );

  try {
    const client = getOpenAIClient(config);

    // 使用 Chat Completions 流式接口进行最小请求
    const requestPayload: ChatCompletionCreateParamsStreaming = {
      model: requestModel,
      messages: [
        { role: "system", content: "" },
        { role: "assistant", content: "" },
        { role: "user", content: "hi" },
      ],
      max_tokens: 1,
      temperature: 0,
      stream: true,
      // 合并 metadata 中的自定义参数
      ...(config.metadata as Partial<ChatCompletionCreateParamsStreaming> || {}),
    };

    if (reasoningEffort) {
      requestPayload.reasoning_effort = reasoningEffort;
    }

    const stream = await client.chat.completions.create(requestPayload, {
      signal: controller.signal,
    });

    // 读取完整的流式响应（内容本身不重要，只要能成功流式返回即可）
    for await (const chunk of stream) {
      // 这里不需要组装完整内容，仅保证流可读
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
    const message = getOpenAIErrorMessage(err);

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
