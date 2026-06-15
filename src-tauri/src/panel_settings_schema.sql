-- 面板设置表（结构化存储）
-- 每个配置项独立列，复杂对象使用 JSON 列
CREATE TABLE IF NOT EXISTS panel_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,

  -- 路径配置
  config_target TEXT NOT NULL DEFAULT 'kimi-code',
  config_path TEXT NOT NULL,
  profiles TEXT NOT NULL DEFAULT '{}', -- Record<string, Profile>
  active_profile TEXT NOT NULL DEFAULT 'default',
  profiles_path TEXT NOT NULL,
  follow_config_profiles INTEGER NOT NULL DEFAULT 1, -- boolean

  -- 外观设置
  theme TEXT NOT NULL DEFAULT 'auto', -- 'light' | 'dark' | 'auto'
  appearance_theme TEXT NOT NULL DEFAULT 'cupertino', -- 'cupertino' | 'material'
  ui_font_size TEXT NOT NULL DEFAULT 'medium', -- 'small' | 'medium' | 'large'
  locale TEXT NOT NULL DEFAULT 'en-US', -- 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'de-DE' | 'es-ES'

  -- UI 状态
  tray_icon INTEGER NOT NULL DEFAULT 0,
  sidebar_collapsed INTEGER NOT NULL DEFAULT 0,
  display_open_mode TEXT NOT NULL DEFAULT 'normal',
  close_behavior TEXT NOT NULL DEFAULT 'minimize',
  terminal_app TEXT NOT NULL DEFAULT 'auto',
  last_display_id INTEGER,

  -- UI 状态对象（JSON）
  ui_state TEXT, -- {activeTab?, providerSortBy?, profileSortBy?}
  favorites TEXT, -- {providers?: string[], profiles?: string[]}
  active_official_account_id TEXT NOT NULL DEFAULT '',

  -- 备份配置
  backup_strategy TEXT NOT NULL DEFAULT 'manual',
  backup_frequency TEXT NOT NULL DEFAULT 'daily',
  backup_retention_count INTEGER NOT NULL DEFAULT 7,
  backup_destination_type TEXT NOT NULL DEFAULT 'local',
  backup_local_path TEXT NOT NULL,
  backup_webdav_url TEXT NOT NULL DEFAULT '',
  backup_webdav_username TEXT NOT NULL DEFAULT '',
  backup_webdav_password TEXT NOT NULL DEFAULT '',
  backup_webdav_path TEXT NOT NULL DEFAULT '/kimi-backups',

  -- 快捷键（JSON）
  shortcuts TEXT NOT NULL, -- Record<ShortcutAction, ShortcutBinding>

  -- MCP 服务器（JSON）
  mcp_servers TEXT NOT NULL, -- Record<string, McpServerConfig>

  -- Kimi Code 环境（JSON）
  kimi_code_environments TEXT, -- KimiCodeEnvironment[]
  active_kimi_code_environment_id TEXT NOT NULL DEFAULT 'default',

  -- 洞察配置
  insights_status TEXT NOT NULL DEFAULT 'disabled',
  insights_proxy_port TEXT, -- number | "auto" | null
  insights_retention_days INTEGER NOT NULL DEFAULT 30,
  insights_disk_warn_threshold_mb INTEGER NOT NULL DEFAULT 500,
  insights_store_prompt_preview INTEGER NOT NULL DEFAULT 1,
  insights_onboarding_shown_at TEXT,
  insights_last_known_port INTEGER,
  insights_display_currency TEXT NOT NULL DEFAULT 'USD',
  insights_currency_rates TEXT, -- Partial<Record<DisplayCurrency, number>>

  -- 元数据
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
