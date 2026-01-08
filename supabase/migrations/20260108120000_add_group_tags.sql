ALTER TABLE public.group_info
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.group_info.tags IS '分组标签，用于标记分组类型/用途';

