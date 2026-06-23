/**
 * 统一的 AI SDK 健康检查模块
 *
 * 使用 Vercel AI SDK 统一处理多种 AI Provider 的健康检查：
 * - OpenAI：支持 Chat Completions API (/v1/chat/completions) 和 Responses API (/v1/responses)
 * - Anthropic：Claude 系列模型
 * - Gemini：通过 OpenAI 兼容模式接入
 *
 * 核心流程：
 * 1. 根据 Provider 类型创建对应的 SDK 实例
 * 2. 发送数学挑战问题，验证模型真实可用性
 * 3. 通过流式响应快速获取首个 token，测量延迟
 * 4. 根据延迟阈值判定健康状态（operational/degraded/failed）
 *
 * 特殊支持：
 * - 推理模型（o1/o3/deepseek-r1 等）的 reasoning_effort 参数
 * - 自定义请求头和 metadata 注入
 * - 端点 Ping 延迟测量
 */

import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import type { CheckResult, HealthStatus, ProviderConfig } from "../types";
import { DEFAULT_ENDPOINTS } from "../types";
import { getSanitizedErrorDetail } from "../utils";
import { generateChallenge, validateResponse } from "./challenge";
import { measureEndpointPing } from "./endpoint-ping";

/* ============================================================================
 * 常量定义
 * ============================================================================ */

/** 默认超时时间（毫秒）- 45 秒，兼顾慢速模型的首次响应 */
const DEFAULT_TIMEOUT_MS = 45_000;

/** 性能降级阈值（毫秒）- 超过此值标记为 degraded 状态 */
const DEGRADED_THRESHOLD_MS = 6_000;

/** 需要从 metadata 中排除的字段，这些字段会与 streamText 内部参数冲突 */
const EXCLUDED_METADATA_KEYS = new Set(["model", "prompt", "messages", "abortSignal"]);

/** 用于从完整端点 URL 中提取 baseURL 的正则表达式 */
const API_PATH_SUFFIX_REGEX = /\/(chat\/completions|responses|messages)\/?$/;

/** 原生 Gemini 端点识别正则：包含 /models/ 且以 :generateContent 或 :streamGenerateContent 结尾 */
const GOOGLE_GENERATIVE_API_REGEX = /\/v\d+\w*\/models\/[^/:]+:(generateContent|streamGenerateContent)\/?$/;

/**
 * 判断端点是否为原生 Gemini API
 *
 * 原生 Gemini API 格式：
 * - https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
 * - https://generativelanguage.googleapis.com/v1/models/gemini-pro:streamGenerateContent
 */
function isGoogleGenerativeEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  return GOOGLE_GENERATIVE_API_REGEX.test(endpoint);
}

/**
 * 从原生 Gemini 端点中提取 baseURL
 *
 * @example
 * extractGoogleBaseURL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent")
 * // => "https://generativelanguage.googleapis.com/v1beta"
 */
function extractGoogleBaseURL(endpoint: string): string {
  const match = endpoint.match(/^(https:\/\/generativelanguage\.googleapis\.com\/v\d+\w*)/);
  return match?.[1] || endpoint;
}

/* ============================================================================
 * URL 处理工具函数
 * ============================================================================ */

/**
 * 从完整端点 URL 中提取 SDK 所需的 baseURL
 *
 * AI SDK 需要 baseURL（如 https://api.openai.com/v1），
 * 而用户配置的往往是完整端点（如 https://api.openai.com/v1/chat/completions）
 *
 * @example
 * deriveBaseURL("https://api.openai.com/v1/chat/completions")
 * // => "https://api.openai.com/v1"
 */
function deriveBaseURL(endpoint: string): string {
  const [pathWithoutQuery] = endpoint.split("?");
  return pathWithoutQuery.replace(API_PATH_SUFFIX_REGEX, "");
}

/**
 * 将配置端点上的查询参数合并到实际请求 URL 中
 *
 * SDK 在内部会基于 baseURL 重新拼接请求地址，导致配置在 endpoint 上的查询参数丢失。
 * 这里统一把配置参数补回去，避免出现“配置了但请求没带上”的破事。
 */
function mergeEndpointQueryParams(
  input: RequestInfo | URL,
  endpoint: string
): RequestInfo | URL {
  let requestUrl: URL;

  try {
    requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  } catch {
    return input;
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return input;
  }

  if (!endpointUrl.search) {
    return input;
  }

  for (const key of new Set(endpointUrl.searchParams.keys())) {
    requestUrl.searchParams.delete(key);
    for (const value of endpointUrl.searchParams.getAll(key)) {
      requestUrl.searchParams.append(key, value);
    }
  }

  if (input instanceof Request) {
    return new Request(requestUrl, input);
  }

  return requestUrl;
}

/**
 * 判断端点是否为 OpenAI Responses API
 *
 * OpenAI 提供两种 API：
 * - Chat Completions API (/v1/chat/completions)：传统对话接口
 * - Responses API (/v1/responses)：新版接口，支持更多功能
 */
function isResponsesEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  const [pathWithoutQuery] = endpoint.split("?");
  return /\/responses\/?$/.test(pathWithoutQuery);
}

/* ============================================================================
 * 推理模型支持
 * ============================================================================ */

/**
 * 推理强度级别
 *
 * 用于 OpenAI 推理模型（o1/o3 系列）的 reasoning_effort 参数：
 * - low：快速推理，token 消耗少
 * - medium：平衡模式（推理模型默认值）
 * - high：深度推理，结果更准确但 token 消耗多
 */
type ReasoningEffort = "low" | "medium" | "high";

/**
 * 推理强度别名映射
 *
 * 支持多种别名提高配置灵活性：mini/minimal → low
 */
const REASONING_EFFORT_ALIASES: Record<string, ReasoningEffort> = {
  mini: "low",
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
};

/**
 * 推理模型识别规则
 *
 * 匹配以下模型系列，自动启用 reasoning_effort：
 * - OpenAI o1/o3 系列、Codex、GPT-5（预留）
 * - DeepSeek R1
 * - 通义千问 QwQ
 */
const REASONING_MODEL_PATTERNS = [
  /codex/i,
  /\bgpt-5/i,
  /\bo[1-9](?:-|$)/i,
  /\bdeepseek-r1/i,
  /\bqwq/i,
];

/**
 * 解析模型名称中的推理强度指令
 *
 * 支持在模型名称后使用 @ 或 # 指定推理强度：
 * - "o1@high" → 使用 high 推理强度
 * - "o1#low" → 使用 low 推理强度
 * - "o1" → 推理模型默认使用 medium，普通模型不设置
 *
 * @example
 * parseModelDirective("o1@high")    // => { modelId: "o1", reasoningEffort: "high" }
 * parseModelDirective("gpt-4o")     // => { modelId: "gpt-4o" }
 * parseModelDirective("o1")         // => { modelId: "o1", reasoningEffort: "medium" }
 */
function parseModelDirective(model: string): {
  modelId: string;
  reasoningEffort?: ReasoningEffort;
} {
  const trimmed = model.trim();
  if (!trimmed) return { modelId: model };

  // 匹配 model@effort 或 model#effort 格式
  const directiveMatch = trimmed.match(/^(.*?)[@#](mini|minimal|low|medium|high)$/i);
  if (directiveMatch) {
    const [, baseModel, effortKey] = directiveMatch;
    return {
      modelId: baseModel.trim() || trimmed,
      reasoningEffort: REASONING_EFFORT_ALIASES[effortKey.toLowerCase()],
    };
  }

  // 推理模型默认使用 medium
  const isReasoningModel = REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (isReasoningModel) {
    return { modelId: trimmed, reasoningEffort: "medium" };
  }

  return { modelId: trimmed };
}

/* ============================================================================
 * 请求定制工具
 * ============================================================================ */

/**
 * 过滤 metadata 中与 SDK 冲突的保留字段
 *
 * model/prompt/messages/abortSignal 等字段由 SDK 内部管理，
 * 用户自定义的 metadata 中如果包含这些字段会导致冲突
 */
function filterMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!metadata) return null;

  const filtered = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !EXCLUDED_METADATA_KEYS.has(key))
  );

  return Object.keys(filtered).length > 0 ? filtered : null;
}

/**
 * 创建自定义 fetch 函数
 *
 * 拦截 SDK 的 HTTP 请求，实现：
 * 1. 注入自定义请求头（User-Agent、认证头等）
 * 2. 将 metadata 合并到请求体中（用于传递额外参数）
 *
 * @param metadata - 要合并到请求体的额外参数
 * @param headers - 要注入的自定义请求头
 */
function createCustomFetch(
  endpoint: string,
  metadata: Record<string, unknown> | null,
  headers: Record<string, string>
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestInput = mergeEndpointQueryParams(input, endpoint);

    // 使用 Headers API 确保用户 headers 完全覆盖 SDK headers
    const mergedHeaders = new Headers(init?.headers);
    for (const [key, value] of Object.entries(headers)) {
      mergedHeaders.set(key, value); // set 会覆盖，append 会追加
    }

    // 非 POST 请求或无 body 时，仅注入 headers
    if (init?.method?.toUpperCase() !== "POST" || !init.body) {
      return fetch(requestInput, { ...init, headers: mergedHeaders });
    }

    // POST 请求：尝试将 metadata 合并到请求体
    try {
      const originalBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      const mergedBody = metadata ? { ...originalBody, ...metadata } : originalBody;
      return fetch(requestInput, {
        ...init,
        headers: mergedHeaders,
        body: JSON.stringify(mergedBody),
      });
    } catch {
      // JSON 解析失败时，仅注入 headers
      return fetch(requestInput, { ...init, headers: mergedHeaders });
    }
  };
}

/* ============================================================================
 * SDK 模型实例创建
 * ============================================================================ */

/**
 * 创建 AI SDK 模型实例
 *
 * 根据 Provider 类型创建对应的 SDK 实例：
 * - openai：使用 @ai-sdk/openai，支持 Chat Completions 和 Responses API
 * - anthropic：使用 @ai-sdk/anthropic
 * - gemini：使用 @ai-sdk/openai-compatible（OpenAI 兼容模式）
 *
 * @returns 包含模型实例、推理强度和 API 类型标识的对象
 * @throws 当 Provider 类型不支持时抛出错误
 */
function createModel(config: ProviderConfig) {
  const endpoint = config.endpoint?.trim() || DEFAULT_ENDPOINTS[config.type];
  const baseURL = deriveBaseURL(endpoint);
  const { modelId, reasoningEffort } = parseModelDirective(config.model);

  // 构建自定义 fetch（注入 headers 和 metadata）
  const headers: Record<string, string> = {
    "User-Agent": "check-cx/0.1.0",
    ...config.requestHeaders,
  };
  const customFetch = createCustomFetch(endpoint, filterMetadata(config.metadata), headers);

  switch (config.type) {
    case "openai": {
      const provider = createOpenAI({ apiKey: config.apiKey, baseURL, fetch: customFetch });

      // Responses API 使用 provider.responses()，Chat Completions 使用 provider.chat()
      const isResponses = isResponsesEndpoint(endpoint);
      return {
        model: isResponses ? provider.responses(modelId) : provider.chat(modelId),
        reasoningEffort,
        isResponses,
      };
    }

    case "anthropic": {
      const provider = createAnthropic({ apiKey: config.apiKey, baseURL, fetch: customFetch });
      // Anthropic 不支持 reasoning_effort
      return { model: provider(modelId), reasoningEffort: undefined, isResponses: false };
    }

    case "gemini": {
      // 自动检测：原生 Gemini API vs OpenAI 兼容格式
      if (isGoogleGenerativeEndpoint(endpoint)) {
        // 原生 Gemini API：使用 @ai-sdk/google
        const googleBaseURL = extractGoogleBaseURL(endpoint);
        const provider = createGoogleGenerativeAI({
          apiKey: config.apiKey,
          baseURL: googleBaseURL,
          fetch: customFetch,
        });
        return {
          model: provider(modelId),
          reasoningEffort: undefined,
          isResponses: false,
          isGoogleGenerative: true, // 标记为原生 Gemini
        };
      } else {
        // OpenAI 兼容格式：使用 createOpenAICompatible
        const provider = createOpenAICompatible({
          name: "gemini",
          apiKey: config.apiKey,
          baseURL,
          fetch: customFetch,
        });
        return { model: provider(modelId), reasoningEffort: undefined, isResponses: false };
      }
    }

    default:
      throw new Error(`不支持的 Provider 类型: ${config.type}`);
  }
}

/* ============================================================================
 * 错误处理
 * ============================================================================ */

/** AI SDK APICallError 类型定义 */
interface AIApiCallError extends Error {
  statusCode?: number;
  responseBody?: string;
}

/**
 * 判断错误是否为超时错误
 *
 * 超时错误特征：
 * - 错误名称为 "AbortError"（AbortController 触发）
 * - 错误消息包含 "request was aborted" 或 "timeout"
 */
function isTimeoutError(error: Error & { name?: string }): boolean {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  const message = error.message || "";
  return /request was aborted|timeout/i.test(message);
}

/**
 * 从 responseBody 中提取错误消息
 *
 * 尝试解析 SSE 格式的错误响应：data:{"message":"xxx"}
 */
function extractMessageFromBody(body: string): string | null {
  const match = body.match(/"message"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * 从错误对象中提取用户友好的错误消息
 *
 * AI SDK 的 APICallError 包含 statusCode、responseBody、message 三个信息源，
 * 按优先级提取最有价值的错误描述
 */
function getErrorMessage(error: AIApiCallError): string {
  if (isTimeoutError(error)) return "请求超时";

  // 优先从 responseBody 提取详细信息
  if (error.responseBody) {
    const extracted = extractMessageFromBody(error.responseBody);
    if (extracted) {
      return error.statusCode ? `[${error.statusCode}] ${extracted}` : extracted;
    }
  }

  // 回退到基础 message
  if (error.message) {
    return error.statusCode ? `[${error.statusCode}] ${error.message}` : error.message;
  }

  return "未知错误";
}

/* ============================================================================
 * 检查结果构建
 * ============================================================================ */

/** 构建检查结果所需的基础参数 */
interface ResultBuilderParams {
  config: ProviderConfig;
  endpoint: string;
  pingLatencyMs: number | null;
}

/**
 * 构建检查结果对象
 *
 * 统一的结果构建函数，确保所有返回路径的数据结构一致
 */
function buildCheckResult(
  params: ResultBuilderParams,
  status: HealthStatus | "validation_failed" | "failed" | "error",
  latencyMs: number | null,
  message: string,
  logMessage?: string
): CheckResult {
  return {
    id: params.config.id,
    name: params.config.name,
    type: params.config.type,
    endpoint: params.endpoint,
    model: params.config.model,
    status,
    latencyMs,
    pingLatencyMs: params.pingLatencyMs,
    checkedAt: new Date().toISOString(),
    message,
    ...(logMessage ? { logMessage } : {}),
    groupName: params.config.groupName || null,
  };
}

/* ============================================================================
 * 主检查函数
 * ============================================================================ */

/**
 * 统一的 AI Provider 健康检查函数
 *
 * 执行流程：
 * 1. 生成随机数学挑战（防止假站点用固定回复绕过）
 * 2. 使用流式 API 发送请求，收集完整响应
 * 3. 验证响应中是否包含正确答案
 * 4. 根据延迟和验证结果判定健康状态
 *
 * 状态判定规则：
 * - operational：请求成功、验证通过、延迟 ≤ 6000ms
 * - degraded：请求成功、验证通过、延迟 > 6000ms
 * - validation_failed：收到回复但答案验证失败
 * - failed：请求失败、超时或回复为空
 * - error：请求过程中发生异常
 */
export async function checkWithAiSdk(config: ProviderConfig): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  const displayEndpoint = config.endpoint || DEFAULT_ENDPOINTS[config.type];
  const pingPromise = measureEndpointPing(displayEndpoint);
  const challenge = generateChallenge();

  // 构建结果参数的辅助函数
  const buildParams = async (): Promise<ResultBuilderParams> => ({
    config,
    endpoint: displayEndpoint,
    pingLatencyMs: await pingPromise,
  });

  try {
    const { model, reasoningEffort } = createModel(config);

    // 仅 OpenAI 推理模型需要 providerOptions
    const providerOptions =
      reasoningEffort && config.type === "openai"
        ? { openai: { reasoningEffort } }
        : undefined;

    // 捕获流处理过程中的错误
    let streamError: AIApiCallError | null = null;

    // 期望输出仅一个词：非推理模型锁死输出上限，省钱且防恶意端点猛吐输出刷成本。
    // 推理模型的隐藏推理会占用输出预算，故不限制以免被饿死。
    const result = streamText({
      model,
      prompt: challenge.prompt,
      abortSignal: controller.signal,
      ...(providerOptions && { providerOptions }),
      ...(reasoningEffort ? {} : { maxOutputTokens: 24 }),
      onError({ error }) {
        streamError = error as AIApiCallError;
      },
    });

    // 收集完整响应
    let collectedResponse = "";
    for await (const chunk of result.textStream) {
      collectedResponse += chunk;
    }

    const latencyMs = Date.now() - startedAt;
    const params = await buildParams();

    // 检查流处理过程中是否有错误
    if (streamError) {
      return buildCheckResult(
        params,
        "error",
        latencyMs,
        getErrorMessage(streamError),
        getSanitizedErrorDetail(streamError)
      );
    }

    // 空回复
    if (!collectedResponse.trim()) {
      return buildCheckResult(params, "failed", latencyMs, "回复为空");
    }

    // 验证答案
    const { valid, normalized } = validateResponse(collectedResponse, challenge.expectedAnswer);

    if (!valid) {
      const actual = normalized || "(空)";
      return buildCheckResult(
        params,
        "validation_failed",
        latencyMs,
        `回复验证失败: 期望 "${challenge.expectedAnswer}", 实际: "${actual}"`
      );
    }

    // 判定健康状态
    const status: HealthStatus = latencyMs <= DEGRADED_THRESHOLD_MS ? "operational" : "degraded";
    const message = status === "degraded" ? `响应成功但耗时 ${latencyMs}ms` : `验证通过 (${latencyMs}ms)`;

    return buildCheckResult(params, status, latencyMs, message);
  } catch (error) {
    const params = await buildParams();
    return buildCheckResult(
      params,
      "error",
      null,
      getErrorMessage(error as AIApiCallError),
      getSanitizedErrorDetail(error)
    );
  } finally {
    clearTimeout(timeout);
  }
}
