/**
 * 轮询主节点租约管理
 */

import "server-only";
import type {PostgrestError} from "@supabase/supabase-js";

import {createAdminClient} from "../supabase/admin";
import {logError} from "../utils";

const LEASE_TABLE = "check_poller_leases";
const LEASE_KEY = "poller";
const INITIAL_LEASE_EXPIRES_AT = new Date(0).toISOString();

function isDuplicateKeyError(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

export async function ensurePollerLeaseRow(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(LEASE_TABLE).insert({
    lease_key: LEASE_KEY,
    leader_id: null,
    lease_expires_at: INITIAL_LEASE_EXPIRES_AT,
  });

  if (error && !isDuplicateKeyError(error)) {
    logError("初始化轮询租约失败", error);
  }
}

export async function tryAcquirePollerLease(
  nodeId: string,
  now: Date,
  expiresAt: Date
): Promise<boolean> {
  const supabase = createAdminClient();
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from(LEASE_TABLE)
    .update({
      leader_id: nodeId,
      lease_expires_at: expiresAt.toISOString(),
      updated_at: nowIso,
    })
    .eq("lease_key", LEASE_KEY)
    .lt("lease_expires_at", nowIso)
    .select("lease_key");

  if (error) {
    logError("获取轮询租约失败", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

export async function tryRenewPollerLease(
  nodeId: string,
  now: Date,
  expiresAt: Date
): Promise<boolean> {
  const supabase = createAdminClient();
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from(LEASE_TABLE)
    .update({
      lease_expires_at: expiresAt.toISOString(),
      updated_at: nowIso,
    })
    .eq("lease_key", LEASE_KEY)
    .eq("leader_id", nodeId)
    .gt("lease_expires_at", nowIso)
    .select("lease_key");

  if (error) {
    logError("续租轮询租约失败", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}
