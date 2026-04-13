import "server-only";

const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 15;
const MAX_INTERVAL_SECONDS = 600;

const DEFAULT_OFFICIAL_STATUS_INTERVAL_SECONDS = 300;
const MIN_OFFICIAL_STATUS_INTERVAL_SECONDS = 60;
const MAX_OFFICIAL_STATUS_INTERVAL_SECONDS = 3600;

const DEFAULT_CHECK_CONCURRENCY = 5;
const MIN_CHECK_CONCURRENCY = 1;
const MAX_CHECK_CONCURRENCY = 20;

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

const DEFAULT_NODE_ID = "local";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

export function getPollingIntervalSeconds(): number {
  return clamp(
    parsePositiveNumber(
      process.env.CHECK_POLL_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS
    ),
    MIN_INTERVAL_SECONDS,
    MAX_INTERVAL_SECONDS
  );
}

export function getPollingIntervalMs(): number {
  return getPollingIntervalSeconds() * 1000;
}

export function getPollingIntervalLabel(): string {
  const seconds = getPollingIntervalSeconds();
  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`;
  }
  return `${seconds} 秒`;
}

export function getOfficialStatusIntervalSeconds(): number {
  return clamp(
    parsePositiveNumber(
      process.env.OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS,
      DEFAULT_OFFICIAL_STATUS_INTERVAL_SECONDS
    ),
    MIN_OFFICIAL_STATUS_INTERVAL_SECONDS,
    MAX_OFFICIAL_STATUS_INTERVAL_SECONDS
  );
}

export function getOfficialStatusIntervalMs(): number {
  return getOfficialStatusIntervalSeconds() * 1000;
}

export function getOfficialStatusIntervalLabel(): string {
  const seconds = getOfficialStatusIntervalSeconds();
  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`;
  }
  return `${seconds} 秒`;
}

export function getCheckConcurrency(): number {
  return clamp(
    parsePositiveNumber(process.env.CHECK_CONCURRENCY, DEFAULT_CHECK_CONCURRENCY),
    MIN_CHECK_CONCURRENCY,
    MAX_CHECK_CONCURRENCY
  );
}

export function getHistoryRetentionDays(): number {
  return clamp(
    parsePositiveNumber(process.env.HISTORY_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS
  );
}

let didWarnMissingNodeId = false;

export function getPollerNodeId(): string {
  const configured = process.env.CHECK_NODE_ID?.trim();
  if (configured) {
    return configured;
  }

  const fallback = process.env.HOSTNAME?.trim() || DEFAULT_NODE_ID;
  if (!didWarnMissingNodeId) {
    console.warn(`[check-cx] 未设置 CHECK_NODE_ID，使用 ${fallback} 作为节点身份`);
    didWarnMissingNodeId = true;
  }
  return fallback;
}
