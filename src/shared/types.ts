export type ProviderType =
  | "kimi"
  | "openai_legacy"
  | "openai_responses"
  | "anthropic"
  | "gemini"
  | "vertexai";

export type Locale = "zh-CN" | "en-US";
export type AppearanceMode = "auto" | "dark" | "light";
export type DisplayOpenMode = "random" | "remember-last" | "active-display";
export type CloseBehavior = "quit" | "keep-in-tray";
export type TrayCommand = "reload";
export type McpTransport = "sse" | "stdio" | "streamable-http";
export type BackupFrequency = "hourly" | "daily" | "weekly";
export type BackupDestinationType = "local" | "webdav";
export type BackupStrategy = "manual" | "scheduled" | "on-change";

export interface ProviderConfig {
  type: string;
  base_url: string;
  api_key: string;
}

export interface ModelConfig {
  provider: string;
  model: string;
  max_context_size: number;
  capabilities: string[];
}

export interface MainConfig {
  default_model: string;
  default_thinking: boolean;
  default_yolo: boolean;
  default_plan_mode: boolean;
  default_editor: string;
  theme: string;
  show_thinking_stream: boolean;
  merge_all_available_skills: boolean;
  hooks: Array<Record<string, unknown>>;
  models: Record<string, ModelConfig>;
  providers: Record<string, ProviderConfig>;
  loop_control: Record<string, unknown>;
  background: Record<string, unknown>;
  notifications: Record<string, unknown>;
  services: Record<string, unknown>;
  mcp: Record<string, unknown>;
}

export interface Profile {
  name: string;
  label: string;
  default_model: string;
  default_thinking: boolean;
  default_yolo: boolean;
  default_plan_mode: boolean;
  default_editor: string;
  theme: string;
  show_thinking_stream: boolean;
  merge_all_available_skills: boolean;
}

export interface McpServerConfig {
  enabled: boolean;
  transport: McpTransport;
  url: string;
  headers: Record<string, string>;
  command: string;
  args: string[];
  env: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface PanelSettings {
  version: number;
  config_path: string;
  profiles_path: string;
  follow_config_profiles: boolean;
  theme: AppearanceMode;
  locale: Locale;
  tray_icon: boolean;
  display_open_mode: DisplayOpenMode;
  close_behavior: CloseBehavior;
  backup_strategy: BackupStrategy;
  backup_frequency: BackupFrequency;
  backup_retention_count: number;
  backup_destination_type: BackupDestinationType;
  backup_local_path: string;
  backup_webdav_url: string;
  backup_webdav_username: string;
  backup_webdav_password: string;
  backup_webdav_path: string;
  mcp_servers: Record<string, McpServerConfig>;
  last_display_id?: number;
}

export interface AppState {
  configPath: string;
  profilesPath: string;
  panelSettingsPath: string;
  mcpConfigPath: string;
  mainConfig: MainConfig;
  profiles: Record<string, Profile>;
  activeProfile: string;
  panelSettings: PanelSettings;
  mcpConfig: McpConfig;
}

export interface PreviewBundle {
  configDocument: string;
  profilesDocument: string;
  panelSettingsDocument: string;
  mcpDocument: string;
  configDiff: string;
  profilesDiff: string;
  panelDiff: string;
  mcpDiff: string;
}

export interface FileDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface BackupResult {
  ok: true;
  backupPath: string;
  files: string[];
}

export interface BackupRecord {
  name: string;
  createdAt: string;
  path: string;
  itemCount?: number;
}
