/**
 * Anthropic Provider 健康检查（使用官方 @anthropic-ai/sdk）
 */

import Anthropic, {
  APIUserAbortError as AnthropicAPIUserAbortError,
} from "@anthropic-ai/sdk";

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
  if (error instanceof AnthropicAPIUserAbortError) {
    return true;
  }
  return REQUEST_ABORTED_MESSAGE.test(error.message || "");
}

function getAnthropicErrorMessage(error: Error & { name?: string }): string {
  if (isAbortLikeError(error)) {
    return "请求超时";
  }
  return error?.message || "未知错误";
}

/**
 * Anthropic 客户端全局缓存
 * key = baseURL + apiKey，用于复用连接和内部缓存
 *
 * 注意: 全局类型声明在 lib/utils/client-cache.ts 中统一定义
 */
const anthropicClientCache = getOrCreateClientCache<Anthropic>("__CHECK_CX_ANTHROPIC_CLIENTS__");

/**
 * 从配置的 endpoint 推导 Anthropic SDK 的 baseURL
 *
 * 配置中存储的是完整路径（如 https://api.anthropic.com/v1/messages），
 * 只需去掉 /v1/messages 后缀即可得到 SDK 所需的 baseURL
 */
function deriveAnthropicBaseURL(
  endpoint: string | null | undefined
): string {
  const raw = endpoint || DEFAULT_ENDPOINTS.anthropic;
  const [withoutQuery] = raw.split("?");
  return withoutQuery.replace(/\/v1\/messages\/?$/, "");
}

/**
 * 获取（或创建）复用的 Anthropic 客户端
 */
function getAnthropicClient(config: ProviderConfig): Anthropic {
  const baseURL = deriveAnthropicBaseURL(config.endpoint);
  // 缓存 key 必须包含 requestHeaders，否则不同 header 配置会共用同一个客户端
  const headersKey = stableStringify(config.requestHeaders);
  const cacheKey = `${baseURL}::${config.apiKey}::${headersKey}`;

  const cached = anthropicClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 构建默认 headers，自定义 headers 会覆盖默认值
  const defaultHeaders: Record<string, string> = {
    "User-Agent": "check-cx/0.1.0",
    ...(config.requestHeaders || {}),
  };

  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL,
    // 某些代理/网关（例如启用了 Cloudflare「封锁 AI 爬虫」规则的站点）
    // 会对默认的 Anthropic User-Agent（如 `anthropic-ts-sdk/...`）返回 402 Your request was blocked.
    // 这里统一改成一个普通应用的 UA，避免被误判为爬虫。
    defaultHeaders,
    // 禁用 Next.js fetch 缓存，避免 AbortController 中止请求时的缓存错误
    fetch: (url, init) =>
      fetch(url, { ...init, cache: "no-store" }),
  });

  anthropicClientCache.set(cacheKey, client);
  return client;
}

/**
 * 检查 Anthropic API 健康状态（流式）
 */
export async function checkAnthropic(
  config: ProviderConfig
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  const displayEndpoint = config.endpoint || DEFAULT_ENDPOINTS.anthropic;
  const pingPromise = measureEndpointPing(displayEndpoint);

  try {
    const client = getAnthropicClient(config);

    // 使用 Messages 流式接口进行最小请求
    const stream = await client.messages.create(
      {
        model: config.model,
        max_tokens: 1, // 仅需 1 个 token 即可确认服务可用
        messages: [{ role: "user", content: "hi" }], // 最简短的消息
        stream: true, // 启用流式响应
        // 合并 metadata 中的自定义参数
        ...(config.metadata || {}),
      },
      { signal: controller.signal }
    );

    // 读取完整的流式响应（内容本身不重要，只要能成功流式返回即可）
    // 只需确保至少收到一个事件即可证明流可用
    // 若长时间无事件，外层 AbortController 会触发超时
    const iterator = stream[Symbol.asyncIterator]();
    const { done } = await iterator.next();
    if (!done) {
      // 主动结束流，避免无意义的长时间占用
      if (typeof (iterator as AsyncIterator<unknown> & { return?: () => void })
        .return === "function") {
        await (
          iterator as AsyncIterator<unknown> & { return?: () => void }
        ).return?.();
      }
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
    const message = getAnthropicErrorMessage(err);

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
