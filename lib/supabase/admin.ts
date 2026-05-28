/**
 * Supabase 管理员客户端
 *
 * 使用 service_role key，绕过 RLS 策略
 * 仅用于服务端后台操作（轮询器、配置加载等）
 *
 * ⚠️ 警告：切勿在客户端代码中导入此模块
 */

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getDbSchema } from "./db-schema";

/**
 * 创建管理员客户端（绕过 RLS）
 *
 * 注意：此客户端使用 service_role key，拥有完整的数据库访问权限
 * 仅应在服务端后台任务中使用
 */
export function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量"
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    db: { schema: getDbSchema() },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
