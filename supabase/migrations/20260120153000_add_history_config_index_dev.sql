-- =============================================================================
-- 迁移：为历史查询添加组合索引 (dev schema)
--
-- 目的：加速按 config_id + checked_at 的查询与窗口排序
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dev_history_config_id_checked_at
ON dev.check_history (config_id, checked_at DESC);
