import {DashboardView} from "@/components/dashboard-view";
import type {DashboardData} from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock data — covers every status, provider, group configuration, and UI state
// ---------------------------------------------------------------------------

function makeTimestamp(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function makeHistory(
  id: string,
  statuses: Array<"operational" | "degraded" | "failed" | "validation_failed" | "maintenance" | "error">
) {
  return statuses.map((status, i) => ({
    id,
    name: "",
    type: "openai" as const,
    endpoint: "https://api.openai.com",
    model: "gpt-4o-mini",
    status,
    latencyMs: status === "operational" ? 320 + i * 10 : status === "degraded" ? 7200 : null,
    pingLatencyMs: status === "operational" ? 45 + i * 3 : null,
    checkedAt: makeTimestamp(i * 1),
    message: status === "failed" ? "Connection timeout after 15s" : "",
    groupName: null,
  }));
}

const MOCK_DATA: DashboardData = {
  trendPeriod: "7d",
  pollIntervalMs: 60000,
  pollIntervalLabel: "60s",
  lastUpdated: makeTimestamp(0),
  generatedAt: Date.now(),
  total: 9,
  groupInfos: [
    { groupName: "OpenAI", websiteUrl: "https://status.openai.com", tags: "商业,美国" },
    { groupName: "Google", websiteUrl: "https://status.cloud.google.com", tags: "商业,美国" },
    { groupName: "Anthropic", tags: "商业,美国" },
  ],
  availabilityStats: {
    "id-openai-gpt4o": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1675, availabilityPct: 99.70 },
      { period: "15d", totalChecks: 3600, operationalCount: 3590, availabilityPct: 99.72 },
      { period: "30d", totalChecks: 7200, operationalCount: 7180, availabilityPct: 99.72 },
    ],
    "id-openai-gpt35": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1596, availabilityPct: 95.00 },
      { period: "15d", totalChecks: 3600, operationalCount: 3420, availabilityPct: 95.00 },
      { period: "30d", totalChecks: 7200, operationalCount: 6840, availabilityPct: 95.00 },
    ],
    "id-openai-o1": [
      { period: "7d",  totalChecks: 1680, operationalCount: 0, availabilityPct: 0 },
      { period: "15d", totalChecks: 3600, operationalCount: 0, availabilityPct: 0 },
      { period: "30d", totalChecks: 7200, operationalCount: 0, availabilityPct: 0 },
    ],
    "id-gemini-pro": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1662, availabilityPct: 98.93 },
      { period: "15d", totalChecks: 3600, operationalCount: 3564, availabilityPct: 99.00 },
      { period: "30d", totalChecks: 7200, operationalCount: 7128, availabilityPct: 99.00 },
    ],
    "id-gemini-flash": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1500, availabilityPct: 89.29 },
      { period: "15d", totalChecks: 3600, operationalCount: 3100, availabilityPct: 86.11 },
      { period: "30d", totalChecks: 7200, operationalCount: 6200, availabilityPct: 86.11 },
    ],
    "id-gemini-ultra": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1680, availabilityPct: 100 },
      { period: "15d", totalChecks: 3600, operationalCount: 3600, availabilityPct: 100 },
      { period: "30d", totalChecks: 7200, operationalCount: 7200, availabilityPct: 100 },
    ],
    "id-claude-3-opus": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1680, availabilityPct: 100 },
      { period: "15d", totalChecks: 3600, operationalCount: 3600, availabilityPct: 100 },
      { period: "30d", totalChecks: 7200, operationalCount: 7200, availabilityPct: 100 },
    ],
    "id-claude-3-sonnet": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1344, availabilityPct: 80.0 },
      { period: "15d", totalChecks: 3600, operationalCount: 2880, availabilityPct: 80.0 },
      { period: "30d", totalChecks: 7200, operationalCount: 5760, availabilityPct: 80.0 },
    ],
    "id-claude-3-haiku": [
      { period: "7d",  totalChecks: 1680, operationalCount: 1680, availabilityPct: null },
      { period: "15d", totalChecks: 0, operationalCount: 0, availabilityPct: null },
      { period: "30d", totalChecks: 0, operationalCount: 0, availabilityPct: null },
    ],
  },
  providerTimelines: [
    // ── OpenAI Group ──────────────────────────────────────────────────────
    {
      id: "id-openai-gpt4o",
      latest: {
        id: "id-openai-gpt4o",
        name: "GPT-4o",
        type: "openai",
        endpoint: "https://api.openai.com",
        model: "gpt-4o",
        status: "operational",
        latencyMs: 412,
        pingLatencyMs: 52,
        checkedAt: makeTimestamp(0),
        message: "",
        groupName: "OpenAI",
        officialStatus: { status: "operational", message: "", checkedAt: makeTimestamp(0), affectedComponents: [] },
      },
      items: makeHistory("id-openai-gpt4o", [
        "operational","operational","operational","operational","operational",
        "operational","degraded","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
    {
      id: "id-openai-gpt35",
      latest: {
        id: "id-openai-gpt35",
        name: "GPT-3.5 Turbo",
        type: "openai",
        endpoint: "https://api.openai.com",
        model: "gpt-3.5-turbo",
        status: "degraded",
        latencyMs: 8100,
        pingLatencyMs: 44,
        checkedAt: makeTimestamp(1),
        message: "Latency exceeded 6000ms threshold",
        groupName: "OpenAI",
        officialStatus: { status: "degraded", message: "Elevated API response times for some users", checkedAt: makeTimestamp(0), affectedComponents: ["Chat Completions"] },
      },
      items: makeHistory("id-openai-gpt35", [
        "degraded","degraded","operational","operational","failed",
        "operational","operational","operational","degraded","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
    {
      id: "id-openai-o1",
      latest: {
        id: "id-openai-o1",
        name: "o1-preview",
        type: "openai",
        endpoint: "https://api.openai.com",
        model: "o1-preview",
        status: "failed",
        latencyMs: null,
        pingLatencyMs: null,
        checkedAt: makeTimestamp(2),
        message: "Request timed out after 15000ms",
        groupName: "OpenAI",
        officialStatus: { status: "down", message: "o1 models are currently unavailable", checkedAt: makeTimestamp(0), affectedComponents: ["o1", "o1-mini"] },
      },
      items: makeHistory("id-openai-o1", [
        "failed","failed","failed","failed","failed",
        "failed","failed","failed","error","failed",
        "failed","failed","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },

    // ── Google Group ──────────────────────────────────────────────────────
    {
      id: "id-gemini-pro",
      latest: {
        id: "id-gemini-pro",
        name: "Gemini 1.5 Pro",
        type: "gemini",
        endpoint: "https://generativelanguage.googleapis.com",
        model: "gemini-1.5-pro",
        status: "operational",
        latencyMs: 890,
        pingLatencyMs: 38,
        checkedAt: makeTimestamp(0),
        message: "",
        groupName: "Google",
      },
      items: makeHistory("id-gemini-pro", [
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","failed","operational",
      ]),
    },
    {
      id: "id-gemini-flash",
      latest: {
        id: "id-gemini-flash",
        name: "Gemini 1.5 Flash",
        type: "gemini",
        endpoint: "https://generativelanguage.googleapis.com",
        model: "gemini-1.5-flash",
        status: "validation_failed",
        latencyMs: 310,
        pingLatencyMs: 35,
        checkedAt: makeTimestamp(1),
        message: "Model response failed math challenge validation",
        groupName: "Google",
      },
      items: makeHistory("id-gemini-flash", [
        "validation_failed","operational","operational","validation_failed","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
    {
      id: "id-gemini-ultra",
      latest: {
        id: "id-gemini-ultra",
        name: "Gemini Ultra",
        type: "gemini",
        endpoint: "https://generativelanguage.googleapis.com",
        model: "gemini-ultra",
        status: "maintenance",
        latencyMs: null,
        pingLatencyMs: null,
        checkedAt: makeTimestamp(30),
        message: "Scheduled maintenance window",
        groupName: "Google",
      },
      items: [],
    },

    // ── Anthropic Group ───────────────────────────────────────────────────
    {
      id: "id-claude-3-opus",
      latest: {
        id: "id-claude-3-opus",
        name: "Claude 3 Opus",
        type: "anthropic",
        endpoint: "https://api.anthropic.com",
        model: "claude-3-opus-20240229",
        status: "operational",
        latencyMs: 621,
        pingLatencyMs: 61,
        checkedAt: makeTimestamp(0),
        message: "",
        groupName: "Anthropic",
      },
      items: makeHistory("id-claude-3-opus", [
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
    {
      id: "id-claude-3-sonnet",
      latest: {
        id: "id-claude-3-sonnet",
        name: "Claude 3.5 Sonnet",
        type: "anthropic",
        endpoint: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-20241022",
        status: "error",
        latencyMs: null,
        pingLatencyMs: null,
        checkedAt: makeTimestamp(3),
        message: "API error: 529 Overloaded",
        groupName: "Anthropic",
      },
      items: makeHistory("id-claude-3-sonnet", [
        "error","error","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
    {
      id: "id-claude-3-haiku",
      latest: {
        id: "id-claude-3-haiku",
        name: "Claude 3 Haiku",
        type: "anthropic",
        endpoint: "https://api.anthropic.com",
        model: "claude-3-haiku-20240307",
        status: "operational",
        latencyMs: 188,
        pingLatencyMs: 59,
        checkedAt: makeTimestamp(0),
        message: "",
        groupName: "Anthropic",
      },
      items: makeHistory("id-claude-3-haiku", [
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
        "operational","operational","operational","operational","operational",
      ]),
    },
  ],
};

export default function PreviewPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <DashboardView initialData={MOCK_DATA} />
      </div>
    </div>
  );
}
