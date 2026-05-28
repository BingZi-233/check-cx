# Check CX 运维手册

本文面向运维与平台工程，描述部署、数据库初始化与日常运行维护要点。

## 1. 运行环境

- Node.js 18 及以上（建议 20 LTS）
- pnpm 10
- Supabase（PostgreSQL）

## 2. 环境变量

### 必需（服务端）

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_OR_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

其中 `SUPABASE_SERVICE_ROLE_KEY` 用于后台轮询、配置加载和租约续租，必须配置在服务端环境中，禁止暴露到客户端。

### 可选（数据库 schema）

- `SUPABASE_DB_SCHEMA`：显式指定 PostgREST 访问的 PostgreSQL schema（如 `public`、`dev`）。
- 未设置时：`NODE_ENV=development` 使用 `dev`，否则使用 `public`。
- 指定的 schema 必须在 Supabase **Exposed schemas** 中已暴露，且已执行对应的 `schema.sql` / `schema-dev.sql` 与迁移。

### 可选（运行参数）

- `CHECK_NODE_ID`：节点标识（多节点部署必须唯一）
- `CHECK_POLL_INTERVAL_SECONDS`：检测间隔（15–600 秒）
- `CHECK_CONCURRENCY`：并发数（1–20）
- `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS`：官方状态轮询间隔（60–3600 秒）
- `HISTORY_RETENTION_DAYS`：历史保留天数（7–365）

## 3. 数据库初始化

### 3.1 新建项目

- 生产/正式环境：执行 `supabase/schema.sql`
- 本地开发（dev schema）：执行 `supabase/schema-dev.sql`

> 提示：默认在 `NODE_ENV=development` 时使用 `dev` schema。若云库仅初始化 `public`，在环境变量中设置 `SUPABASE_DB_SCHEMA=public`。

### 3.2 升级已有项目

- 执行 `supabase/migrations/` 下的迁移（按时间顺序）。
- 如使用 dev schema，需同步执行 `*_dev.sql` 迁移。

### 3.2.1 模型拆分迁移后的自检 SQL

执行完 `20260322120000_extract_check_models.sql` 后，建议至少跑下面几条检查：

```sql
-- 1) 当前模型总数
SELECT COUNT(*) AS model_count
FROM check_models;

-- 2) 是否存在未关联模型的配置（正常应为 0）
SELECT COUNT(*) AS configs_without_model
FROM check_configs
WHERE model_id IS NULL;

-- 3) 是否存在失效的 model_id（正常应为 0）
SELECT COUNT(*) AS orphan_model_refs
FROM check_configs c
LEFT JOIN check_models m ON m.id = c.model_id
WHERE m.id IS NULL;

-- 4) 配置类型和模型类型是否不一致（正常应为 0）
SELECT COUNT(*) AS type_mismatch_count
FROM check_configs c
JOIN check_models m ON m.id = c.model_id
WHERE c.type <> m.type;

-- 5) 相同 (type, model) 是否被错误拆成多条模型（正常应为空）
SELECT type, model, COUNT(*) AS duplicated_count
FROM check_models
GROUP BY type, model
HAVING COUNT(*) > 1;

-- 6) 抽样查看回填结果
SELECT
  c.name,
  c.type AS config_type,
  m.model,
  m.type AS model_type,
  c.endpoint,
  c.enabled,
  c.is_maintenance
FROM check_configs c
JOIN check_models m ON m.id = c.model_id
ORDER BY c.updated_at DESC
LIMIT 20;
```

如果你的数据库是从旧结构升级上来的，还可以补一条结构确认：

```sql
-- 7) 确认 check_configs 已不再保留旧 model 列
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'check_configs'
  AND column_name = 'model';
```

返回 0 行表示旧列已移除，结构已切换完成。

### 3.2.2 迁移失败时的排查与重跑

如果模型拆分迁移没有完全成功，先不要手动改业务代码，按下面顺序处理：

#### 场景 A：`check_models` 已创建，但 `check_configs.model_id` 没有全部回填

先检查哪些配置没有关联模型：

```sql
SELECT id, name, type, endpoint
FROM check_configs
WHERE model_id IS NULL
ORDER BY updated_at DESC;
```

然后安全重跑“模型去重插入 + model_id 回填”：

如果旧库已经完成迁移、`check_configs.model` 已删除，就不要尝试“自动重新生成模型名”。  
这时应优先从以下来源恢复模型定义：

- 数据库备份
- 迁移前快照
- 管理后台中人工确认过的模型清单
- 外部配置登记表

确认模型定义后，再补齐 `check_models`，最后回填 `model_id`。

对于仍保留旧 `check_configs.model` 列、但回填没完成的中间态，可执行：

```sql
INSERT INTO check_models (type, model)
SELECT DISTINCT type, model
FROM check_configs
WHERE model IS NOT NULL
ON CONFLICT (type, model) DO NOTHING;

UPDATE check_configs AS c
SET model_id = m.id
FROM check_models AS m
WHERE c.model_id IS NULL
  AND m.type = c.type
  AND m.model = c.model;
```

#### 场景 B：模型表已经有数据，但出现重复模型

先找重复：

```sql
SELECT type, model, COUNT(*) AS duplicated_count
FROM check_models
GROUP BY type, model
HAVING COUNT(*) > 1;
```

如果真的出现重复，不要直接删。先确定保留哪条，再把 `check_configs.model_id` 指过去，最后删多余记录：

```sql
-- 示例：先人工选定 keep_id 和 drop_id
UPDATE check_configs
SET model_id = 'KEEP_MODEL_UUID'
WHERE model_id = 'DROP_MODEL_UUID';

DELETE FROM check_models
WHERE id = 'DROP_MODEL_UUID';
```

#### 场景 C：配置类型与模型类型不一致

先找出异常记录：

```sql
SELECT
  c.id AS config_id,
  c.name,
  c.type AS config_type,
  m.id AS model_id,
  m.type AS model_type,
  m.model
FROM check_configs c
JOIN check_models m ON m.id = c.model_id
WHERE c.type <> m.type;
```

处理原则：

- 配置类型填错：修 `check_configs.type`
- 模型挂错：把 `check_configs.model_id` 改到正确模型
- 两边都不确定：先停用该配置，再人工核对

#### 场景 D：需要重跑迁移 SQL

推荐做法：

1. 先执行上面的自检 SQL，确认当前卡在哪一步
2. 只重跑“幂等”的补齐语句：`CREATE TABLE IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`、`ON CONFLICT DO NOTHING`
3. 不要直接手改已上线业务代码来绕过数据问题
4. 重跑后再次执行“3.2.1 模型拆分迁移后的自检 SQL”

#### 场景 E：必须回滚

如果迁移刚执行完且业务还没切到新代码，优先从数据库备份恢复。  
如果新代码已经上线，不建议直接回滚到旧结构，因为代码已经按 `model_id` / `check_models` 工作。

更稳妥的做法是：

1. 维持当前表结构
2. 修复 `check_models` 和 `check_configs.model_id`
3. 通过自检 SQL 确认一致性
4. 再恢复流量或重新启用配置

### 3.3 关键对象

- 表：`check_models`、`check_configs`、`check_request_templates`、`check_history`、`group_info`、`system_notifications`、`check_poller_leases`
- 视图：`availability_stats`
- RPC：`get_recent_check_history`、`prune_check_history`

缺失 RPC 或视图会导致聚合回退到慢查询，应优先完成迁移。

## 4. 部署模式

### 4.1 单节点

- 默认行为：该节点执行轮询并写入历史。

### 4.2 多节点

- 使用 `check_poller_leases` 表进行租约选主。
- 只有 leader 节点执行轮询；standby 节点仅提供读取 API。
- 必须为每个节点设置唯一 `CHECK_NODE_ID`，避免租约冲突。

## 5. 运维操作

### 5.1 添加与调整配置

```sql
-- 先确保模型存在
INSERT INTO check_models (type, model)
VALUES ('openai', 'gpt-4o-mini')
ON CONFLICT (type, model) DO NOTHING;

-- 再新增配置实例
INSERT INTO check_configs (name, type, model_id, endpoint, api_key, enabled)
SELECT 'OpenAI GPT-4o',
       'openai',
       id,
       'https://api.openai.com/v1/chat/completions',
       'sk-xxx',
       true
FROM check_models
WHERE type = 'openai'
  AND model = 'gpt-4o-mini';

-- 维护模式
UPDATE check_configs SET is_maintenance = true WHERE name = 'OpenAI GPT-4o';

-- 禁用
UPDATE check_configs SET enabled = false WHERE name = 'OpenAI GPT-4o';
```

参数优先级固定为：

- `check_request_templates`：跨模型复用的通用默认值
- `check_models`：只负责绑定模型与模板
- `check_configs`：只负责实例连接信息

运行时只读取模型绑定模板中的 `request_header` / `metadata`

### 5.2 分组信息维护

```sql
INSERT INTO group_info (group_name, website_url, tags)
VALUES ('主力服务商', 'https://example.com', 'core,prod');
```

`tags` 为英文逗号分隔字符串，前端会解析展示。

### 5.3 系统通知

```sql
INSERT INTO system_notifications (message, level, is_active)
VALUES ('**注意**：部分服务延迟升高', 'warning', true);
```

### 5.4 历史保留

- 每次写入后自动调用 `prune_check_history`。
- 如需手动清理，可直接调用 RPC：

```sql
SELECT prune_check_history(30);
```

## 6. 监控与日志

关键日志（服务端）：

- `[check-cx] 初始化后台轮询器...`
- `[check-cx] 节点角色切换：standby -> leader ...`
- `[check-cx] 本轮检测明细：...`
- `[官方状态] openai: operational - ...`

建议按关键字 `check-cx` 与 `[官方状态]` 建立日志告警。

## 7. 常见问题

### 7.1 页面没有任何卡片

- 确认 `check_configs` 至少一条 `enabled = true`。
- 确认对应 `model_id` 已正确关联到 `check_models`。
- 检查服务端是否报缺失环境变量或权限错误。

### 7.2 时间线一直为空

- 查看轮询器日志是否运行。
- 检查 `check_history` 是否有新增记录。
- 确认 `CHECK_POLL_INTERVAL_SECONDS` 未设置过大。

### 7.3 官方状态显示 unknown

- 当前仅 OpenAI/Anthropic 实现官方状态。
- 检查外网访问是否被阻断或 DNS 被限制。

### 7.4 多节点重复写入

- 确认每个节点 `CHECK_NODE_ID` 唯一。
- 检查 `check_poller_leases` 是否可写（需 service role key）。
