-- 环境级配置存储（结构化存储）。
-- 每个 Kimi Code 环境一行，providers / models 各存为 JSON blob。
-- SQLite 为 Provider/Model 的唯一真源；config.toml 仅为启用项的投影。
CREATE TABLE IF NOT EXISTS env_config (
  kimi_code_environment_id TEXT PRIMARY KEY,
  providers TEXT NOT NULL DEFAULT '{}', -- Record<string, ProviderConfig>（含 enabled）
  models TEXT NOT NULL DEFAULT '{}',    -- Record<string, ModelConfig>（含 enabled）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
