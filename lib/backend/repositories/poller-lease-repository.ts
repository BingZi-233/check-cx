import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils";

const LEASE_TABLE = "check_poller_leases";
const LEASE_KEY = "poller";
const INITIAL_LEASE_EXPIRES_AT = new Date(0).toISOString();

function isDuplicateKeyError(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

export async function ensureLeaseRow(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(LEASE_TABLE).insert({
    lease_key: LEASE_KEY,
    leader_id: null,
    lease_expires_at: INITIAL_LEASE_EXPIRES_AT,
  });

  if (error && !isDuplicateKeyError(error)) {
    logError("pollerLeaseRepository.ensureLeaseRow", error);
  }
}

export async function acquireLease(
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
    logError("pollerLeaseRepository.acquireLease", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

export async function renewLease(
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
    logError("pollerLeaseRepository.renewLease", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}
