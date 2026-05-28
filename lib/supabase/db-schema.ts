/**
 * 解析 Supabase PostgREST 使用的数据库 schema。
 *
 * 优先级：SUPABASE_DB_SCHEMA > 默认规则（development → dev，否则 public）
 */
export function getDbSchema(): string {
  const explicit = process.env.SUPABASE_DB_SCHEMA?.trim();
  if (explicit) {
    return explicit;
  }

  return process.env.NODE_ENV === "development" ? "dev" : "public";
}
