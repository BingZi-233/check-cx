# Check CX 运维手册

本文面向运维 / SRE / Tech Lead，说明如何在不同环境下稳定运行 Check CX，并在常见故障场景中快速排查问题。

## 1. 运行环境与依赖

- Node.js：推荐 **≥ 20 LTS**
- 包管理：推荐 **pnpm ≥ 9**（也可按需改用 npm/yarn，但需同步更新脚本）
- 数据库：Supabase（PostgreSQL 后端）
- 前端运行时：Next.js 16 App Router

> 提示：仓库中提供的脚本使用 `pnpm`，如果团队统一使用 npm/yarn，请在 `package.json` 中调整对应脚本，并更新本手册。

## 2. 环境变量与配置

基础变量（详见 `README.md` 中的表格）：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`：Supabase 浏览器可用的 Key
- `CHECK_NODE_ID`（可选）：节点身份标识，多节点部署时用于标记主节点来源，默认 local
- `CHECK_POLL_INTERVAL_SECONDS`（可选）：Provider 检查间隔，默认 60 秒，支持 15–600
- `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS`（可选）：官方状态轮询间隔，默认 300 秒，支持 60–3600
- `HISTORY_RETENTION_DAYS`（可选）：历史数据保留天数，默认 30 天，支持 7–365

环境变量放置建议：

- 本地开发：`.env.local`
- 预发 / 生产：部署平台的环境变量面板（如 Vercel / Kubernetes Secret / CI 注入）

密钥与数据安全：

- Provider 的真实密钥仅存储在 Supabase 数据库表 `check_configs.api_key` 中。
- 环境变量中只保存访问 Supabase 的 publishable/anon key，不直接暴露任何模型密钥。

多节点部署说明：

- 只有主节点会执行后台检测与官方状态轮询
- 备节点只读取数据库并提供展示

## 3. 首次部署流程

以典型的「本地开发 → 预发环境 → 生产环境」为例：

1. **准备代码与依赖**
   - 克隆仓库：`git clone ...`
   - 安装依赖：`pnpm install`

2. **初始化 Supabase Schema**
   - 如果仓库包含 `supabase/migrations/`，按顺序在 Supabase 项目中执行迁移 SQL。
   - 如暂未提供迁移文件，可参考 `README.md` 中的建表示例，在 Supabase SQL Editor 中手动创建：
     - `check_configs`：配置表
     - `check_history`：历史记录表

3. **填充最小配置**
   - 在 `check_configs` 表中插入至少一条 `enabled = true` 的配置（可参考 README 示例 SQL）。
   - 验证该配置的 endpoint 与密钥在生产环境中可正常访问。

4. **配置环境变量**
   - 本地/预发/生产分别配置 `NEXT_PUBLIC_SUPABASE_URL` 与 Key。
   - 如需调整轮询频率，设置 `CHECK_POLL_INTERVAL_SECONDS` 与 `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS`。
   - 如需调整历史数据保留时长，设置 `HISTORY_RETENTION_DAYS`。

5. **启动服务并验证**
   - 本地开发：`pnpm dev`
   - 生产构建：`pnpm build && pnpm start`
   - 访问 `/` 确认：
     - 页面能加载出「模型对话健康面板」
     - 至少有一个 Provider 卡片出现
     - 时间线中逐渐出现新的检测点

## 4. 监控与日志

### 4.1 轮询器日志

后台轮询器核心日志位于 `lib/core/poller.ts` 中，通过 `console.log` 输出。在部署平台中可搜索：

- `[check-cx] 初始化后台轮询器，interval=...`
- `[check-cx] 节点角色切换：standby -> leader ...`
- `[check-cx] 后台 ping 开始 · ...`
- `[check-cx] 本轮检测明细：`
- `[check-cx] 历史记录更新完成：providers=...，总记录=...`

建议：

- 将平台日志采集到集中式系统（如 Datadog / Grafana Loki），按 `check-cx` 关键字建立 Dashboard。
- 对 `检查失败` / `写入数据库失败` / `轮询检测失败` 等错误日志配置告警规则。

### 4.2 官方状态轮询日志

官方状态轮询器日志位于 `lib/core/official-status-poller.ts`，关键前缀为：

- `[官方状态] 启动轮询器,间隔 ...`
- `[官方状态] openai: operational - ...`
- `[官方状态] anthrophic: degraded - ...`

若官方状态检查出现问题，会通过：

- `logError("runOfficialStatusCheck", error)`
- `console.error("[官方状态] 检查失败:", error)`

输出详细错误，便于排查网络或远程状态 API 异常。

## 5. 常见故障与排查步骤

### 5.1 页面没有任何 Provider 卡片

表现：

- 首屏提示「尚未找到任何检测配置，请在 Supabase 的 check_configs 表中添加至少一条 enabled = true 的配置」。

排查步骤：

1. 在 Supabase 控制台确认 `check_configs` 是否存在数据：
   - 至少一条 `enabled = true`
   - `type` 在 `openai | gemini | anthropic` 范围内
2. 在服务器日志中查找：
   - `[check-cx] 数据库中没有找到启用的配置`
3. 如果有配置但仍报错：
   - 检查 `NEXT_PUBLIC_SUPABASE_URL` / `KEY` 是否填错或对应的是其他项目。

### 5.2 一直显示「暂无检测记录」

表现：

- Provider 卡片已出现，但时间线区域显示「暂无检测记录」。

排查步骤：

1. 查看轮询器日志：
   - 是否出现 `[check-cx] 本轮检测明细：` 和历史写入日志？
2. 检查 `CHECK_POLL_INTERVAL_SECONDS` 是否设置得过大（例如 600 秒），导致长时间内无新数据。
3. 在 Supabase 的 `check_history` 表中查询是否有新行产生：
   - 若有写入但前端不显示，检查服务器时间与数据库时间是否存在严重偏差。

### 5.3 某个 Provider 一直处于 failed 状态

排查步骤：

1. 在日志中搜索该 Provider 名称，查看最近一轮检测的 `message` 字段（已截断为 200 字符）：
   - 常见错误：认证失败（401/403）、额度不足、模型名错误、网络超时。
2. 检查 `check_configs` 中对应行的：
   - `endpoint` 是否正确（特别是代理网关的路径后缀）
   - `model` 是否可用，是否需要附带 effort 指令（例如 `gpt-5.1-codex@high`）
3. 如果是 `请求超时`：
   - 可能是网络链路慢或 Provider 端故障，可结合官方状态面板确认。

### 5.4 官方状态一直为 unknown

原因可能包括：

- 远程状态页 API 无法访问（网络或 DNS 问题）。
- 未对某 Provider 实现官方状态检查（例如当前 Gemini 为占位实现）。

排查步骤：

1. 搜索日志前缀 `"[官方状态]"`，关注错误详情。
2. 在部署环境中直接 `curl` 对应状态页 URL（如 OpenAI 状态代理）检查连通性。
3. 如确认为网络策略问题（企业代理等），需要在出口策略中放行相关域名。

## 6. 多环境与变更管理

### 6.1 开发 / 预发 / 生产隔离

推荐为每个环境创建独立的 Supabase 项目，并使用不同的：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`

变更流程建议：

1. 在开发环境修改代码，提交 PR。
2. 在预发环境部署并验证：
   - 是否能成功执行迁移并保持历史数据。
   - 轮询器是否正常运行，日志中无异常。
3. 在生产环境滚动发布，并监控一段时间（例如 30 分钟）确认无异常后再关闭旧版本。

### 6.2 配置变更

对 `check_configs` 的增删改属于在线配置变更，注意：

- 配置是 **热更新** 的：轮询器每轮都会重新读取 `check_configs`。
- 如需下线某个 Provider，建议先将 `enabled` 设为 `false`，观察一段时间，再视情况清理历史记录。

## 7. 性能与资源占用建议

- 检查间隔：
  - 对公网 Provider：推荐 30–60 秒。
  - 对内部代理或对成本敏感场景：可以适当调大到 120–300 秒。
- 历史保留：
  - 默认保留 30 天历史数据（可通过 `HISTORY_RETENTION_DAYS` 调整）。
  - 如需更长的可视窗口，建议通过 BI/指标系统做二次聚合，而不是无限增加数据库明细。

## 8. 运维 checklist

上线或例行检查时，可按下列项目快速确认：

- [ ] Supabase 中 `check_configs` 至少有一条启用配置
- [ ] `check_history` 在最近 5 分钟内有新增记录
- [ ] 服务日志中定期出现 `[check-cx] 本轮检测明细` 与官方状态轮询日志
- [ ] 页面上各 Provider 卡片显示合理的延迟与状态
- [ ] 若有公司级监控系统，已对故障状态（持续 failed / 官方 down）设定告警

如需进一步了解系统内部结构，请参考 `docs/ARCHITECTURE.md`；若要扩展新的 Provider 或官方状态检查，请参考 `docs/EXTENDING_PROVIDERS.md`。
