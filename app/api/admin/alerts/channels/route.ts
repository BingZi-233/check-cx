import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const err = await requireAuth();
  if (err) return err;
  const { data, error } = await createAdminClient()
    .from("alert_channels")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const err = await requireAuth();
  if (err) return err;
  const body = await request.json();
  const { name, type, config, enabled } = body;
  if (!name || !type || !config?.url) {
    return NextResponse.json({ error: "name、type、config.url 必填" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("alert_channels")
    .insert({ name, type, config, enabled: enabled ?? true })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
