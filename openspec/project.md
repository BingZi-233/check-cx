# Project Context

## Purpose

Check CX 是一个 AI 模型健康监控面板，用于实时监控 OpenAI、Gemini、Anthropic 等 AI 模型的 API 可用性、延迟和错误信息。

核心功能：
- 后台轮询检测多个 AI Provider 的 API 健康状态
- 实时展示延迟、状态和历史时间线
- 支持动态配置管理（通过数据库启用/禁用检测任务）
- 自定义请求头和请求参数

## Tech Stack

- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript
- **数据库**: Supabase (PostgreSQL)
- **样式**: Tailwind CSS
- **包管理**: pnpm
- **部署**: Docker

## Project Conventions

### Code Style

- **模块职责**: 每个模块专注单一功能，文件不超过 200 行
- **类型导出**: 所有类型从 `lib/types/index.ts` 统一导出
- **命名规范**:
  - 文件名使用 kebab-case（如 `dashboard-data.ts`）
  - 函数名使用 camelCase（如 `runProviderChecks`）
  - 类型名使用 PascalCase（如 `CheckResult`）
- **错误处理**: 使用 `lib/utils/error-handler.ts` 的 `logError()` 统一记录错误
- **className 合并**: 使用 `lib/utils/cn.ts` 处理 Tailwind className

### Architecture Patterns

项目采用分层架构：

```
lib/
├── types/          # 统一类型定义
├── providers/      # Provider 检查逻辑（OpenAI、Gemini、Anthropic）
├── database/       # 数据库操作（配置加载、历史记录）
├── utils/          # 工具函数
├── core/           # 核心模块（轮询器、全局状态、Dashboard 数据）
└── supabase/       # Supabase 客户端
```

**数据流向**:
- **后台 → 数据库**: `poller.ts` → `providers/` → `history.ts` → Supabase
- **数据库 → 前端**: Supabase → `dashboard-data.ts` → `page.tsx` → `dashboard-view.tsx`

**关键模式**:
- 后台轮询系统在应用启动时自动初始化
- 使用全局状态防止 Next.js 热重载时重复创建定时器
- 所有 Provider 使用流式 API，接收首个响应块即判定成功
- Dashboard 数据使用基于轮询间隔的缓存

### Testing Strategy

目前项目未配置自动化测试。手动验证流程：
1. 本地运行 `pnpm dev` 验证功能
2. 检查服务器日志确认轮询正常执行
3. 验证 Dashboard 数据刷新正常

### Git Workflow

- **主分支**: `master`
- **提交信息**: 中文描述，格式如 `chore: 移除配置` / `fix: 修复问题` / `feat: 添加功能`
- **提交前**: 运行 `pnpm lint` 检查代码

## Domain Context

### 状态判定规则

- `operational`: 请求成功且延迟 ≤ 6000ms
- `degraded`: 请求成功但延迟 > 6000ms
- `failed`: 请求失败或超时（默认超时 15 秒）

### Provider 类型

| 类型 | API 端点格式 | 认证方式 |
|------|-------------|---------|
| openai | `/v1/chat/completions` | Bearer Token |
| gemini | `/models/{model}:streamGenerateContent` | API Key 查询参数 |
| anthropic | `/v1/messages` | `x-api-key` + `anthropic-version` 头 |

### 轮询配置

- 默认间隔: 60 秒
- 支持范围: 15-600 秒
- 环境变量: `CHECK_POLL_INTERVAL_SECONDS`

## Important Constraints

- **数据保留**: 每个配置最多保留 60 条历史记录
- **查询窗口**: 前端仅展示最近 1 小时内的数据
- **请求限制**: 所有请求设置 `max_tokens: 1` 最小化响应
- **超时控制**: 所有网络请求 15 秒超时
- **并发控制**: 使用标志位防止多个检测任务重叠执行

## External Dependencies

### Supabase

数据库服务，存储配置和历史记录：

**环境变量**:
- `SUPABASE_URL`: Supabase 项目 URL
- `SUPABASE_PUBLISHABLE_OR_ANON_KEY`: 公开/匿名 key

**表结构**:
- `check_configs`: 存储 Provider 配置
- `check_history`: 存储检测历史记录

### AI Provider APIs

- OpenAI API (`api.openai.com`)
- Google Gemini API (`generativelanguage.googleapis.com`)
- Anthropic API (`api.anthropic.com`)
- 支持自定义第三方代理端点
