-- schema-dev.sql for check-cx (dev schema, no data)

-- 创建 dev schema
CREATE SCHEMA IF NOT EXISTS dev;

-- 枚举类型
CREATE TYPE dev.provider_type AS ENUM (
    'openai',
    'gemini',
    'anthropic'
);

-- 自增序列
CREATE SEQUENCE dev.check_history_id_seq
    AS bigint
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

-- 配置表
CREATE TABLE dev.check_configs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type dev.provider_type NOT NULL,
    model text NOT NULL,
    endpoint text NOT NULL,
    api_key text NOT NULL,
    enabled boolean DEFAULT true,
    is_maintenance boolean DEFAULT false,
    request_header jsonb,
    group_name text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_configs_pkey PRIMARY KEY (id)
);

-- 历史记录表
CREATE TABLE dev.check_history (
    id bigint NOT NULL DEFAULT nextval('dev.check_history_id_seq'::regclass),
    status text NOT NULL,
    latency_ms integer,
    checked_at timestamp with time zone NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    config_id uuid NOT NULL,
    ping_latency_ms double precision,
    CONSTRAINT check_history_pkey PRIMARY KEY (id),
    CONSTRAINT check_latency_ms_positive CHECK (((latency_ms IS NULL) OR (latency_ms >= 0))),
    CONSTRAINT check_status_enum CHECK ((status = ANY (ARRAY['operational'::text, 'degraded'::text, 'failed'::text, 'validation_failed'::text, 'error'::text]))),
    CONSTRAINT fk_config FOREIGN KEY (config_id) REFERENCES dev.check_configs(id) ON DELETE CASCADE
);

-- 分组信息表
CREATE TABLE dev.group_info (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_name text NOT NULL,
    website_url text,
    tags text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_info_pkey PRIMARY KEY (id),
    CONSTRAINT group_info_group_name_key UNIQUE (group_name)
);

-- 系统通知表
CREATE TABLE dev.system_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message text NOT NULL,
    is_active boolean DEFAULT true,
    level text DEFAULT 'info',
    created_at timestamptz DEFAULT now()
);

-- 轮询主节点租约表（单行租约）
CREATE TABLE dev.check_poller_leases (
    lease_key text PRIMARY KEY,
    leader_id text,
    lease_expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dev.check_poller_leases IS '轮询主节点租约表（单行租约）';

INSERT INTO dev.check_poller_leases (lease_key, leader_id, lease_expires_at)
VALUES ('poller', NULL, to_timestamp(0))
ON CONFLICT (lease_key) DO NOTHING;

-- Enable RLS on group_info
ALTER TABLE dev.group_info ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access for everyone
CREATE POLICY "Allow public read access" ON dev.group_info
FOR SELECT USING (true);

-- Enable RLS on system_notifications
ALTER TABLE dev.system_notifications ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access for everyone on system_notifications
CREATE POLICY "Allow public read access" ON dev.system_notifications
FOR SELECT USING (true);

-- Enable RLS on check_poller_leases (service role only)
ALTER TABLE dev.check_poller_leases ENABLE ROW LEVEL SECURITY;

-- 序列属主
ALTER SEQUENCE dev.check_history_id_seq
    OWNED BY dev.check_history.id;

-- 索引
CREATE INDEX idx_dev_check_configs_enabled
    ON dev.check_configs USING btree (enabled)
    WHERE (enabled = true);

CREATE INDEX idx_dev_check_history_checked_at
    ON dev.check_history USING btree (checked_at DESC);

CREATE INDEX idx_dev_check_history_config_id
    ON dev.check_history USING btree (config_id);

CREATE INDEX idx_dev_history_config_checked
    ON dev.check_history USING btree (config_id, checked_at DESC);

-- 可用性统计视图
CREATE OR REPLACE VIEW dev.availability_stats AS
SELECT
    config_id,
    '7d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM dev.check_history
WHERE checked_at > NOW() - INTERVAL '7 days'
GROUP BY config_id

UNION ALL

SELECT
    config_id,
    '15d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM dev.check_history
WHERE checked_at > NOW() - INTERVAL '15 days'
GROUP BY config_id

UNION ALL

SELECT
    config_id,
    '30d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM dev.check_history
WHERE checked_at > NOW() - INTERVAL '30 days'
GROUP BY config_id;

-- 自动更新时间的触发函数
CREATE OR REPLACE FUNCTION dev.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- 触发器：更新 updated_at
CREATE TRIGGER update_check_configs_updated_at
BEFORE UPDATE ON dev.check_configs
FOR EACH ROW
EXECUTE FUNCTION dev.update_updated_at_column();

CREATE TRIGGER update_group_info_updated_at
BEFORE UPDATE ON dev.group_info
FOR EACH ROW
EXECUTE FUNCTION dev.update_updated_at_column();

-- 表与列注释
COMMENT ON TABLE dev.check_configs IS 'AI 服务商配置表 - 存储各个 AI 服务商的 API 配置信息';
COMMENT ON TABLE dev.check_history IS '健康检测历史记录表 - 存储每次 API 健康检测的结果';
COMMENT ON TABLE dev.group_info IS '分组信息表 - 存储分组的额外信息';
COMMENT ON TABLE dev.system_notifications IS '系统通知表 - 存储全局系统通知';
COMMENT ON TABLE dev.check_poller_leases IS '轮询主节点租约表（单行租约）';

COMMENT ON COLUMN dev.check_configs.id IS '配置 UUID - 自动生成的唯一标识符';
COMMENT ON COLUMN dev.check_configs.name IS '配置显示名称 - 用于前端展示的友好名称';
COMMENT ON COLUMN dev.check_configs.type IS '提供商类型 - 支持: openai(OpenAI), gemini(Google Gemini), anthropic(Anthropic Claude)';
COMMENT ON COLUMN dev.check_configs.model IS '模型名称 - 如 gpt-4o-mini, gemini-1.5-flash, claude-3-5-sonnet-latest';
COMMENT ON COLUMN dev.check_configs.endpoint IS 'API 端点 URL - 完整的 API 调用地址';
COMMENT ON COLUMN dev.check_configs.api_key IS 'API 密钥 - 用于身份验证的密钥,明文存储(依赖 RLS 保护)';
COMMENT ON COLUMN dev.check_configs.enabled IS '是否启用 - true: 启用检测, false: 禁用检测';
COMMENT ON COLUMN dev.check_configs.is_maintenance IS '维护模式标记 - true 时停止健康检查';
COMMENT ON COLUMN dev.check_configs.request_header IS '自定义请求头，JSONB 格式，如 {"User-Agent": "xxx"}';
COMMENT ON COLUMN dev.check_configs.group_name IS '配置分组名称，用于 Dashboard 卡片分组展示，NULL 表示未分组';
COMMENT ON COLUMN dev.check_configs.metadata IS '自定义请求参数，JSONB 格式，会合并到请求体中';
COMMENT ON COLUMN dev.check_configs.created_at IS '创建时间 - 配置首次创建的时间戳';
COMMENT ON COLUMN dev.check_configs.updated_at IS '更新时间 - 配置最后修改的时间戳,由触发器自动维护';

COMMENT ON COLUMN dev.check_history.id IS '记录 ID - 自增的唯一标识符';
COMMENT ON COLUMN dev.check_history.status IS '健康状态 - operational(正常), degraded(降级/响应慢), failed(失败)';
COMMENT ON COLUMN dev.check_history.latency_ms IS '响应延迟(毫秒) - API 响应时间,失败时为 NULL';
COMMENT ON COLUMN dev.check_history.checked_at IS '检测时间 - 执行健康检测的时间戳';
COMMENT ON COLUMN dev.check_history.message IS '状态消息 - 详细的状态描述或错误信息';
COMMENT ON COLUMN dev.check_history.created_at IS '记录创建时间 - 记录写入数据库的时间戳';
COMMENT ON COLUMN dev.check_history.config_id IS '配置 UUID - 关联 check_configs.id,标识哪个配置的检测结果';

COMMENT ON COLUMN dev.group_info.group_name IS '分组名称 - 关联 check_configs.group_name';
COMMENT ON COLUMN dev.group_info.website_url IS '网站地址';
COMMENT ON COLUMN dev.group_info.tags IS '分组 Tag 列表，英文逗号分隔字符串';

COMMENT ON COLUMN dev.system_notifications.id IS '通知 UUID';
COMMENT ON COLUMN dev.system_notifications.message IS '通知内容，支持 Markdown';
COMMENT ON COLUMN dev.system_notifications.is_active IS '是否激活，true 为显示';
COMMENT ON COLUMN dev.system_notifications.level IS '通知级别：info, warning, error';
COMMENT ON COLUMN dev.system_notifications.created_at IS '创建时间';

-- RPC: 获取最近历史记录
CREATE OR REPLACE FUNCTION dev.get_recent_check_history(
  limit_per_config integer DEFAULT 60,
  target_config_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  config_id uuid,
  status text,
  latency_ms integer,
  ping_latency_ms double precision,
  checked_at timestamptz,
  message text,
  name text,
  type text,
  model text,
  endpoint text,
  group_name text
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT
      h.id,
      h.config_id,
      h.status,
      h.latency_ms,
      h.ping_latency_ms,
      h.checked_at,
      h.message,
      ROW_NUMBER() OVER (PARTITION BY h.config_id ORDER BY h.checked_at DESC) AS rn
    FROM dev.check_history h
    WHERE target_config_ids IS NULL OR h.config_id = ANY(target_config_ids)
  )
  SELECT
    r.config_id,
    r.status,
    r.latency_ms,
    r.ping_latency_ms,
    r.checked_at,
    r.message,
    c.name,
    c.type,
    c.model,
    c.endpoint,
    c.group_name
  FROM ranked r
  JOIN dev.check_configs c ON c.id = r.config_id
  WHERE r.rn <= limit_per_config
  ORDER BY c.name ASC, r.checked_at DESC;
$$;

-- RPC: 裁剪历史记录
-- 先删除旧版本函数（单参数版本），避免函数重载冲突
DROP FUNCTION IF EXISTS dev.prune_check_history(integer);

CREATE OR REPLACE FUNCTION dev.prune_check_history(
  retention_days integer DEFAULT NULL,
  limit_per_config integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  effective_days integer;
  deleted_count integer;
BEGIN
  effective_days := LEAST(365, GREATEST(7, COALESCE(retention_days, limit_per_config, 30)));

  DELETE FROM dev.check_history
  WHERE checked_at < NOW() - (effective_days || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- ============================================
-- 权限授予
-- ============================================

-- 授予 schema 使用权限
GRANT USAGE ON SCHEMA dev TO anon, authenticated, service_role;

-- anon 只读权限
GRANT SELECT ON ALL TABLES IN SCHEMA dev TO anon;

-- authenticated 和 service_role 完全权限
GRANT ALL ON ALL TABLES IN SCHEMA dev TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dev TO authenticated, service_role;

-- 授予函数执行权限
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO anon, authenticated, service_role;

-- 让未来创建的对象也自动继承权限
ALTER DEFAULT PRIVILEGES IN SCHEMA dev
GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA dev
GRANT ALL ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA dev
GRANT ALL ON SEQUENCES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA dev
GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
