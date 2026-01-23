<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Check CX 是一个基于 Next.js 的 AI 模型健康监控面板，用于实时监控 OpenAI、Gemini、Anthropic 等 AI 模型的 API 可用性、延迟和错误信息。项目采用分层架构，通过后台轮询持续采集健康结果，并提供可视化 Dashboard 与只读状态 API，适合团队内部状态墙、供应商 SLA 监控与多模型对比。

## 核心特性

- **统一 Provider 支持**：OpenAI、Gemini、Anthropic，支持 Chat Completions 与 Responses 端点
- **实时延迟监控**：首 token 延迟、Ping 延迟与历史时间线
- **分组管理**：支持分组视图与分组详情页，包含分组标签与官网链接
- **维护模式**：支持系统通知横幅（Markdown 格式，多条轮播）
- **官方状态集成**：自动轮询 OpenAI 与 Anthropic 官方状态
- **多节点部署**：数据库租约保证单节点执行轮询，避免重复工作
- **安全设计**：模型密钥仅保存在数据库，服务端使用 service role key 读取

## 常用命令

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm dev

# 构建生产版本
pnpm build

# 运行生产服务器
pnpm start

# 代码检查
pnpm lint

# Docker 构建与运行
./deploy.sh                    # 构建并运行 Docker 容器
docker-compose up -d          # 使用 docker-compose 启动
```

## 环境配置

复制环境变量模板并配置：

```bash
cp .env.example .env.local
```

必需的环境变量：
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_PUBLISHABLE_OR_ANON_KEY` - Supabase 公共访问 Key
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key（服务端使用，勿暴露）
- `CHECK_NODE_ID` - 节点身份，用于多节点选主（默认：`local`）
- `CHECK_POLL_INTERVAL_SECONDS` - 检测间隔（15–600 秒，默认：60）

## 核心架构

### 代码结构 (重构后)

项目采用分层架构,清晰的职责划分:

```
lib/
├── types/              # 统一类型定义
│   ├── index.ts       # 类型导出入口
│   ├── provider.ts    # Provider 相关类型
│   ├── check.ts       # 检查结果类型
│   ├── database.ts    # 数据库表类型
│   └── dashboard.ts   # Dashboard 数据类型
├── providers/          # Provider 检查逻辑
│   ├── index.ts       # 统一入口,批量执行检查
│   ├── openai.ts      # OpenAI 完整实现
│   ├── gemini.ts      # Gemini 完整实现
│   ├── anthropic.ts   # Anthropic 完整实现
│   └── stream-check.ts # 流式检查通用逻辑
├── database/           # 数据库操作
│   ├── config-loader.ts # 配置加载
│   └── history.ts     # 历史记录管理
├── utils/              # 工具函数
│   ├── index.ts       # 工具函数统一导出
│   ├── cn.ts          # Tailwind className 合并
│   ├── url-helpers.ts # URL 处理工具
│   └── error-handler.ts # 统一错误处理
├── core/               # 核心模块
│   ├── global-state.ts # 全局状态管理
│   ├── poller.ts      # 后台轮询器
│   ├── dashboard-data.ts # Dashboard 数据聚合
│   ├── status.ts      # 状态元数据
│   └── polling-config.ts # 轮询配置
└── supabase/          # Supabase 客户端
    ├── client.ts      # 浏览器端
    ├── server.ts      # 服务器端
    └── middleware.ts  # 会话中间件
```

### 后台轮询系统

项目核心是一个服务器端轮询系统，在应用启动时自动初始化并持续运行:

- **入口**: `lib/core/poller.ts` 在模块加载时立即启动轮询
- **触发**: 使用 `setInterval` 按 `CHECK_POLL_INTERVAL_SECONDS` 间隔执行检测（默认 60 秒，支持 15-600 秒）
- **全局状态**: 通过 `lib/core/global-state.ts` 统一管理轮询定时器和运行状态，防止 Next.js 热重载时重复创建定时器
- **并发控制**: 使用 `__checkCxPollerRunning` 标志位防止多个检测任务重叠执行
- **选主机制**: `lib/core/poller-leadership.ts` 通过数据库租约选主，保证多节点部署时仅单节点执行轮询
- **官方状态轮询**: `lib/core/official-status-poller.ts` 定时抓取 OpenAI 和 Anthropic 官方状态

### 配置管理

配置已从环境变量迁移到 Supabase 数据库的 `check_configs` 表:

- **配置加载**: `lib/database/config-loader.ts:loadProviderConfigsFromDB()` 从数据库读取已启用的配置
- **动态启用/禁用**: 通过更新数据库 `enabled` 字段即可控制检测任务，无需重启应用
- **维护模式**: 设置 `is_maintenance = true` 保留卡片但停止轮询，显示维护状态
- **分组管理**: 通过 `group_name` 字段对配置进行分组，支持分组视图和详情页
- **自定义请求头**: 通过配置 `request_header` 字段自定义多个请求头（JSON 格式），可绕过特定的 API 请求限制
- **自定义请求参数**: 通过配置 `metadata` 字段（JSONB）自定义请求体参数，会合并到 API 请求中
- **类型安全**: 使用 `lib/types/database.ts` 中定义的 `CheckConfigRow` 类型

### 健康检查流程

1. **配置加载**: `lib/database/config-loader.ts:loadProviderConfigsFromDB()` 读取所有启用的配置
2. **数学挑战验证**: `lib/providers/challenge.ts` 生成数学题验证模型响应能力
3. **Provider 检查**: `lib/providers/ai-sdk-check.ts` 使用 Vercel AI SDK 并发执行所有配置的检查
4. **延迟测量**: 测量首 token 延迟和端点 Ping 延迟
5. **状态判定**:
   - `operational`: 请求成功且延迟 ≤ 6000ms
   - `degraded`: 请求成功但延迟 > 6000ms
   - `failed`: 请求失败或超时（默认超时 15 秒）
   - `maintenance`: 配置标记为维护模式
6. **三类 Provider 支持**:
   - **OpenAI**: 支持 Chat Completions 和 Responses API
   - **Gemini**: Google AI 模型支持
   - **Anthropic**: Claude 系列模型支持

### 数据存储与历史

- **历史写入**: `lib/database/history.ts:appendHistory()` 将检测结果写入 Supabase `check_history` 表
- **数据清理**: 自动调用 `prune_check_history` RPC，每个配置最多保留 60 条历史记录
- **可用性统计**: `availability_stats` 视图提供 7/15/30 天的可用性统计数据
- **快照服务**: `lib/core/health-snapshot-service.ts` 统一读取历史与触发刷新
- **数据结构**: 使用 `config_id` 外键关联 `check_configs` 表，存储 `status`、`latency_ms`、`checked_at`、`message` 字段
- **类型安全**: 使用 `lib/types/database.ts` 中定义的 `CheckHistoryRow` 类型

### Dashboard 数据流

1. **页面渲染**: `app/page.tsx` 使用 `loadDashboardData({ refreshMode: "missing" })` 加载初始数据
2. **API 路由**:
   - `app/api/dashboard/route.ts` - Dashboard 数据 API（ETag + CDN 缓存）
   - `app/api/group/[groupName]/route.ts` - 分组数据 API
   - `app/api/v1/status/route.ts` - 对外只读状态 API
3. **刷新模式**:
   - `missing`: 仅当数据库中无历史记录时触发一次实时检测
   - `always`: 强制触发实时检测（用于 `/api/dashboard` 路由）
   - `never`: 仅从数据库读取历史记录
4. **缓存机制**:
   - 后端：`lib/core/health-snapshot-service.ts` 使用全局缓存，避免在轮询间隔内重复检测
   - 前端：`lib/utils/frontend-cache.ts` 实现 SWR 风格缓存，配合 ETag
5. **前端轮询**: `components/dashboard-view.tsx` 使用客户端定时器定期调用 `/api/dashboard` 获取最新数据
6. **数据聚合**: `lib/core/dashboard-data.ts` 和 `lib/core/group-data.ts` 负责分组与统计数据

### Supabase 集成

- **服务端**: `lib/supabase/server.ts` 提供服务器端客户端（支持 SSR 和 cookies）
- **管理端**: `lib/supabase/admin.ts` 提供管理员客户端（绕过 RLS）
- **中间件**: `lib/supabase/middleware.ts` 处理会话刷新
- **环境变量**:
  - `SUPABASE_URL`: Supabase 项目 URL
  - `SUPABASE_PUBLISHABLE_OR_ANON_KEY`: 公开/匿名 key
  - `SUPABASE_SERVICE_ROLE_KEY`: Service Role key（管理员权限）

### 数据库表结构

```sql
-- 配置表
check_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'openai' | 'gemini' | 'anthropic'
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  is_maintenance BOOLEAN DEFAULT false,  -- 维护模式
  group_name TEXT,  -- 分组名称
  request_header JSONB,  -- 自定义请求头
  metadata JSONB,  -- 自定义请求参数
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

-- 历史记录表
check_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES check_configs(id),
  status TEXT NOT NULL,  -- 'operational' | 'degraded' | 'failed' | 'maintenance'
  latency_ms INTEGER,
  ping_latency_ms INTEGER,  -- Ping 延迟
  checked_at TIMESTAMPTZ DEFAULT now(),
  message TEXT
)

-- 分组信息表
group_info (
  group_name TEXT PRIMARY KEY,
  display_name TEXT,
  description TEXT,
  website_url TEXT,
  icon_url TEXT
)

-- 系统通知表
system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,  -- Markdown 格式
  level TEXT DEFAULT 'info',  -- 'info' | 'warning' | 'error'
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- 轮询器租约表
check_poller_leases (
  id INTEGER PRIMARY KEY DEFAULT 1,  -- 单行表
  leader_node_id TEXT NOT NULL,
  last_renewed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
)
```

### 数据库视图和函数

- **availability_stats**: 7/15/30 天可用性统计视图
- **get_recent_check_history**: 获取最近的检查历史 RPC
- **prune_check_history**: 清理历史记录的 RPC

## 关键约定

### 数据流向

- **后台 → 数据库**: `lib/core/poller.ts` → `lib/providers/` → `lib/database/history.ts` → Supabase
- **数据库 → 前端**: Supabase → `lib/core/dashboard-data.ts` → `app/page.tsx` → `components/dashboard-view.tsx`
- **实时刷新**: 前端定时器 → `/api/dashboard` → `lib/core/dashboard-data.ts`

### 类型系统

- **统一导出**: 所有类型从 `lib/types/index.ts` 统一导出
- **分类清晰**: 类型按职责分为 provider、check、database、dashboard 四类
- **类型安全**: 数据库查询使用明确的类型定义,避免类型断言

### 模块职责

- **单一职责**: 每个模块专注单一功能,文件不超过 200 行
- **清晰边界**: providers 负责检查,database 负责存储,core 负责协调
- **易于扩展**: 新增 Provider 只需在 `lib/providers/` 添加一个文件

### 性能优化

1. **流式响应**: 使用 Vercel AI SDK 的流式 API，只需接收到首个 token 即可判定可用性
2. **Token 限制**: 所有请求设置 `max_tokens: 1`，最小化响应数据量
3. **数学挑战**: 使用简单的数学题验证模型响应，避免复杂 prompt 的开销
4. **缓存策略**:
   - 后端快照缓存：基于轮询间隔的全局缓存，避免重复检测
   - 前端 SWR 缓存：配合 ETag 实现高效的客户端缓存
   - 官方状态缓存：内存 Map 缓存官方状态结果
5. **并发控制**: 使用 `p-limit` 控制最大并发数（默认 5，可配置）
6. **数据清理**: 自动清理历史记录，每个配置最多保留 60 条
7. **数据库优化**: 使用物化视图和 RPC 函数提升查询性能

### 错误处理

- 所有网络请求都有 15 秒超时控制
- 检测失败时返回 `status: "failed"`,不抛出异常
- 数据库操作失败时记录日志并返回空数据/上次缓存
- 轮询器使用 `try-catch` 包裹,单次失败不影响后续执行
- **统一日志**: 使用 `lib/utils/error-handler.ts` 的 `logError()` 记录错误

## 添加新的 AI Provider

1. 在 `lib/types/provider.ts` 中添加 `ProviderType` 类型
2. 在 `lib/providers/` 创建新文件,实现 `checkXxx()` 函数
3. 使用 `runStreamCheck()` 提供的通用流式检查逻辑
4. 实现 Provider 特定的流解析器 (`parseXxxStream()`)
5. 在 `lib/providers/index.ts` 的 `checkProvider()` switch 中添加分支
6. 在 `lib/core/status.ts` 的 `PROVIDER_LABEL` 中添加显示名称
7. 在 `components/provider-icon.tsx` 中添加对应图标

**示例**:

```typescript
// lib/providers/新provider.ts
import type { CheckResult, ProviderConfig } from "../types";
import { ensurePath } from "../utils";
import { runStreamCheck } from "./stream-check";

async function parse新ProviderStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  // 实现流解析逻辑
}

export async function check新Provider(
  config: ProviderConfig
): Promise<CheckResult> {
  const url = ensurePath(config.endpoint, "/api/endpoint");
  const payload = { /* ... */ };

  return runStreamCheck(config, {
    url,
    displayEndpoint: config.endpoint,
    init: {
      headers: { /* ... */ },
      body: JSON.stringify(payload),
    },
    parseStream: parse新ProviderStream,
  });
}
```

## 修改配置

不要通过环境变量管理 CHECK 配置,请使用 SQL 命令在 Supabase 中操作:

```sql
-- 添加配置
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled)
VALUES ('主力 OpenAI', 'openai', 'gpt-4o-mini',
        'https://api.openai.com/v1/chat/completions',
        'sk-xxx', true);

-- 添加配置并设置自定义请求头（JSON 格式）
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled, request_header)
VALUES ('自定义请求头配置', 'openai', 'gpt-4o-mini',
        'https://api.example.com/v1/chat/completions',
        'sk-xxx', true,
        '{"User-Agent": "claude-cli/1.0.111 (external, cli)", "X-Custom-Header": "some-value"}');

-- 添加配置并设置自定义请求参数（metadata）
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled, metadata)
VALUES ('自定义参数配置', 'openai', 'gpt-4o-mini',
        'https://api.example.com/v1/chat/completions',
        'sk-xxx', true,
        '{"temperature": 0.5, "max_tokens": 50}');

-- 同时设置请求头和 metadata
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled, request_header, metadata)
VALUES ('完整自定义配置', 'openai', 'gpt-4o-mini',
        'https://api.example.com/v1/chat/completions',
        'sk-xxx', true,
        '{"User-Agent": "custom-agent/1.0", "X-Request-Id": "check-cx"}',
        '{"temperature": 0.7}');

-- 更新已有配置的请求头
UPDATE check_configs
SET request_header = '{"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}'
WHERE name = '主力 OpenAI';

-- 更新已有配置的 metadata
UPDATE check_configs
SET metadata = '{"max_tokens": 100}'
WHERE name = '主力 OpenAI';

-- 清除自定义请求头(恢复使用默认值)
UPDATE check_configs
SET request_header = NULL
WHERE name = '主力 OpenAI';

-- 禁用配置
UPDATE check_configs SET enabled = false WHERE name = '主力 OpenAI';

-- 删除配置
DELETE FROM check_configs WHERE name = '旧配置';

-- 设置维护模式
UPDATE check_configs SET is_maintenance = true WHERE name = '维护中的服务';

-- 设置分组
UPDATE check_configs SET group_name = '生产环境' WHERE name IN ('OpenAI GPT-4', 'Claude 3');

-- 添加分组信息
INSERT INTO group_info (group_name, display_name, description, website_url)
VALUES ('生产环境', 'Production', '核心生产环境模型', 'https://status.openai.com');

-- 添加系统通知
INSERT INTO system_notifications (message, level, start_time, end_time)
VALUES ('**系统维护通知**：今晚 22:00-24:00 进行系统维护，可能影响服务可用性。', 'warning', NOW(), NOW() + INTERVAL '2 days');
```

## 调试轮询器

轮询器在每次执行时会输出详细日志:

- 检测开始/结束时间
- 每个配置的检测结果、延迟、状态
- 历史记录写入结果
- 下次预计执行时间

查看服务器日志:

```bash
pnpm dev  # 在开发模式下日志会输出到终端
```

## 测试指南

目前项目尚未集成自动化测试框架，但建议：

1. **手动测试**：运行 `pnpm dev`，验证 Dashboard 刷新和数据显示
2. **数据库测试**：在测试环境执行 Supabase 迁移，验证数据完整性
3. **Provider 测试**：使用 mock 端点测试不同 Provider 的适配性
4. **性能测试**：验证多配置并发检查的性能表现

## 开发约定

### 代码风格
- 默认使用 Server Components，仅在需要时添加 `"use client"`
- TypeScript 文件使用 2 空格缩进，优先使用 `const`
- 组件命名使用 PascalCase，如 `DashboardView`
- 导入排序：Node 内置模块 → 第三方包 → `@/` 别名路径

### 提交规范
遵循 Conventional Commits：
- `feat:` - 新功能
- `fix:` - Bug 修复
- `chore:` - 构建或工具变更
- `refactor:` - 代码重构
- `docs:` - 文档更新

### 安全提醒
- 不要提交真实的 API 密钥到版本控制
- 使用环境变量或数据库存储敏感配置
- 在分享日志前清理敏感信息

## 扩展文档

更多详细信息请参考项目文档：
- `docs/ARCHITECTURE.md` - 架构设计说明
- `docs/OPERATIONS.md` - 运维手册
- `docs/EXTENDING_PROVIDERS.md` - Provider 扩展指南
- `AGENTS.md` - 项目规范和约定
