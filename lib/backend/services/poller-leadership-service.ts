import "server-only";

import { getPollerNodeId } from "@/lib/backend/config/runtime-config";
import {
  acquireLease,
  ensureLeaseRow,
  renewLease,
} from "@/lib/backend/repositories/poller-lease-repository";
import {
  getLeadershipInitPromise,
  getLeadershipTimer,
  getPollerRole,
  setLeadershipInitPromise,
  setLeadershipTimer,
  setPollerRole,
} from "@/lib/backend/runtime/registry";
import { logError } from "@/lib/utils";

const LEASE_DURATION_MS = 120_000;
const LEASE_RENEW_INTERVAL_MS = 30_000;

function setRole(nextRole: "leader" | "standby"): void {
  const currentRole = getPollerRole();
  if (currentRole === nextRole) {
    return;
  }
  setPollerRole(nextRole);
  console.log(`[check-cx] 节点角色切换：${currentRole} -> ${nextRole} (node=${getPollerNodeId()})`);
}

async function refreshLeadership(): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  if (getPollerRole() === "leader") {
    const renewed = await renewLease(getPollerNodeId(), now, expiresAt);
    if (!renewed) {
      setRole("standby");
    }
    return;
  }

  const acquired = await acquireLease(getPollerNodeId(), now, expiresAt);
  if (acquired) {
    setRole("leader");
  }
}

export async function ensurePollerLeadership(): Promise<void> {
  const leadershipTimer = getLeadershipTimer();
  if (leadershipTimer) {
    return getLeadershipInitPromise() ?? Promise.resolve();
  }

  const existingInit = getLeadershipInitPromise();
  if (existingInit) {
    return existingInit;
  }

  const initPromise = (async () => {
    await ensureLeaseRow();
    await refreshLeadership();
    const timer = setInterval(() => {
      refreshLeadership().catch((error) => {
        logError("pollerLeadershipService.refreshLeadership", error);
      });
    }, LEASE_RENEW_INTERVAL_MS);
    setLeadershipTimer(timer);
  })();

  setLeadershipInitPromise(initPromise);
  try {
    await initPromise;
  } finally {
    if (!getLeadershipTimer()) {
      setLeadershipInitPromise(null);
    }
  }
}

export function isPollerLeader(): boolean {
  return getPollerRole() === "leader";
}
