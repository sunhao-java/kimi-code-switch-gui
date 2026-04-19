export type ProviderType = "kimi" | "openai" | "anthropic" | "azure" | "custom";

export type Locale = "zh-CN" | "en-US";
export type AppearanceMode = "auto" | "dark" | "light";
export type DisplayOpenMode = "random" | "remember-last" | "active-display";
export type CloseBehavior = "quit" | "keep-in-tray";
export type TrayCommand = "reload";

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
  last_display_id?: number;
}

export interface AppState {
  configPath: string;
  profilesPath: string;
  panelSettingsPath: string;
  mainConfig: MainConfig;
  profiles: Record<string, Profile>;
  activeProfile: string;
  panelSettings: PanelSettings;
}

export interface PreviewBundle {
  configDocument: string;
  profilesDocument: string;
  panelSettingsDocument: string;
  configDiff: string;
  profilesDiff: string;
  panelDiff: string;
}

export interface FileDialogResult {
  canceled: boolean;
  filePath?: string;
}
