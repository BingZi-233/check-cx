import type { OfficialStatusResult, PingCacheEntry, ProviderType } from "@/lib/types";

export type PollerRole = "leader" | "standby";

interface TimersState {
  poller?: NodeJS.Timeout;
  leadership?: NodeJS.Timeout;
  officialStatus?: NodeJS.Timeout;
}

interface FlagsState {
  pollerRunning: boolean;
  officialStatusRunning: boolean;
}

interface PollerState {
  role: PollerRole;
  lastStartedAt?: number;
  leadershipInit?: Promise<void> | null;
}

interface BackendRegistry {
  timers: TimersState;
  flags: FlagsState;
  poller: PollerState;
  snapshotCache: Record<string, PingCacheEntry>;
  officialStatuses: Map<ProviderType, OfficialStatusResult>;
}

declare global {
  var __CHECK_CX_BACKEND_REGISTRY__: BackendRegistry | undefined;
}

function createRegistry(): BackendRegistry {
  return {
    timers: {},
    flags: {
      pollerRunning: false,
      officialStatusRunning: false,
    },
    poller: {
      role: "standby",
      leadershipInit: null,
    },
    snapshotCache: {},
    officialStatuses: new Map(),
  };
}

export function getBackendRegistry(): BackendRegistry {
  if (!globalThis.__CHECK_CX_BACKEND_REGISTRY__) {
    globalThis.__CHECK_CX_BACKEND_REGISTRY__ = createRegistry();
  }
  return globalThis.__CHECK_CX_BACKEND_REGISTRY__;
}

export function getPollerRole(): PollerRole {
  return getBackendRegistry().poller.role;
}

export function setPollerRole(role: PollerRole): void {
  getBackendRegistry().poller.role = role;
}

export function getPollerTimer(): NodeJS.Timeout | undefined {
  return getBackendRegistry().timers.poller;
}

export function setPollerTimer(timer?: NodeJS.Timeout): void {
  getBackendRegistry().timers.poller = timer;
}

export function getLeadershipTimer(): NodeJS.Timeout | undefined {
  return getBackendRegistry().timers.leadership;
}

export function setLeadershipTimer(timer?: NodeJS.Timeout): void {
  getBackendRegistry().timers.leadership = timer;
}

export function getOfficialStatusTimer(): NodeJS.Timeout | undefined {
  return getBackendRegistry().timers.officialStatus;
}

export function setOfficialStatusTimer(timer?: NodeJS.Timeout): void {
  getBackendRegistry().timers.officialStatus = timer;
}

export function isPollerRunning(): boolean {
  return getBackendRegistry().flags.pollerRunning;
}

export function setPollerRunning(running: boolean): void {
  getBackendRegistry().flags.pollerRunning = running;
}

export function isOfficialStatusRunning(): boolean {
  return getBackendRegistry().flags.officialStatusRunning;
}

export function setOfficialStatusRunning(running: boolean): void {
  getBackendRegistry().flags.officialStatusRunning = running;
}

export function getLastPollStartedAt(): number | undefined {
  return getBackendRegistry().poller.lastStartedAt;
}

export function setLastPollStartedAt(timestamp: number | undefined): void {
  getBackendRegistry().poller.lastStartedAt = timestamp;
}

export function getLeadershipInitPromise(): Promise<void> | null | undefined {
  return getBackendRegistry().poller.leadershipInit;
}

export function setLeadershipInitPromise(
  promise: Promise<void> | null | undefined
): void {
  getBackendRegistry().poller.leadershipInit = promise;
}

export function getSnapshotCacheEntry(key: string): PingCacheEntry {
  const registry = getBackendRegistry();
  if (!registry.snapshotCache[key]) {
    registry.snapshotCache[key] = { lastPingAt: 0 };
  }
  return registry.snapshotCache[key];
}

export function clearSnapshotCache(): void {
  getBackendRegistry().snapshotCache = {};
}

export function getOfficialStatusCache(): Map<ProviderType, OfficialStatusResult> {
  return getBackendRegistry().officialStatuses;
}
