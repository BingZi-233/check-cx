/**
 * 轮询主节点选举与租约续租
 */

import "server-only";

import {ensurePollerLeaseRow, tryAcquirePollerLease, tryRenewPollerLease} from "../database/poller-lease";
import {logError} from "../utils";
import {getPollerLeaderTimer, getPollerRole, setPollerLeaderTimer, setPollerRole, type PollerRole,} from "./global-state";

// 固定租约参数，不暴露环境变量
const LEASE_DURATION_MS = 120_000;
const LEASE_RENEW_INTERVAL_MS = 30_000;
const DEFAULT_NODE_ID = "local";

let didWarnMissingNodeId = false;
let initPromise: Promise<void> | null = null;

function resolveNodeId(): string {
  const raw = process.env.CHECK_NODE_ID?.trim();
  if (raw) {
    return raw;
  }

  const fallback = process.env.HOSTNAME?.trim() || DEFAULT_NODE_ID;
  if (!didWarnMissingNodeId) {
    console.warn(
      `[check-cx] 未设置 CHECK_NODE_ID，使用 ${fallback} 作为节点身份`
    );
    didWarnMissingNodeId = true;
  }
  return fallback;
}

const NODE_ID = resolveNodeId();

function setRole(nextRole: PollerRole): void {
  const currentRole = getPollerRole();
  if (currentRole === nextRole) {
    return;
  }
  setPollerRole(nextRole);
  console.log(
    `[check-cx] 节点角色切换：${currentRole} -> ${nextRole} (node=${NODE_ID})`
  );
}

async function refreshLeadership(): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const currentRole = getPollerRole();

  if (currentRole === "leader") {
    const renewed = await tryRenewPollerLease(NODE_ID, now, expiresAt);
    if (!renewed) {
      setRole("standby");
    }
    return;
  }

  const acquired = await tryAcquirePollerLease(NODE_ID, now, expiresAt);
  if (acquired) {
    setRole("leader");
  }
}

export async function ensurePollerLeadership(): Promise<void> {
  if (getPollerLeaderTimer()) {
    return initPromise ?? Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await ensurePollerLeaseRow();
    await refreshLeadership();
    const timer = setInterval(() => {
      refreshLeadership().catch((error) => {
        logError("pollerLeadership.refresh", error);
      });
    }, LEASE_RENEW_INTERVAL_MS);
    setPollerLeaderTimer(timer);
  })();

  return initPromise;
}

export function isPollerLeader(): boolean {
  return getPollerRole() === "leader";
}

export function getPollerNodeId(): string {
  return NODE_ID;
}
