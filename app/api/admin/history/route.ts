import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAuth() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") ?? "50", 10)));
  const configId = searchParams.get("config_id") ?? "";
  const status   = searchParams.get("status") ?? "";

  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = admin
    .from("check_history")
    .select(
      "id, config_id, status, latency_ms, ping_latency_ms, checked_at, message, check_configs(name, type)",
      { count: "exact" }
    )
    .order("checked_at", { ascending: false })
    .range(from, to);

  if (configId) query = query.eq("config_id", configId);
  if (status)   query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ids } = await request.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  const { error } = await createAdminClient().from("check_history").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
