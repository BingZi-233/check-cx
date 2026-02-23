import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAuth() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ groupName: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { groupName } = await params;
  const body = await request.json();
  const { display_name, description, website_url, icon_url } = body;
  const admin = createAdminClient();
  const { error } = await admin.from("group_info").update({ display_name: display_name || null, description: description || null, website_url: website_url || null, icon_url: icon_url || null }).eq("group_name", decodeURIComponent(groupName));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ groupName: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { groupName } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("group_info").delete().eq("group_name", decodeURIComponent(groupName));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
