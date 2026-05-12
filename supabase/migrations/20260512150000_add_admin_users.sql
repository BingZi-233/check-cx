-- 邀请制后台用户目录

CREATE TABLE IF NOT EXISTS public.admin_users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    role            text NOT NULL,
    group_name      text,
    auth_user_id    uuid,
    invited_by      uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
    is_active       boolean DEFAULT true,
    invited_at      timestamptz DEFAULT now(),
    activated_at    timestamptz,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    CONSTRAINT admin_users_email_key UNIQUE (email),
    CONSTRAINT admin_users_auth_user_id_key UNIQUE (auth_user_id),
    CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'member')),
    CONSTRAINT admin_users_member_group_check CHECK (
        role = 'admin' OR (group_name IS NOT NULL AND btrim(group_name) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role_group
    ON public.admin_users (role, group_name);

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_users IS '后台用户目录表，存储邀请用户、角色和预设分组';
COMMENT ON COLUMN public.admin_users.email IS '登录邮箱，统一使用小写';
COMMENT ON COLUMN public.admin_users.role IS '后台角色：admin 或 member';
COMMENT ON COLUMN public.admin_users.group_name IS '成员预设分组名；管理员可为空';
COMMENT ON COLUMN public.admin_users.auth_user_id IS '首次登录后绑定的 Supabase Auth 用户 ID';
COMMENT ON COLUMN public.admin_users.invited_by IS '邀请人，对应 admin_users.id';
COMMENT ON COLUMN public.admin_users.is_active IS '是否启用该后台用户';
COMMENT ON COLUMN public.admin_users.invited_at IS '邀请写入时间';
COMMENT ON COLUMN public.admin_users.activated_at IS '首次成功登录激活时间';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'dev'
          AND table_name = 'admin_users'
    ) THEN
        EXECUTE '
            CREATE TABLE dev.admin_users (
                id uuid NOT NULL DEFAULT gen_random_uuid(),
                email text NOT NULL,
                role text NOT NULL,
                group_name text,
                auth_user_id uuid,
                invited_by uuid,
                is_active boolean DEFAULT true,
                invited_at timestamp with time zone DEFAULT now(),
                activated_at timestamp with time zone,
                created_at timestamp with time zone DEFAULT now(),
                updated_at timestamp with time zone DEFAULT now(),
                CONSTRAINT admin_users_pkey PRIMARY KEY (id),
                CONSTRAINT admin_users_email_key UNIQUE (email),
                CONSTRAINT admin_users_auth_user_id_key UNIQUE (auth_user_id),
                CONSTRAINT admin_users_role_check CHECK ((role = ANY (ARRAY[''admin''::text, ''member''::text]))),
                CONSTRAINT admin_users_member_group_check CHECK (((role = ''admin''::text) OR ((group_name IS NOT NULL) AND (btrim(group_name) <> ''''::text)))),
                CONSTRAINT admin_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES dev.admin_users(id) ON DELETE SET NULL
            )';
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dev_admin_users_role_group ON dev.admin_users (role, group_name)';
    EXECUTE 'ALTER TABLE dev.admin_users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP TRIGGER IF EXISTS update_admin_users_updated_at ON dev.admin_users';
    EXECUTE '' ||
      'CREATE TRIGGER update_admin_users_updated_at ' ||
      'BEFORE UPDATE ON dev.admin_users ' ||
      'FOR EACH ROW EXECUTE FUNCTION dev.update_updated_at_column()';
    EXECUTE 'COMMENT ON TABLE dev.admin_users IS ''后台用户目录表 - 存储邀请用户、角色与预设分组''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.email IS ''登录邮箱 - 建议统一使用小写''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.role IS ''后台角色 - admin 或 member''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.group_name IS ''成员预设分组名；管理员可为空''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.auth_user_id IS ''首次登录后绑定的 Supabase Auth 用户 ID''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.invited_by IS ''邀请人，对应 admin_users.id''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.is_active IS ''是否启用该后台用户''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.invited_at IS ''邀请写入时间''';
    EXECUTE 'COMMENT ON COLUMN dev.admin_users.activated_at IS ''首次成功登录激活时间''';
END $$;
