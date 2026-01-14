# Design: 轮询主备选主与租约

## Goal

保证多节点部署时，任意时刻只有一个节点执行轮询请求；其余节点只展示数据，并能在主节点失效后快速接管。

## Data Structure

使用单行租约记录作为全局主节点标识：
- `leader_id`: 当前主节点的唯一标识（来自环境变量 `CHECK_NODE_ID`）
- `lease_expires_at`: 租约过期时间

优先使用数据库中的单行记录（可通过 Supabase/Postgres 更新条件完成 CAS）。

## Election Algorithm

1. 节点启动后立即尝试获取租约：仅当 `lease_expires_at < now` 时才能写入自己为 leader。
2. 先成功获取租约的节点成为 leader（谁先启动并抢到租约，谁就是主）。
3. 成为 leader 后按固定频率续租（固定默认值：租约 120 秒、续租间隔 30 秒）。
4. 若续租失败或租约过期，立即停止轮询并退回 standby。

## Backward Compatibility

单节点部署下应保持原有行为：节点自动成为 leader 并执行轮询，不引入额外分支或配置要求。
