-- schema.sql for check-cx (public schema only, no data)

-- 枚举类型
CREATE TYPE public.provider_type AS ENUM (
    'openai',
    'gemini',
    'anthropic'
);

-- 自增序列
CREATE SEQUENCE public.check_history_id_seq
    AS bigint
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

-- 配置表
CREATE TABLE public.check_configs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type public.provider_type NOT NULL,
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
CREATE TABLE public.check_history (
    id bigint NOT NULL DEFAULT nextval('public.check_history_id_seq'::regclass),
    status text NOT NULL,
    latency_ms integer,
    checked_at timestamp with time zone NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    config_id uuid NOT NULL,
    ping_latency_ms double precision,
    CONSTRAINT check_history_pkey PRIMARY KEY (id),
    CONSTRAINT check_latency_ms_positive CHECK (((latency_ms IS NULL) OR (latency_ms >= 0))),
    CONSTRAINT check_status_enum CHECK ((status = ANY (ARRAY['operational'::text, 'degraded'::text, 'failed'::text]))),
    CONSTRAINT fk_config FOREIGN KEY (config_id) REFERENCES public.check_configs(id) ON DELETE CASCADE
);

-- 序列属主
ALTER SEQUENCE public.check_history_id_seq
    OWNED BY public.check_history.id;

-- 索引
CREATE INDEX idx_check_configs_enabled
    ON public.check_configs USING btree (enabled)
    WHERE (enabled = true);

CREATE INDEX idx_check_history_checked_at
    ON public.check_history USING btree (checked_at DESC);

CREATE INDEX idx_check_history_config_id
    ON public.check_history USING btree (config_id);

-- 视图：最近一次检测结果
CREATE VIEW public.v_latest_check_results AS
SELECT DISTINCT ON (c.id)
       c.id,
       c.name,
       c.type,
       c.model,
       c.endpoint,
       c.enabled,
       h.status,
       h.latency_ms,
       h.checked_at,
       h.message
FROM   check_configs c
       LEFT JOIN check_history h
              ON (c.id = h.config_id)
WHERE  (c.enabled = true)
ORDER  BY c.id, h.checked_at DESC NULLS LAST;

-- 视图：统计信息（最近 1 小时）
CREATE VIEW public.v_check_stats AS
SELECT c.id,
       c.name,
       c.type,
       count(h.id) AS total_checks,
       count(
           CASE
               WHEN (h.status = 'operational'::text) THEN 1
               ELSE NULL::integer
           END
       ) AS successful_checks,
       count(
           CASE
               WHEN (h.status = 'failed'::text) THEN 1
               ELSE NULL::integer
           END
       ) AS failed_checks,
       round(
           (
               100.0 * count(
                   CASE
                       WHEN (h.status = 'operational'::text) THEN 1
                       ELSE NULL::integer
                   END
               )::numeric
           )
           / NULLIF(count(h.id), 0)::numeric,
           2
       ) AS success_rate,
       avg(h.latency_ms) FILTER (WHERE (h.latency_ms IS NOT NULL)) AS avg_latency_ms,
       min(h.latency_ms) FILTER (WHERE (h.latency_ms IS NOT NULL)) AS min_latency_ms,
       max(h.latency_ms) FILTER (WHERE (h.latency_ms IS NOT NULL)) AS max_latency_ms
FROM   check_configs c
       LEFT JOIN check_history h
              ON (c.id = h.config_id)
WHERE  (c.enabled = true)
  AND  (h.checked_at > (now() - INTERVAL '1 hour'))
GROUP  BY c.id, c.name, c.type;

-- 自动更新时间的触发函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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
BEFORE UPDATE ON public.check_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 表与列注释
COMMENT ON TABLE public.check_configs IS 'AI 服务商配置表 - 存储各个 AI 服务商的 API 配置信息';
COMMENT ON TABLE public.check_history IS '健康检测历史记录表 - 存储每次 API 健康检测的结果';

COMMENT ON COLUMN public.check_configs.id IS '配置 UUID - 自动生成的唯一标识符';
COMMENT ON COLUMN public.check_configs.name IS '配置显示名称 - 用于前端展示的友好名称';
COMMENT ON COLUMN public.check_configs.type IS '提供商类型 - 支持: openai(OpenAI), gemini(Google Gemini), anthropic(Anthropic Claude)';
COMMENT ON COLUMN public.check_configs.model IS '模型名称 - 如 gpt-4o-mini, gemini-1.5-flash, claude-3-5-sonnet-latest';
COMMENT ON COLUMN public.check_configs.endpoint IS 'API 端点 URL - 完整的 API 调用地址';
COMMENT ON COLUMN public.check_configs.api_key IS 'API 密钥 - 用于身份验证的密钥,明文存储(依赖 RLS 保护)';
COMMENT ON COLUMN public.check_configs.enabled IS '是否启用 - true: 启用检测, false: 禁用检测';
COMMENT ON COLUMN public.check_configs.is_maintenance IS '维护模式标记 - true 时停止健康检查';
COMMENT ON COLUMN public.check_configs.request_header IS '自定义请求头，JSONB 格式，如 {"User-Agent": "xxx"}';
COMMENT ON COLUMN public.check_configs.group_name IS '配置分组名称，用于 Dashboard 卡片分组展示，NULL 表示未分组';
COMMENT ON COLUMN public.check_configs.metadata IS '自定义请求参数，JSONB 格式，会合并到请求体中';
COMMENT ON COLUMN public.check_configs.created_at IS '创建时间 - 配置首次创建的时间戳';
COMMENT ON COLUMN public.check_configs.updated_at IS '更新时间 - 配置最后修改的时间戳,由触发器自动维护';

COMMENT ON COLUMN public.check_history.id IS '记录 ID - 自增的唯一标识符';
COMMENT ON COLUMN public.check_history.status IS '健康状态 - operational(正常), degraded(降级/响应慢), failed(失败)';
COMMENT ON COLUMN public.check_history.latency_ms IS '响应延迟(毫秒) - API 响应时间,失败时为 NULL';
COMMENT ON COLUMN public.check_history.checked_at IS '检测时间 - 执行健康检测的时间戳';
COMMENT ON COLUMN public.check_history.message IS '状态消息 - 详细的状态描述或错误信息';
COMMENT ON COLUMN public.check_history.created_at IS '记录创建时间 - 记录写入数据库的时间戳';
COMMENT ON COLUMN public.check_history.config_id IS '配置 UUID - 关联 check_configs.id,标识哪个配置的检测结果';

-- RPC: 获取最近历史记录
CREATE OR REPLACE FUNCTION public.get_recent_check_history(
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
    FROM check_history h
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
  JOIN check_configs c ON c.id = r.config_id
  WHERE r.rn <= limit_per_config
  ORDER BY c.name ASC, r.checked_at DESC;
$$;

-- RPC: 裁剪历史记录
CREATE OR REPLACE FUNCTION public.prune_check_history(
  limit_per_config integer DEFAULT 60
)
RETURNS void
LANGUAGE sql
VOLATILE
AS $$
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY config_id ORDER BY checked_at DESC) AS rn
    FROM check_history
  )
  DELETE FROM check_history
  WHERE id IN (
    SELECT id FROM ranked WHERE rn > limit_per_config
  );
$$;
