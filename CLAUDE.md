# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

Check CX 是基于 Next.js App Router 和 Supabase 的 AI 模型 API 健康监控面板，负责健康检查执行、状态展示和只读 API 输出；后台管理端在独立项目中维护模型、配置、分组和通知数据。

## 常用命令

- `pnpm install`：同步依赖，`pnpm-lock.yaml` 变化后必须重新运行。
- `pnpm dev`：启动本地开发服务器，读取 `.env.local`。
- `pnpm lint`：运行 ESLint；提交前必须通过。
- `pnpm build`：生产构建；发布或验证部署前运行。
- `pnpm start`：本地运行生产构建。
- `./deploy.sh` 或 `docker-compose up -d`：容器部署。

## 环境与部署

- 本地配置从 `.env.example` 复制到 `.env.local`。
- 必需变量：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_OR_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。
- 常用可选变量：`SUPABASE_DB_SCHEMA`、`CHECK_NODE_ID`、`CHECK_POLL_INTERVAL_SECONDS`、`CHECK_CONCURRENCY`、`OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS`、`HISTORY_RETENTION_DAYS`。
- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用，绝不能暴露给客户端或提交到仓库。
- Provider 密钥属于数据库中的 `check_configs`，不要改成前端环境变量或明文配置。
- `next.config.ts` 默认启用 `output: "standalone"`；设置 `NEXT_DISABLE_STANDALONE=1` 会关闭 standalone 输出。

## 代码约定

- 默认使用 Server Components；只有需要 hooks 或浏览器 API 时才添加 `"use client"`。
- TypeScript 使用 2 空格缩进，优先 `const`，组件使用 PascalCase。
- 导入顺序：Node 内置模块 → 第三方包 → `@/` 别名路径。
- UI 组件基于 shadcn；涉及 shadcn/ui 或 `components/ui/` 的工作优先使用 `shadcn` skill。
- Tailwind className 合并使用项目的 `cn` 工具，不要手写新的合并函数。
- 数据库 schema 或 seed 变更放在 `supabase/migrations/`，不要只改运行中的数据库。

## 验证要求

- 代码变更后至少运行 `pnpm lint`。
- 影响生产构建、路由、服务端代码或依赖时运行 `pnpm build`。
- UI 或前端行为变更必须启动应用并在浏览器中手动验证，不要只靠 lint/build 宣称完成。
- 当前没有自动化测试脚本；新增复杂业务逻辑时，要么补测试 runner，要么在 PR 中写清楚手动验证步骤。

## 安全边界

- 不要提交真实 API key、Supabase service role key、`.env.local` 或含密日志。
- 共享日志前先清理 endpoint、token、provider key 和 Supabase 凭据。
- 读取或修改配置时保持 `check_models`、`check_configs`、`check_request_templates` 的关系一致。
