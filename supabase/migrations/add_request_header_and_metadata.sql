-- 迁移脚本：将 user_agent 重命名为 request_header 并改为 JSONB 类型，添加 metadata 列
-- 执行前请确保已备份数据
-- 针对 dev schema

-- 1. 重命名 user_agent 为 request_header
ALTER TABLE dev.check_configs RENAME COLUMN user_agent TO request_header;

-- 2. 将 request_header 转换为 JSONB 类型
-- 先将现有数据转为 JSON 格式，然后更改列类型
UPDATE dev.check_configs
SET request_header = NULL
WHERE request_header IS NOT NULL AND request_header != '';

ALTER TABLE dev.check_configs
ALTER COLUMN request_header TYPE JSONB USING request_header::jsonb;

-- 3. 添加 metadata 列 (JSONB 类型，默认为 NULL)
ALTER TABLE dev.check_configs ADD COLUMN metadata JSONB DEFAULT NULL;

-- 添加注释说明字段用途
COMMENT ON COLUMN dev.check_configs.request_header IS '自定义请求头，JSONB 格式，如 {"User-Agent": "xxx"}';
COMMENT ON COLUMN dev.check_configs.metadata IS '自定义请求参数，JSONB 格式，会合并到请求体中';
