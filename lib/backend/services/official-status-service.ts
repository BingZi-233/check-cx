import { getOfficialStatusIntervalMs } from "@/lib/backend/config/runtime-config";
import { getOfficialStatusCache, getOfficialStatusTimer, isOfficialStatusRunning, setOfficialStatusRunning, setOfficialStatusTimer } from "@/lib/backend/runtime/registry";
import { checkAllOfficialStatuses } from "@/lib/official-status";
import { logError } from "@/lib/utils";
import type { OfficialStatusResult, ProviderType } from "@/lib/types";

import { ensurePollerLeadership, isPollerLeader } from "./poller-leadership-service";

const OFFICIAL_STATUS_TYPES: ProviderType[] = ["openai", "gemini", "anthropic"];

export function getOfficialStatus(type: ProviderType): OfficialStatusResult | undefined {
  return getOfficialStatusCache().get(type);
}

export function getAllOfficialStatuses(): Map<ProviderType, OfficialStatusResult> {
  return new Map(getOfficialStatusCache());
}

export async function refreshOfficialStatuses(): Promise<void> {
  try {
    await ensurePollerLeadership();
  } catch (error) {
    logError("officialStatusService.refreshOfficialStatuses.leadership", error);
    return;
  }

  if (!isPollerLeader()) {
    return;
  }

  if (isOfficialStatusRunning()) {
    return;
  }

  setOfficialStatusRunning(true);
  try {
    const results = await checkAllOfficialStatuses(OFFICIAL_STATUS_TYPES);
    const cache = getOfficialStatusCache();
    results.forEach((result, type) => {
      cache.set(type, result);
    });
  } catch (error) {
    logError("officialStatusService.refreshOfficialStatuses", error);
  } finally {
    setOfficialStatusRunning(false);
  }
}

export function ensureOfficialStatusRuntime(): void {
  if (getOfficialStatusTimer()) {
    return;
  }

  refreshOfficialStatuses().catch((error) => {
    logError("officialStatusService.ensureOfficialStatusRuntime.initial", error);
  });

  const timer = setInterval(() => {
    refreshOfficialStatuses().catch((error) => {
      logError("officialStatusService.ensureOfficialStatusRuntime.interval", error);
    });
  }, getOfficialStatusIntervalMs());

  setOfficialStatusTimer(timer);
}

export function stopOfficialStatusRuntime(): void {
  const timer = getOfficialStatusTimer();
  if (!timer) {
    return;
  }

  clearInterval(timer);
  setOfficialStatusTimer(undefined);
  setOfficialStatusRunning(false);
}
