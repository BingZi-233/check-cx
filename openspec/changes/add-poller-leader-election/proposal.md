# Change: 多节点轮询单主与主备切换

## Why

多节点部署下，每个节点都在执行轮询会导致重复请求、速率限制压力和历史数据噪声。我们需要保证任意时刻只有一个节点执行轮询，其余节点仅负责展示与读取数据。

## What Changes

- 引入主节点选举与租约续租机制，确保单主轮询
- 通过环境变量提供节点身份，便于部署与排查
- 租约时长与续租频率使用固定默认值（不暴露配置）
- 主节点失效时自动切换到备节点，保持轮询连续性

## Impact

- Affected specs: 无现有 spec（新增 poller-leadership spec）
- Affected code: `lib/core/poller.ts`、`lib/core/state.ts`、`lib/database/*`、`lib/utils/*`
