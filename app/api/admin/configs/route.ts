import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function maskKey(key: string) {
  return "••••" + key.slice(-4);
}

async function requireAuth() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return data.claims;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("check_configs")
    .select("id,name,type,model,endpoint,api_key,enabled,is_maintenance,group_name,request_header,metadata,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const masked = data.map((row) => ({ ...row, api_key: maskKey(row.api_key) }));
  return NextResponse.json(masked);
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { name, type, model, endpoint, api_key, enabled, is_maintenance, group_name, request_header, metadata } = body;
  if (!name || !type || !model || !endpoint || !api_key) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("check_configs")
    .insert({ name, type, model, endpoint, api_key, enabled: enabled ?? true, is_maintenance: is_maintenance ?? false, group_name: group_name || null, request_header: request_header || null, metadata: metadata || null })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
