-- 告警渠道表
CREATE TABLE IF NOT EXISTS alert_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('webhook', 'feishu', 'dingtalk')),
  config      JSONB NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 告警规则表
CREATE TABLE IF NOT EXISTS alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  condition_type   TEXT NOT NULL CHECK (condition_type IN ('status_change', 'consecutive_failures', 'latency_threshold')),
  condition_params JSONB NOT NULL DEFAULT '{}',
  channel_ids      UUID[] NOT NULL DEFAULT '{}',
  config_ids       UUID[] DEFAULT NULL,   -- NULL 表示监控所有配置
  enabled          BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_channel_ids ON alert_rules USING GIN (channel_ids);
CREATE INDEX IF NOT EXISTS idx_alert_rules_config_ids  ON alert_rules USING GIN (config_ids);

-- 告警历史表
CREATE TABLE IF NOT EXISTS alert_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES alert_rules(id)    ON DELETE CASCADE,
  channel_id    UUID NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
  config_id     UUID NOT NULL REFERENCES check_configs(id)  ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  payload       JSONB,
  error_message TEXT,
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule_id      ON alert_history (rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_config_id    ON alert_history (config_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON alert_history (triggered_at DESC);
