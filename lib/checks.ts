import "server-only";

export type ProviderType = "openai" | "gemini" | "anthropic";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  endpoint: string;
  model: string;
  apiKey: string;
}

export type HealthStatus = "operational" | "degraded" | "failed";

export interface CheckResult {
  id: string;
  name: string;
  type: ProviderType;
  endpoint: string;
  model: string;
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
}

const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  anthropic: "https://api.anthropic.com/v1/messages",
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEGRADED_THRESHOLD_MS = 6_000;

export function loadProviderConfigs(): ProviderConfig[] {
  const groupList = (process.env.CHECK_GROUPS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const configs: ProviderConfig[] = [];

  for (const groupId of groupList) {
    const upperId = groupId.toUpperCase();
    const read = (suffix: string) => process.env[`CHECK_${upperId}_${suffix}`]?.trim();

    const type = normalizeType(read("TYPE"));
    const apiKey = read("KEY");
    const model = read("MODEL");
    const endpoint = read("ENDPOINT") || DEFAULT_ENDPOINTS[type ?? "openai"];
    const name = read("NAME") || groupId;

    if (!type || !apiKey || !model) {
      console.warn(
        `[check-cx] 跳过配置 ${groupId}：缺少TYPE/KEY/MODEL，其中 type=${type}, key=${maskKey(
          apiKey
        )}, model=${model}`
      );
      continue;
    }

    configs.push({
      id: groupId,
      name,
      type,
      endpoint,
      model,
      apiKey,
    });
  }

  return configs;
}

export async function runProviderChecks(): Promise<CheckResult[]> {
  const configs = loadProviderConfigs();
  if (configs.length === 0) {
    return [];
  }

  const results = await Promise.all(
    configs.map(async (config) => {
      try {
        return await checkProvider(config);
      } catch (error) {
        const err = error as Error;
        return {
          id: config.id,
          name: config.name,
          type: config.type,
          endpoint: config.endpoint,
          model: config.model,
          status: "failed" as const,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          message: err?.message || "未知错误",
        };
      }
    })
  );

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

async function checkProvider(config: ProviderConfig): Promise<CheckResult> {
  switch (config.type) {
    case "openai":
      return checkOpenAI(config);
    case "gemini":
      return checkGemini(config);
    case "anthropic":
      return checkAnthropic(config);
    default:
      throw new Error(`Unsupported provider: ${config.type}`);
  }
}

async function checkOpenAI(config: ProviderConfig): Promise<CheckResult> {
  const url = ensurePath(config.endpoint, "/v1/chat/completions");
  const payload = {
    model: config.model,
    messages: [
      { role: "user", content: "hi" }, // 最简短的消息,移除不必要的 system
    ],
    max_tokens: 1, // 仅需1个token即可确认服务可用
    temperature: 0,
    stream: true, // 启用流式响应
  };

  return runStreamCheck(config, {
    url,
    displayEndpoint: config.endpoint,
    init: {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    parseStream: parseOpenAIStream,
  });
}

async function checkGemini(config: ProviderConfig): Promise<CheckResult> {
  const normalized = config.endpoint.endsWith(":streamGenerateContent")
    ? config.endpoint
    : config.endpoint.endsWith(":generateContent")
    ? config.endpoint.replace(":generateContent", ":streamGenerateContent")
    : `${config.endpoint.replace(/\/$/, "")}/models/${config.model}:streamGenerateContent`;

  const url = appendQuery(normalized, `key=${config.apiKey}`);
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: "1" }], // 最简短的单字符消息
      },
    ],
    generationConfig: {
      maxOutputTokens: 1, // 限制输出仅1个token
      temperature: 0,
    },
  };

  return runStreamCheck(config, {
    url,
    displayEndpoint: config.endpoint,
    init: {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    parseStream: parseGeminiStream,
  });
}

async function checkAnthropic(config: ProviderConfig): Promise<CheckResult> {
  const url = ensurePath(config.endpoint, "/v1/messages");
  const payload = {
    model: config.model,
    max_tokens: 1, // 仅需1个token
    messages: [{ role: "user", content: "hi" }], // 最简短的消息
    stream: true, // 启用流式响应
  };

  return runStreamCheck(config, {
    url,
    displayEndpoint: config.endpoint,
    init: {
      headers: {
        "x-api-key": config.apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    },
    parseStream: parseAnthropicStream,
  });
}

// 流式响应解析器类型
type StreamParser = (reader: ReadableStreamDefaultReader<Uint8Array>) => Promise<string>;

// 运行流式检查
async function runStreamCheck(
  config: ProviderConfig,
  params: {
    url: string;
    displayEndpoint?: string;
    init: RequestInit;
    parseStream: StreamParser;
  }
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      method: "POST",
      signal: controller.signal,
      ...params.init,
    });

    if (!response.ok) {
      const latencyMs = Date.now() - startedAt;
      const errorBody = await response.text();
      const message = extractMessage(errorBody) || `HTTP ${response.status}`;

      return {
        id: config.id,
        name: config.name,
        type: config.type,
        endpoint: params.displayEndpoint || params.url,
        model: config.model,
        status: "failed",
        latencyMs,
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

    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      message,
    };
  } catch (error) {
    const err = error as Error & { name?: string };
    const message = err?.name === "AbortError" ? "请求超时" : err?.message || "未知错误";
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status: "failed",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// OpenAI 流式响应解析器
async function parseOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const decoder = new TextDecoder();
  let fullResponse = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          return fullResponse;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          fullResponse += content;
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  return fullResponse;
}

// Anthropic 流式响应解析器
async function parseAnthropicStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const decoder = new TextDecoder();
  let fullResponse = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 保留最后一个不完整的行

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);

          // 处理不同类型的事件
          if (parsed.type === "content_block_delta") {
            const content = parsed.delta?.text || "";
            fullResponse += content;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  return fullResponse;
}

// Gemini 流式响应解析器
async function parseGeminiStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const decoder = new TextDecoder();
  let fullResponse = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Gemini 返回的是多个 JSON 对象,可能用逗号分隔或换行分隔
    // 尝试解析所有完整的 JSON 对象
    const jsonObjects = buffer.split(/\n/).filter(s => s.trim());

    for (let i = 0; i < jsonObjects.length - 1; i++) {
      try {
        const parsed = JSON.parse(jsonObjects[i]);
        const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
        fullResponse += content;
      } catch {
        // 忽略解析错误
      }
    }

    // 保留最后一个可能不完整的 JSON
    buffer = jsonObjects[jsonObjects.length - 1] || "";
  }

  // 处理最后剩余的 buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
      fullResponse += content;
    } catch {
      // 忽略解析错误
    }
  }

  return fullResponse;
}

async function runHttpCheck(
  config: ProviderConfig,
  params: {
    url: string;
    displayEndpoint?: string;
    init: RequestInit;
  }
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      method: "POST",
      signal: controller.signal,
      ...params.init,
    });
    const latencyMs = Date.now() - startedAt;
    const body = await readBody(response);

    const status: HealthStatus =
      response.ok && latencyMs <= DEGRADED_THRESHOLD_MS
        ? "operational"
        : response.ok
        ? "degraded"
        : "failed";

    const message = response.ok
      ? status === "degraded"
        ? `响应成功但耗时 ${latencyMs}ms`
        : `响应正常 (HTTP ${response.status})`
      : extractMessage(body) || `HTTP ${response.status}`;

    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      message,
    };
  } catch (error) {
    const err = error as Error & { name?: string };
    const message = err?.name === "AbortError" ? "请求超时" : err?.message || "未知错误";
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: params.displayEndpoint || params.url,
      model: config.model,
      status: "failed",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeType(value?: string | null): ProviderType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "openai") return "openai";
  if (lower === "gemini") return "gemini";
  if (lower === "anthropic") return "anthropic";
  return undefined;
}

function ensurePath(endpoint: string, fallbackPath: string) {
  if (!endpoint) {
    return fallbackPath;
  }
  if (
    endpoint.endsWith(fallbackPath) ||
    endpoint.includes("/v1/") ||
    endpoint.includes("/deployments/") ||
    endpoint.includes("?")
  ) {
    return endpoint;
  }
  return `${endpoint.replace(/\/$/, "")}${fallbackPath}`;
}

function appendQuery(url: string, query: string) {
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

async function readBody(response: Response) {
  const text = await response.text();
  return text;
}

function extractMessage(body: string) {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body);
    return (
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      JSON.stringify(parsed)
    );
  } catch {
    return body.slice(0, 280);
  }
}

function maskKey(key?: string | null) {
  if (!key) return "";
  if (key.length <= 4) return "****";
  return `${key.slice(0, 4)}****${key.slice(-2)}`;
}
