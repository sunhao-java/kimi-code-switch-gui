-- MCP 服务器配置表（结构化存储）
-- 每个 MCP 服务器一行，支持启用/禁用状态管理
CREATE TABLE IF NOT EXISTS mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 服务器标识
  kimi_code_environment_id TEXT NOT NULL DEFAULT 'default',
  server_name TEXT NOT NULL,  -- 服务器名称（环境内唯一键）

  -- 状态管理
  enabled INTEGER NOT NULL DEFAULT 1,  -- 是否启用（0=禁用，1=启用）

  -- 基础配置
  transport TEXT NOT NULL,  -- 'sse' | 'stdio' | 'streamable-http'
  url TEXT NOT NULL DEFAULT '',
  command TEXT NOT NULL DEFAULT '',

  -- JSON 列（数组和对象）
  args TEXT NOT NULL DEFAULT '[]',           -- string[] 参数列表
  headers TEXT NOT NULL DEFAULT '{}',        -- Record<string, string> HTTP 头
  env TEXT NOT NULL DEFAULT '{}',            -- Record<string, string> 环境变量
  extra TEXT,                                 -- Record<string, unknown> 额外配置

  -- 元数据
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- 约束
  CHECK (enabled IN (0, 1)),
  CHECK (transport IN ('sse', 'stdio', 'streamable-http')),
  UNIQUE(kimi_code_environment_id, server_name)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_mcp_servers_environment_enabled ON mcp_servers(kimi_code_environment_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_environment_name ON mcp_servers(kimi_code_environment_id, server_name);
