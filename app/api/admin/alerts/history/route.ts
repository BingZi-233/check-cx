import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const err = await requireAuth();
  if (err) return err;

  const { searchParams } = request.nextUrl;
  const rule_id   = searchParams.get("rule_id");
  const config_id = searchParams.get("config_id");
  const status    = searchParams.get("status");
  const from      = searchParams.get("from");
  const to        = searchParams.get("to");
  const page      = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize  = Math.min(Math.max(1, Number(searchParams.get("pageSize") ?? "50")), 1000);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo   = rangeFrom + pageSize - 1;

  let query = createAdminClient()
    .from("alert_history")
    .select(`
      id, rule_id, channel_id, config_id, status, error_message, triggered_at, payload,
      alert_rules(name),
      alert_channels(name, type),
      check_configs(name)
    `, { count: "exact" })
    .order("triggered_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (rule_id)   query = query.eq("rule_id", rule_id);
  if (config_id) query = query.eq("config_id", config_id);
  if (status)    query = query.eq("status", status);
  if (from)      query = query.gte("triggered_at", from);
  if (to)        query = query.lte("triggered_at", to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
}

export async function DELETE(request: NextRequest) {
  const err = await requireAuth();
  if (err) return err;
  const { ids } = await request.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  const { error } = await createAdminClient().from("alert_history").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
