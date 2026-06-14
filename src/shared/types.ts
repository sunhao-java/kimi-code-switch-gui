export type Locale = "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "de-DE" | "es-ES";
export type LocalizedText = Partial<Record<Locale, string>> & Record<"en-US", string>;
export type AppearanceMode = "auto" | "dark" | "light";
export type ConfigTarget = "kimi-code";
export type KimiTargetDetectionStatus = "detected" | "not-installed";
export type KimiCodeInstallSource = "homebrew" | "official-script" | "npm" | "pnpm" | "unknown";
export type ModelAuthMode = "api-key" | "official-account";
export type OfficialAccountStatus = "empty" | "logged-in" | "invalid";
export type AppearanceTheme = "aurora" | "ocean" | "violet" | "sunset" | "forest" | "sakura" | "mint" | "cosmos" | "amber";
export type UiFontSize = "mini" | "compact" | "small" | "standard" | "large" | "extra-large";
export type DisplayOpenMode = "random" | "remember-last" | "active-display";
export type CloseBehavior = "quit" | "keep-in-tray";
export type TerminalApp = "system-terminal" | "iterm2";
export type TrayCommand = "reload";
export type McpTransport = "sse" | "stdio" | "streamable-http";
export type BackupFrequency = "hourly" | "daily" | "weekly";
export type BackupDestinationType = "local" | "webdav";
export type BackupStrategy = "manual" | "scheduled" | "on-change";
export type ShortcutScope = "global" | "window";
export type ShortcutAction =
  | "window.toggle"
  | "profile.next"
  | "profile.previous"
  | "app.reloadConfig"
  | "app.save"
  | "app.globalSearch"
  | "app.refresh"
  | "tab.overview"
  | "tab.profiles"
  | "tab.providers"
  | "tab.models"
  | "tab.mcp"
  | "tab.skills"
  | "tab.insights"
  | "tab.settings";

export interface ProviderConfig {
  type: string;
  base_url: string;
  api_key: string;
}

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok?: number;
  cache_creation_per_mtok?: number;
}

/**
 * 成本展示币种。定价始终以 USD 存储，展示时按用户设定汇率换算（显示层转换，
 * 不改 ModelPricing schema，零迁移风险）。
 */
export type DisplayCurrency = "USD" | "CNY" | "EUR";

export interface ModelConfig {
  provider: string;
  model: string;
  max_context_size: number;
  capabilities: string[];
  auth_mode?: ModelAuthMode;
  official_account_scope?: "global";
  pricing?: ModelPricing;
}

export interface OfficialAccount {
  id: string;
  display_name: string;
  account_hint: string;
  status: OfficialAccountStatus;
  is_active: boolean;
  credentials_slot_path: string;
  last_login_at: string;
  last_checked_at: string;
  last_used_at: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface OfficialAccountCredentialsStatus {
  active_account_id: string;
  credentials_present: boolean;
  standard_credentials_path: string;
}

export interface OfficialAccountOperationResult {
  account: OfficialAccount;
  active_account_id: string;
  credentials_present: boolean;
}

export interface MainConfig {
  profile_label?: string;
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

export interface ShortcutBinding {
  action: ShortcutAction;
  accelerator: string;
  enabled: boolean;
  scope: ShortcutScope;
}

export interface PanelSettings {
  version: number;
  config_target?: ConfigTarget;
  config_path: string;
  profiles: Record<string, Profile>;
  active_profile: string;
  /** @deprecated Profiles are stored in SQLite panel settings. Kept only for legacy imports. */
  profiles_path: string;
  /** @deprecated Profiles are stored in SQLite panel settings. Kept only for legacy imports. */
  follow_config_profiles: boolean;
  theme: AppearanceMode;
  appearance_theme: AppearanceTheme;
  ui_font_size: UiFontSize;
  locale: Locale;
  tray_icon: boolean;
  sidebar_collapsed: boolean;
  display_open_mode: DisplayOpenMode;
  close_behavior: CloseBehavior;
  terminal_app: TerminalApp;
  backup_strategy: BackupStrategy;
  backup_frequency: BackupFrequency;
  backup_retention_count: number;
  backup_destination_type: BackupDestinationType;
  backup_local_path: string;
  backup_webdav_url: string;
  backup_webdav_username: string;
  backup_webdav_password: string;
  backup_webdav_path: string;
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  mcp_servers: Record<string, McpServerConfig>;
  last_display_id?: number;
  uiState?: {
    activeTab?: string;
    providerSortBy?: string;
    profileSortBy?: string;
  };
  favorites?: {
    providers?: string[];
    profiles?: string[];
  };
  active_official_account_id?: string;
  insights_status?: import("./usageTypes").InsightsStatus;
  insights_proxy_port?: number | "auto";
  insights_retention_days?: number;
  insights_disk_warn_threshold_mb?: number;
  insights_store_prompt_preview?: boolean;
  insights_onboarding_shown_at?: string;
  insights_last_known_port?: number | null;
  insights_display_currency?: DisplayCurrency;
  insights_currency_rates?: Partial<Record<DisplayCurrency, number>>;
}

export interface AppState {
  configTarget?: ConfigTarget;
  kimiTargetDetection?: {
    target: ConfigTarget;
    installed: boolean;
    status: KimiTargetDetectionStatus;
    version: string;
    executablePath: string;
    resolvedPath: string;
    candidates: string[];
    reason: string;
    installSource: KimiCodeInstallSource;
  };
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

export interface OpenKimiTerminalRequest {
  settings: PanelSettings;
  state?: AppState;
  profileName?: string;
}

export interface ProfileConnectivityTestResult {
  ok: true;
  stdout: string;
  stderr: string;
  profileName: string;
  modelName: string;
  providerName: string;
  providerType: string;
  prompt: string;
  endpoint: string;
  firstTokenMs: number;
  totalMs: number;
  status: number;
}

export interface ProfileDiffEntry {
  field: keyof Profile;
  leftValue: unknown;
  rightValue: unknown;
  isSame: boolean;
}

export interface ProfileDiff {
  left: Profile;
  right: Profile;
  differences: ProfileDiffEntry[];
}

export interface PreviewBundle {
  configDocument: string;
  panelSettingsDocument: string;
  mcpDocument: string;
  configDiff: string;
  panelDiff: string;
  mcpDiff: string;
}

export type ManagedFileId = "config" | "panel" | "mcp";

export interface FileFingerprint {
  id: ManagedFileId;
  path: string;
  exists: boolean;
  size: number;
  mtimeMs: number;
  sha256: string;
}

export interface FileSnapshotBundle {
  capturedAt: string;
  files: Record<ManagedFileId, FileFingerprint>;
}

export interface RedactionSummary {
  maskedCount: number;
  maskedPaths: string[];
}

export interface RedactedPreviewBundle extends PreviewBundle {
  redaction: RedactionSummary;
}

export type DoctorSeverity = "error" | "warning" | "info";

export interface DoctorIssue {
  id: string;
  severity: DoctorSeverity;
  scope: ManagedFileId | "state" | "backup" | "shortcuts" | "webdav";
  message: string;
  fieldPath?: string;
  suggestedAction?: string;
}

export interface ConfigDriftEntry {
  file: ManagedFileId;
  path: string;
  key: string;
}

export interface ConfigDoctorReport {
  ok: boolean;
  generatedAt: string;
  issues: DoctorIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  drift?: ConfigDriftEntry[];
}

export interface ExternalChangeDetail {
  id: ManagedFileId;
  path: string;
  reason: "created" | "deleted" | "modified";
  expected: FileFingerprint;
  actual: FileFingerprint;
  diskDocument: string;
  draftDocument: string;
  diff: string;
}

export interface ExternalChangeConflict {
  changedFiles: ExternalChangeDetail[];
}

export interface SaveStateResult {
  ok: true;
  snapshot: FileSnapshotBundle;
  doctor: ConfigDoctorReport;
}

export interface SaveStateConflictResult {
  ok: false;
  reason: "external-change";
  snapshot: FileSnapshotBundle;
  doctor: ConfigDoctorReport;
  conflict: ExternalChangeConflict;
}

export interface ExternalChangeNotifyPayload {
  changedFileIds: ManagedFileId[];
  changedFileNames: string[];
}

export interface RestoreDryRunFilePlan {
  id: ManagedFileId;
  path: string;
  action: "create" | "replace" | "unchanged";
  currentDocument: string;
  nextDocument: string;
  diff: string;
}

export interface RestoreDryRunResult {
  backupName: string;
  doctor: ConfigDoctorReport;
  filePlans: RestoreDryRunFilePlan[];
  warnings: string[];
}

export interface RestoreBackupResult {
  ok: true;
  state: AppState;
  snapshot: FileSnapshotBundle;
  doctor: ConfigDoctorReport;
  rollbackBackupName: string;
}

export interface BackupMetadata {
  name: string;
  createdAt: string;
  trigger: "manual" | "scheduled" | "on-change" | "pre-restore" | "rollback";
  sourceHost: string;
  paths: Record<ManagedFileId, string>;
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

export type ImportConflictStrategy = "skip" | "overwrite" | "rename";

export interface ImportConflict {
  name: string;
  type: "provider" | "model" | "profile" | "mcp_server";
  existing: boolean;
}

export interface ImportPreview {
  conflicts: ImportConflict[];
  newItems: ImportConflict[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ExportBundle {
  version: number;
  exportedAt: string;
  source: string;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelConfig>;
  profiles: Record<string, Profile>;
  mcpServers: Record<string, McpServerConfig>;
  panelSettings?: PanelSettings; // 可选：面板设置（字体、主题等）
}
