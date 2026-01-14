-- =============================================================================
-- 迁移：dev schema 新增轮询主节点租约表
-- =============================================================================

CREATE TABLE IF NOT EXISTS dev.check_poller_leases (
    lease_key text PRIMARY KEY,
    leader_id text,
    lease_expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dev.check_poller_leases IS '轮询主节点租约表（单行租约）';

INSERT INTO dev.check_poller_leases (lease_key, leader_id, lease_expires_at)
VALUES ('poller', NULL, to_timestamp(0))
ON CONFLICT (lease_key) DO NOTHING;

-- Enable RLS (service role only)
ALTER TABLE dev.check_poller_leases ENABLE ROW LEVEL SECURITY;
