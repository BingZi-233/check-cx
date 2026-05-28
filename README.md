# Check CX

Check CX 是一个用于监控 AI 模型 API 可用性与延迟的健康监测面板。项目基于 Next.js App Router 与 Supabase 构建，通过后台轮询持续采集健康检查结果，并提供可视化
Dashboard 与只读状态 API，适用于团队内部状态展示、供应商 SLA 监控以及多模型能力对比等场景。

## 相关项目

- 后台管理端：[`BingZi-233/check-cx-admin`](https://github.com/BingZi-233/check-cx-admin)
- 管理端用于维护 `check_models`、`check_configs`、分组信息、系统通知等后台数据；当前项目负责健康检查执行、状态展示与只读 API 输出。

![Check CX Dashboard](docs/images/index.png)

## 功能概览

- 统一的 Provider 健康检查能力（OpenAI / Gemini / Anthropic），支持 Chat Completions 与 Responses 端点
- 实时延迟、Ping 延迟与历史时间线，支持 7/15/30 天可用性统计
- 分组视图与分组详情页（`group_name` + `group_info`），支持分组标签与官网链接
- 维护模式与系统通知横幅（支持 Markdown，多条轮播）
- 官方状态轮询（当前支持 OpenAI 与 Anthropic）
- 多节点部署场景下的自动选主能力（通过数据库租约保证单节点执行轮询）
- 安全默认：模型密钥仅保存在数据库中，由服务端通过 service role key 读取

## 快速开始

### 1. 环境准备

- Node.js 18 及以上版本（建议使用 20 LTS）
- pnpm 10
- Supabase 项目（PostgreSQL）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写以下内容：

```env
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_OR_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CHECK_NODE_ID=local
CHECK_POLL_INTERVAL_SECONDS=60
HISTORY_RETENTION_DAYS=30
OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS=300
CHECK_CONCURRENCY=5
```

### 4. 初始化数据库

- 全新项目：执行 `supabase/schema.sql`；如需使用开发 schema，请执行 `supabase/schema-dev.sql`。
- 已存在数据库：按顺序执行 `supabase/migrations/` 目录中的迁移文件；如使用 dev schema，请同步执行 `*_dev.sql` 迁移。

### 5. 添加最小配置

```sql
-- 1) 先创建模型
INSERT INTO check_models (type, model)
VALUES ('openai', 'gpt-4o-mini')
ON CONFLICT (type, model) DO NOTHING;

-- 2) 再创建配置实例
INSERT INTO check_configs (name, type, model_id, endpoint, api_key, enabled)
SELECT 'OpenAI GPT-4o',
       'openai',
       id,
       'https://api.openai.com/v1/chat/completions',
       'sk-your-api-key',
       true
FROM check_models
WHERE type = 'openai'
  AND model = 'gpt-4o-mini';
```

### 6. 启动开发服务器

```bash
pnpm dev
```

启动后访问 `http://localhost:3000` 查看 Dashboard。

## 运行与部署

```bash
pnpm dev    # 本地开发
pnpm build  # 生产构建
pnpm start  # 生产运行
pnpm lint   # 代码检查
```

部署时，请将 `.env.local` 中的变量注入到目标平台，例如 Vercel、容器环境或自建服务器。

## 配置说明

### 环境变量

| 变量                                       | 必需 | 默认值     | 说明                          |
|------------------------------------------|----|---------|-----------------------------|
| `SUPABASE_URL`                           | 是  | -       | Supabase 项目 URL             |
| `SUPABASE_PUBLISHABLE_OR_ANON_KEY`       | 是  | -       | Supabase 公共访问 Key           |
| `SUPABASE_SERVICE_ROLE_KEY`              | 是  | -       | Service Role Key（服务端使用，勿暴露） |
| `SUPABASE_DB_SCHEMA`                     | 否  | 见说明     | PostgREST schema；未设置时 `development`→`dev`，否则 `public` |
| `CHECK_NODE_ID`                          | 否  | `local` | 节点身份，用于多节点选主                |
| `CHECK_POLL_INTERVAL_SECONDS`            | 否  | `60`    | 检测间隔（15–600 秒）              |
| `CHECK_CONCURRENCY`                      | 否  | `5`     | 最大并发（1–20）                  |
| `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS` | 否  | `300`   | 官方状态轮询间隔（60–3600 秒）         |
| `HISTORY_RETENTION_DAYS`                 | 否  | `30`    | 历史保留天数（7–365）               |

### Provider 配置要点

- `check_models` 用于统一维护模型定义与模板绑定关系，`check_configs` 通过 `model_id` 关联模型。
- `check_configs.type` 目前支持 `openai` / `gemini` / `anthropic`。
- `endpoint` 必须填写完整端点：
    - `/v1/chat/completions` 使用 Chat Completions
    - `/v1/responses` 使用 Responses API
- `check_models.template_id` 可选关联 `check_request_templates`，用于复用默认请求头与 metadata。
- `check_request_templates.type` 必须与 `check_models.type` 一致（如 `anthropic` 模型只能绑定 `anthropic` 模板）。
- `check_configs.model_id` 关联的模型类型必须与 `check_configs.type` 一致。
- 请求头与 metadata 统一从 `check_request_templates` 读取；配置实例不再提供覆盖字段。
- `is_maintenance = true` 会保留卡片但停止轮询；`enabled = false` 则表示该配置完全不纳入检测。

## API 概览

- `GET /api/dashboard?trendPeriod=7d|15d|30d`：Dashboard 聚合数据（带 ETag）。返回完整时间线与可用性统计。
- `GET /api/group/[groupName]?trendPeriod=7d|15d|30d`：分组详情数据。
- `GET /api/v1/status?group=...&model=...`：对外只读状态 API。

更详细的接口定义与数据结构说明请参见下列文档。

## 文档

- 架构说明：`docs/ARCHITECTURE.md`
- 运维手册：`docs/OPERATIONS.md`
- Provider 扩展：`docs/EXTENDING_PROVIDERS.md`

## 许可证

[MIT](LICENSE)
