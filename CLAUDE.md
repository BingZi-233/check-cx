# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Check CX 是一个基于 Next.js 的 AI 模型健康监控面板,用于实时监控 OpenAI、Gemini、Anthropic 等 AI 模型的 API 可用性、延迟和错误信息。

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
```

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

项目核心是一个服务器端轮询系统,在应用启动时自动初始化并持续运行:

- **入口**: `lib/core/poller.ts` 在模块加载时立即启动轮询
- **触发**: 使用 `setInterval` 按 `CHECK_POLL_INTERVAL_SECONDS` 间隔执行检测(默认 60 秒,支持 15-600 秒)
- **全局状态**: 通过 `lib/core/global-state.ts` 统一管理轮询定时器和运行状态,防止 Next.js 热重载时重复创建定时器
- **并发控制**: 使用 `__checkCxPollerRunning` 标志位防止多个检测任务重叠执行

### 配置管理

配置已从环境变量迁移到 Supabase 数据库的 `check_configs` 表:

- **配置加载**: `lib/database/config-loader.ts:loadProviderConfigsFromDB()` 从数据库读取已启用的配置
- **表结构**: 包含 `id`(UUID)、`name`、`type`、`model`、`endpoint`、`api_key`、`enabled`、`request_header`、`metadata` 字段
- **动态启用/禁用**: 通过更新数据库 `enabled` 字段即可控制检测任务,无需重启应用
- **自定义请求头**: 通过配置 `request_header` 字段自定义多个请求头（JSON 格式）,可绕过特定的 API 请求限制
- **自定义请求参数**: 通过配置 `metadata` 字段（JSONB）自定义请求体参数,会合并到 API 请求中
- **类型安全**: 使用 `lib/types/database.ts` 中定义的 `CheckConfigRow` 类型

### 健康检查流程

1. **Provider 检查**: `lib/providers/index.ts:runProviderChecks()` 并发执行所有启用配置的检查
2. **流式响应**: 所有 provider 使用流式 API (`stream: true`),接收到首个响应块即视为成功
3. **通用逻辑**: `lib/providers/stream-check.ts:runStreamCheck()` 提供流式检查的通用实现
4. **状态判定**:
   - `operational`: 请求成功且延迟 ≤ 6000ms
   - `degraded`: 请求成功但延迟 > 6000ms
   - `failed`: 请求失败或超时(默认超时 15 秒)
5. **三类 Provider**:
   - **OpenAI** (`lib/providers/openai.ts`): POST `/v1/chat/completions` 带 `stream: true`
   - **Gemini** (`lib/providers/gemini.ts`): POST `/models/{model}:streamGenerateContent` 带 API key 查询参数
   - **Anthropic** (`lib/providers/anthropic.ts`): POST `/v1/messages` 带 `stream: true` 和 `anthropic-version` 头

### 数据存储与历史

- **写入**: `lib/database/history.ts:appendHistory()` 将检测结果写入 Supabase `check_history` 表
- **清理策略**: 每个配置最多保留 60 条历史记录,自动删除更旧的数据
- **查询窗口**: 前端仅展示最近 1 小时内的历史数据
- **数据结构**: 使用 `config_id` 外键关联 `check_configs` 表,存储 `status`、`latency_ms`、`checked_at`、`message` 字段
- **类型安全**: 使用 `lib/types/database.ts` 中定义的 `CheckHistoryRow` 类型

### Dashboard 数据流

1. **页面渲染**: `app/page.tsx` 使用 `loadDashboardData({ refreshMode: "missing" })` 加载初始数据
2. **刷新模式**:
   - `missing`: 仅当数据库中无历史记录时触发一次实时检测
   - `always`: 强制触发实时检测(用于 `/api/dashboard` 路由)
   - `never`: 仅从数据库读取历史记录
3. **缓存机制**: `lib/core/dashboard-data.ts` 使用全局缓存,避免在轮询间隔内重复检测
4. **前端轮询**: `components/dashboard-view.tsx` 使用客户端定时器定期调用 `/api/dashboard` 获取最新数据
5. **倒计时**: 组件根据 `pollIntervalMs` 和最新检测时间戳计算下次刷新倒计时

### Supabase 集成

- **客户端**: `lib/supabase/client.ts` 提供浏览器端客户端
- **服务端**: `lib/supabase/server.ts` 提供服务器端客户端(支持 SSR 和 cookies)
- **中间件**: `lib/supabase/middleware.ts` 处理会话刷新
- **环境变量**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase 项目 URL
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`: 公开/匿名 key

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
  request_header JSONB,  -- 自定义请求头，如 {"User-Agent": "xxx"}
  metadata JSONB        -- 自定义请求参数,JSON 格式,会合并到请求体中
)

-- 历史记录表
check_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES check_configs(id),
  status TEXT NOT NULL,  -- 'operational' | 'degraded' | 'failed'
  latency_ms INTEGER,
  checked_at TIMESTAMPTZ DEFAULT now(),
  message TEXT
)
```

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

1. **流式响应**: 所有 provider 使用流式 API,只需接收到首个 chunk 即可判定可用性
2. **Token 限制**: 所有请求设置 `max_tokens: 1`,最小化响应数据量
3. **缓存控制**: Dashboard 数据使用基于轮询间隔的缓存,避免重复检测
4. **并发检查**: 所有 provider 使用 `Promise.all` 并发执行
5. **数据限制**: 每个配置最多保留 60 条历史记录

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
