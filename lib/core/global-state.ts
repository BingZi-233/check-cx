import type { PingCacheEntry } from "@/lib/types";

import {
  clearSnapshotCache,
  getLastPollStartedAt as readLastPollStartedAt,
  getLeadershipTimer as readLeadershipTimer,
  getPollerRole as readPollerRole,
  getPollerTimer as readPollerTimer,
  getSnapshotCacheEntry,
  isPollerRunning as readPollerRunning,
  setLastPollStartedAt as writeLastPollStartedAt,
  setLeadershipTimer as writeLeadershipTimer,
  setPollerRole as writePollerRole,
  setPollerRunning as writePollerRunning,
  setPollerTimer as writePollerTimer,
  type PollerRole,
} from "@/lib/backend/runtime/registry";

export type { PollerRole };

export function getPollerTimer(): NodeJS.Timeout | undefined {
  return readPollerTimer();
}

export function setPollerTimer(timer: NodeJS.Timeout): void {
  writePollerTimer(timer);
}

export function getPollerLeaderTimer(): NodeJS.Timeout | undefined {
  return readLeadershipTimer();
}

export function setPollerLeaderTimer(timer: NodeJS.Timeout): void {
  writeLeadershipTimer(timer);
}

export const getPollerRole = readPollerRole;
export const isPollerRunning = readPollerRunning;
export const setPollerRole = writePollerRole;
export const setPollerRunning = writePollerRunning;

export function getLastPingStartedAt(): number | undefined {
  return readLastPollStartedAt();
}

export function setLastPingStartedAt(timestamp: number): void {
  writeLastPollStartedAt(timestamp);
}

export function getPingCacheEntry(key: string): PingCacheEntry {
  return getSnapshotCacheEntry(key);
}

export function clearPingCache(): void {
  clearSnapshotCache();
}
