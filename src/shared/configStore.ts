import parse from "@iarna/toml/parse-string.js";
import stringify from "@iarna/toml/stringify.js";

import { redactAppStateSecrets } from "./configSafety";
import { SUPPORTED_CURRENCIES } from "./currency";
import { buildMcpConfigDocument, DEFAULT_MCP_CONFIG_PATH, loadMcpConfig, parseMcpConfigStrict } from "./mcpStore";
import { createDefaultShortcuts, normalizeShortcuts } from "./shortcutStore";
import type {
  AppState,
  BackupDestinationType,
  BackupStrategy,
  DisplayCurrency,
  ExportBundle,
  ImportConflict,
  ImportConflictStrategy,
  ImportPreview,
  MainConfig,
  McpServerConfig,
  ModelConfig,
  PanelSettings,
  PreviewBundle,
  Profile,
  ProfileDiff,
  ValidationResult,
} from "./types";

export const PROFILE_VERSION = 1;
export const PANEL_SETTINGS_VERSION = 1;
export const PROFILE_FILENAME = "config.profiles.toml";
export const PANEL_SETTINGS_FILENAME = "config.panel.toml";
export const BACKUP_DIRECTORY_NAME = "backups";
export const DEFAULT_PROFILE_NAME = "default";
export const DEFAULT_CONFIG_PATH = "~/.kimi/config.toml";
export const DEFAULT_PANEL_DIRECTORY = "~/.kimi/.panel";
export const DEFAULT_PANEL_SETTINGS_PATH = `${DEFAULT_PANEL_DIRECTORY}/${PANEL_SETTINGS_FILENAME}`;
export const LEGACY_PANEL_SETTINGS_PATH = "~/.kimi/config.panel.toml";
export const PANEL_USAGE_DIRECTORY = `${DEFAULT_PANEL_DIRECTORY}/usage`;
export const PANEL_USAGE_DB_PATH = `${PANEL_USAGE_DIRECTORY}/index.db`;
export const LEGACY_USAGE_DIRECTORY = "~/.kimi/usage";
const SUPPORTED_LOCALES = new Set<PanelSettings["locale"]>(["zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE", "es-ES"]);

const PROFILE_KEYS: Array<keyof Profile> = [
  "default_model",
  "default_thinking",
  "default_yolo",
  "default_plan_mode",
  "default_editor",
  "theme",
  "show_thinking_stream",
  "merge_all_available_skills",
];

const DEFAULTS = {
  default_model: "",
  default_thinking: true,
  default_yolo: false,
  default_plan_mode: false,
  default_editor: "",
  theme: "dark",
  show_thinking_stream: false,
  merge_all_available_skills: false,
} as const;

export interface FileAccess {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
}

export function createDefaultPanelSettings(
  configPath = DEFAULT_CONFIG_PATH,
  _settingsPath = DEFAULT_PANEL_SETTINGS_PATH,
): PanelSettings {
  return {
    version: PANEL_SETTINGS_VERSION,
    config_path: configPath,
    profiles_path: "",
    follow_config_profiles: true,
    theme: "auto",
    appearance_theme: "aurora",
    ui_font_size: "standard",
    locale: "zh-CN",
    tray_icon: false,
    sidebar_collapsed: false,
    display_open_mode: "remember-last",
    close_behavior: "quit",
    terminal_app: "system-terminal",
    backup_strategy: "manual",
    backup_frequency: "daily",
    backup_retention_count: 10,
    backup_destination_type: "local",
    backup_local_path: defaultBackupPath(),
    backup_webdav_url: "",
    backup_webdav_username: "",
    backup_webdav_password: "",
    backup_webdav_path: "",
    shortcuts: createDefaultShortcuts(),
    mcp_servers: {},
    insights_status: "disabled",
    insights_proxy_port: "auto",
    insights_retention_days: 90,
    insights_disk_warn_threshold_mb: 100,
    insights_store_prompt_preview: false,
    insights_onboarding_shown_at: "",
    insights_last_known_port: null,
    insights_display_currency: "USD",
    insights_currency_rates: {},
  };
}

export function cloneState(state: AppState): AppState {
  return structuredClone(state) as AppState;
}

export async function loadAppState(
  files: FileAccess,
  paths?: {
    configPath?: string;
    profilesPath?: string;
    panelSettingsPath?: string;
    mcpConfigPath?: string;
  },
): Promise<AppState> {
  const panelSettingsPath = paths?.panelSettingsPath ?? DEFAULT_PANEL_SETTINGS_PATH;
  const mcpConfigPath = sanitizePath(paths?.mcpConfigPath, DEFAULT_MCP_CONFIG_PATH);
  const panelSettingsResult = await loadPanelSettingsWithLegacyFallback(files, panelSettingsPath);
  const panelSettings = panelSettingsResult.settings;
  if (panelSettingsResult.migratedFromLegacy) {
    await files.ensureDir(dirnamePath(DEFAULT_PANEL_SETTINGS_PATH));
    await files.writeText(DEFAULT_PANEL_SETTINGS_PATH, buildPanelSettingsDocument(panelSettings));
  }
  const configPath = sanitizePath(paths?.configPath, DEFAULT_CONFIG_PATH);
  const profilesPath = resolveProfilesPath({
    explicitProfilesPath: paths?.profilesPath,
    configPath,
  });
  const resolvedPanelSettingsPath = sanitizePath(
    panelSettingsPath,
    DEFAULT_PANEL_SETTINGS_PATH,
  );
  const mainConfig = normalizeMainConfig(await loadTomlFile(files, configPath, "main config"));
  const fileMcpConfig = await loadMcpConfig(files, mcpConfigPath);
  const mcpConfig = mergePanelMcpServers(panelSettings.mcp_servers, fileMcpConfig.mcpServers);
  const rawProfiles = await loadTomlFile(files, profilesPath, "profiles config");
  const profiles = parseProfiles(mainConfig, rawProfiles);
  const activeProfile = ensureActiveProfile(
    typeof rawProfiles.active_profile === "string"
      ? rawProfiles.active_profile
      : pickActiveProfile(mainConfig, profiles),
    profiles,
  );

  return {
    configPath,
    profilesPath,
    panelSettingsPath: resolvedPanelSettingsPath,
    mcpConfigPath,
    mainConfig,
    profiles,
    activeProfile,
    panelSettings: {
      ...panelSettings,
      config_path: configPath,
      profiles_path: "",
      follow_config_profiles: true,
      mcp_servers: cloneMcpServers(mcpConfig.mcpServers),
    },
    mcpConfig,
  };
}

export async function loadPanelSettings(
  files: FileAccess,
  panelSettingsPath: string,
): Promise<PanelSettings> {
  const fallback = createDefaultPanelSettings(DEFAULT_CONFIG_PATH, panelSettingsPath);
  const data = await loadTomlFile(files, panelSettingsPath, "panel settings");
  return panelSettingsFromUnknown(data, fallback);
}

async function loadPanelSettingsWithLegacyFallback(
  files: FileAccess,
  panelSettingsPath: string,
): Promise<{ settings: PanelSettings; migratedFromLegacy: boolean }> {
  if (panelSettingsPath !== DEFAULT_PANEL_SETTINGS_PATH) {
    return {
      settings: await loadPanelSettings(files, panelSettingsPath),
      migratedFromLegacy: false,
    };
  }

  let primaryDocument: string | null;
  try {
    primaryDocument = await files.readText(panelSettingsPath);
  } catch (error) {
    throw new Error(`Failed to read panel settings at ${panelSettingsPath}: ${formatErrorMessage(error)}`);
  }
  if (primaryDocument?.trim()) {
    try {
      return {
        settings: panelSettingsFromUnknown(
          parseDocument(primaryDocument),
          createDefaultPanelSettings(DEFAULT_CONFIG_PATH, panelSettingsPath),
        ),
        migratedFromLegacy: false,
      };
    } catch (error) {
      throw new Error(`Invalid panel settings TOML at ${panelSettingsPath}: ${formatErrorMessage(error)}`);
    }
  }

  const legacyData = await loadTomlFile(files, LEGACY_PANEL_SETTINGS_PATH, "legacy panel settings");
  if (!Object.keys(legacyData).length) {
    return {
      settings: createDefaultPanelSettings(DEFAULT_CONFIG_PATH, panelSettingsPath),
      migratedFromLegacy: false,
    };
  }
  return {
    settings: panelSettingsFromUnknown(legacyData, createDefaultPanelSettings(DEFAULT_CONFIG_PATH, panelSettingsPath)),
    migratedFromLegacy: true,
  };
}

export function parsePanelSettingsDocument(document: string, fallback = createDefaultPanelSettings()): PanelSettings {
  return panelSettingsFromUnknown(parseDocument(document), fallback);
}

function sanitizeCurrencyRates(
  raw: unknown,
  fallback: Partial<Record<DisplayCurrency, number>> | undefined,
): Partial<Record<DisplayCurrency, number>> {
  if (typeof raw !== "object" || raw === null) {
    return fallback ?? {};
  }
  const source = raw as Record<string, unknown>;
  const out: Partial<Record<DisplayCurrency, number>> = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    const v = source[currency];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[currency] = v;
    }
  }
  return out;
}

function panelSettingsFromUnknown(data: Record<string, unknown>, fallback: PanelSettings): PanelSettings {
  const trayIcon = typeof data.tray_icon === "boolean" ? data.tray_icon : false;
  const configPath =
    typeof data.config_path === "string" && data.config_path.trim()
      ? data.config_path
      : fallback.config_path;
  const backupLocalPathFallback = defaultBackupPath();
  const backupStrategy = (() => {
    if (
      data.backup_strategy === "manual" ||
      data.backup_strategy === "scheduled" ||
      data.backup_strategy === "on-change"
    ) {
      return data.backup_strategy;
    }
    if (asBoolean(data.backup_schedule_enabled, asBoolean(data.backup_enabled, false))) {
      return "scheduled";
    }
    if (asBoolean(data.backup_on_change_enabled, false)) {
      return "on-change";
    }
    return fallback.backup_strategy;
  })();
  return {
    version: PANEL_SETTINGS_VERSION,
    config_path: configPath,
    profiles_path:
      typeof data.profiles_path === "string" ? data.profiles_path : fallback.profiles_path,
    follow_config_profiles:
      typeof data.follow_config_profiles === "boolean"
        ? data.follow_config_profiles
        : true,
    theme: parseAppearanceMode(data.theme, fallback.theme),
    appearance_theme: parseAppearanceTheme(data.appearance_theme, fallback.appearance_theme),
    ui_font_size: parseUiFontSize(data.ui_font_size, fallback.ui_font_size),
    locale: parseLocale(data.locale, fallback.locale),
    tray_icon: trayIcon,
    sidebar_collapsed: asBoolean(data.sidebar_collapsed, fallback.sidebar_collapsed),
    display_open_mode: parseDisplayOpenMode(data.display_open_mode, fallback.display_open_mode),
    close_behavior: trayIcon ? parseCloseBehavior(data.close_behavior, "keep-in-tray") : "quit",
    terminal_app: parseTerminalApp(data.terminal_app, fallback.terminal_app),
    backup_strategy: backupStrategy,
    backup_frequency: parseBackupFrequency(data.backup_frequency, fallback.backup_frequency),
    backup_retention_count: parseBackupRetentionCount(data.backup_retention_count, fallback.backup_retention_count),
    backup_destination_type: parseBackupDestinationType(data.backup_destination_type, fallback.backup_destination_type),
    backup_local_path: sanitizePath(
      asString(data.backup_local_path, asString(data.backup_path, backupLocalPathFallback)),
      backupLocalPathFallback,
    ),
    backup_webdav_url: asString(data.backup_webdav_url, ""),
    backup_webdav_username: asString(data.backup_webdav_username, ""),
    backup_webdav_password: asString(data.backup_webdav_password, ""),
    backup_webdav_path: asString(data.backup_webdav_path, ""),
    shortcuts: normalizeShortcuts(data.shortcuts),
    mcp_servers: parsePanelMcpServers(data.mcp_servers),
    last_display_id: typeof data.last_display_id === "number" ? data.last_display_id : undefined,
    uiState: parseUiState(data.uiState),
    favorites: parseFavorites(data.favorites),
    insights_status:
      data.insights_status === "enabled" || data.insights_status === "paused" || data.insights_status === "disabled"
        ? data.insights_status
        : fallback.insights_status,
    insights_proxy_port:
      data.insights_proxy_port === "auto" || typeof data.insights_proxy_port === "number"
        ? data.insights_proxy_port
        : fallback.insights_proxy_port,
    insights_retention_days:
      typeof data.insights_retention_days === "number"
        ? data.insights_retention_days
        : fallback.insights_retention_days,
    insights_disk_warn_threshold_mb:
      typeof data.insights_disk_warn_threshold_mb === "number"
        ? data.insights_disk_warn_threshold_mb
        : fallback.insights_disk_warn_threshold_mb,
    insights_store_prompt_preview:
      typeof data.insights_store_prompt_preview === "boolean"
        ? data.insights_store_prompt_preview
        : fallback.insights_store_prompt_preview,
    insights_onboarding_shown_at:
      typeof data.insights_onboarding_shown_at === "string"
        ? data.insights_onboarding_shown_at
        : fallback.insights_onboarding_shown_at,
    insights_last_known_port:
      typeof data.insights_last_known_port === "number"
        ? data.insights_last_known_port
        : fallback.insights_last_known_port ?? null,
    insights_display_currency:
      typeof data.insights_display_currency === "string" &&
      (SUPPORTED_CURRENCIES as readonly string[]).includes(data.insights_display_currency)
        ? (data.insights_display_currency as DisplayCurrency)
        : fallback.insights_display_currency,
    insights_currency_rates: sanitizeCurrencyRates(
      data.insights_currency_rates,
      fallback.insights_currency_rates,
    ),
  };
}

export async function saveAppState(files: FileAccess, state: AppState): Promise<void> {
  const normalizedState = normalizeStatePaths(state);
  if (normalizedState.configPath === normalizedState.profilesPath) {
    throw new Error("Config path and profiles path must be different.");
  }
  await files.ensureDir(dirnamePath(normalizedState.configPath));
  await files.ensureDir(dirnamePath(normalizedState.profilesPath));
  await files.ensureDir(dirnamePath(normalizedState.panelSettingsPath));
  await files.ensureDir(dirnamePath(normalizedState.mcpConfigPath));
  await files.writeText(normalizedState.configPath, buildConfigDocument(normalizedState));
  await files.writeText(normalizedState.profilesPath, buildProfilesDocument(normalizedState));
  await files.writeText(
    normalizedState.panelSettingsPath,
    buildPanelSettingsDocument(normalizedState.panelSettings),
  );
  await files.writeText(normalizedState.mcpConfigPath, buildMcpConfigDocument(normalizedState.mcpConfig));
}

export function buildConfigDocument(state: AppState): string {
  return stringify(state.mainConfig as unknown as Record<string, unknown>);
}

export function buildProfilesDocument(state: AppState): string {
  const profiles: Record<string, Omit<Profile, "name">> = {};
  for (const [name, profile] of Object.entries(state.profiles)) {
    const { name: _ignored, ...rest } = profile;
    profiles[name] = rest;
  }
  return stringify({
    version: PROFILE_VERSION,
    active_profile: state.activeProfile,
    profiles,
  });
}

export function buildPanelSettingsDocument(settings: PanelSettings): string {
  // 过滤掉 null/undefined 值，因为 TOML 不支持 null
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }
  return normalizePanelTomlIndentation(stringify(cleaned));
}

export function bootstrapProfiles(mainConfig: MainConfig): Record<string, Profile> {
  return {
    [DEFAULT_PROFILE_NAME]: normalizeProfile({
      name: DEFAULT_PROFILE_NAME,
      label: "Default",
      default_model: String(mainConfig.default_model ?? DEFAULTS.default_model),
      default_thinking: Boolean(mainConfig.default_thinking),
      default_yolo: Boolean(mainConfig.default_yolo),
      default_plan_mode: Boolean(mainConfig.default_plan_mode),
      default_editor: String(mainConfig.default_editor ?? DEFAULTS.default_editor),
      theme: String(mainConfig.theme ?? DEFAULTS.theme),
      show_thinking_stream: Boolean(mainConfig.show_thinking_stream),
      merge_all_available_skills: Boolean(mainConfig.merge_all_available_skills),
    }),
  };
}

export function applyProfile(state: AppState, profileName: string): void {
  const profile = state.profiles[profileName];
  if (!profile) {
    throw new Error(`Profile not found: ${profileName}`);
  }
  if (!state.mainConfig.models[profile.default_model]) {
    throw new Error(
      formatMissingModelError(profile.default_model, state.mainConfig.models, {
        context: `配置Profile ${profile.name}`,
      }),
    );
  }
  for (const key of PROFILE_KEYS) {
    state.mainConfig[key] = profile[key] as never;
  }
  state.activeProfile = profileName;
}

export function upsertProvider(
  state: AppState,
  name: string,
  provider: { type: string; base_url: string; api_key: string },
): void {
  state.mainConfig.providers[name] = provider;
}

export function deleteProvider(state: AppState, name: string): void {
  for (const [modelName, model] of Object.entries(state.mainConfig.models)) {
    if (model.provider === name) {
      throw new Error(`Provider ${name} is still used by model ${modelName}.`);
    }
  }
  delete state.mainConfig.providers[name];
}

export function upsertModel(
  state: AppState,
  name: string,
  model: MainConfig["models"][string],
): void {
  if (!state.mainConfig.providers[model.provider]) {
    throw new Error(`Provider not found: ${model.provider}`);
  }
  state.mainConfig.models[name] = model;
}

export function deleteModel(state: AppState, name: string): void {
  for (const profile of Object.values(state.profiles)) {
    if (profile.default_model === name) {
      throw new Error(`Model ${name} is still used by profile ${profile.name}.`);
    }
  }
  if (state.mainConfig.default_model === name) {
    throw new Error(`Model ${name} is still used as the current default model.`);
  }
  delete state.mainConfig.models[name];
}

export function upsertProfile(state: AppState, profile: Profile): void {
  const normalizedProfile = normalizeProfile(profile);
  if (!state.mainConfig.models[normalizedProfile.default_model]) {
    throw new Error(
      formatMissingModelError(normalizedProfile.default_model, state.mainConfig.models, {
        context: `配置Profile ${normalizedProfile.name || "（未命名）"}`,
      }),
    );
  }
  state.profiles[normalizedProfile.name] = normalizedProfile;
}

export function cloneProfile(
  state: AppState,
  sourceName: string,
  targetName: string,
  label: string,
): void {
  const source = state.profiles[sourceName];
  if (!source) {
    throw new Error(`Profile not found: ${sourceName}`);
  }
  if (state.profiles[targetName]) {
    throw new Error(`Profile already exists: ${targetName}`);
  }
  state.profiles[targetName] = normalizeProfile({
    ...source,
    name: targetName,
    label,
  });
}

export function compareProfiles(left: Profile, right: Profile): ProfileDiff {
  const differences = PROFILE_KEYS.map((key) => ({
    field: key as keyof Profile,
    leftValue: left[key],
    rightValue: right[key],
    isSame: left[key] === right[key],
  }));
  return { left, right, differences };
}

export function copyProfileField(
  state: AppState,
  fromName: string,
  toName: string,
  field: keyof Profile,
): void {
  if (field === "name") {
    return;
  }
  const from = state.profiles[fromName];
  const to = state.profiles[toName];
  if (!from) {
    throw new Error(`Profile not found: ${fromName}`);
  }
  if (!to) {
    throw new Error(`Profile not found: ${toName}`);
  }
  (to as Record<string, unknown>)[field] = (from as Record<string, unknown>)[field];
}

export function deleteProfile(state: AppState, name: string): void {
  if (name === state.activeProfile) {
    throw new Error("Cannot delete the active profile.");
  }
  if (Object.keys(state.profiles).length <= 1) {
    throw new Error("At least one profile is required.");
  }
  delete state.profiles[name];
}

export function buildPreviewBundle(state: AppState, disk: {
  configDocument?: string | null;
  profilesDocument?: string | null;
  panelSettingsDocument?: string | null;
  mcpDocument?: string | null;
}): PreviewBundle {
  const normalizedState = normalizeStatePaths(state);
  const configDocument = buildConfigDocument(normalizedState);
  const profilesDocument = buildProfilesDocument(normalizedState);
  const panelSettingsDocument = buildPanelSettingsDocument(normalizedState.panelSettings);
  const mcpDocument = buildMcpConfigDocument(normalizedState.mcpConfig);

  return {
    configDocument,
    profilesDocument,
    panelSettingsDocument,
    mcpDocument,
    configDiff: createLineDiff(disk.configDocument ?? "", configDocument),
    profilesDiff: createLineDiff(disk.profilesDocument ?? "", profilesDocument),
    panelDiff: createLineDiff(disk.panelSettingsDocument ?? "", panelSettingsDocument),
    mcpDiff: createLineDiff(disk.mcpDocument ?? "", mcpDocument),
  };
}

export function createLineDiff(previous: string, next: string): string {
  const before = previous.split("\n");
  const after = next.split("\n");
  const max = Math.max(before.length, after.length);
  const lines: string[] = [];
  for (let index = 0; index < max; index += 1) {
    const left = before[index];
    const right = after[index];
    if (left === right) {
      if (left !== undefined && left !== "") {
        lines.push(`  ${left}`);
      }
      continue;
    }
    if (left !== undefined) {
      lines.push(`- ${left}`);
    }
    if (right !== undefined) {
      lines.push(`+ ${right}`);
    }
  }
  return lines.join("\n");
}

export function formatMissingModelError(
  modelName: string,
  models: Record<string, unknown>,
  options: { context: string },
): string {
  const normalizedName = modelName || "（空）";
  const modelKeys = Object.keys(models);
  const availableHint = modelKeys.length
    ? `可用模型 key：${modelKeys.slice(0, 3).join("、")}${modelKeys.length > 3 ? ` 等 ${modelKeys.length} 个` : ""}。`
    : "当前还没有任何模型，请先在“模型”页创建模型。";
  return `${options.context}引用的默认模型不存在：${normalizedName}。这里需要填写 [models] 下的模型 key，不是 model 字段值。${availableHint}请先创建对应模型，或把配置Profile默认模型改成现有模型。`;
}

function parseProfiles(
  mainConfig: MainConfig,
  rawProfiles: Record<string, unknown>,
): Record<string, Profile> {
  if (rawProfiles.version === PROFILE_VERSION && isRecord(rawProfiles.profiles)) {
    const parsedEntries = Object.entries(rawProfiles.profiles).map(([name, raw]) => [
      name,
      profileFromUnknown(name, raw),
    ]);
    if (parsedEntries.length > 0) {
      return Object.fromEntries(parsedEntries);
    }
  }
  return bootstrapProfiles(mainConfig);
}

function profileFromUnknown(name: string, raw: unknown): Profile {
  const data = isRecord(raw) ? raw : {};
  return normalizeProfile({
    name,
    label: asString(data.label, name),
    default_model: asString(data.default_model, DEFAULTS.default_model),
    default_thinking: asBoolean(data.default_thinking, DEFAULTS.default_thinking),
    default_yolo: asBoolean(data.default_yolo, DEFAULTS.default_yolo),
    default_plan_mode: asBoolean(data.default_plan_mode, DEFAULTS.default_plan_mode),
    default_editor: asString(data.default_editor, DEFAULTS.default_editor),
    theme: asString(data.theme, DEFAULTS.theme),
    show_thinking_stream: asBoolean(
      data.show_thinking_stream,
      DEFAULTS.show_thinking_stream,
    ),
    merge_all_available_skills: asBoolean(
      data.merge_all_available_skills,
      DEFAULTS.merge_all_available_skills,
    ),
  });
}

function normalizeProfile(profile: Profile): Profile {
  return { ...profile };
}

function pickActiveProfile(mainConfig: MainConfig, profiles: Record<string, Profile>): string {
  for (const [name, profile] of Object.entries(profiles)) {
    if (profile.default_model !== mainConfig.default_model) {
      continue;
    }
    const matches = PROFILE_KEYS.every((key) => mainConfig[key] === profile[key]);
    if (matches) {
      return name;
    }
  }
  return Object.keys(profiles)[0] ?? DEFAULT_PROFILE_NAME;
}

function ensureActiveProfile(activeProfile: string, profiles: Record<string, Profile>): string {
  return profiles[activeProfile] ? activeProfile : Object.keys(profiles)[0] ?? DEFAULT_PROFILE_NAME;
}

function parseDocument(document: string | null): Record<string, unknown> {
  if (!document?.trim()) {
    return {};
  }
  return (parse(document) as Record<string, unknown>) ?? {};
}

async function loadTomlFile(
  files: FileAccess,
  path: string,
  label: string,
): Promise<Record<string, unknown>> {
  let document: string | null;
  try {
    document = await files.readText(path);
  } catch (error) {
    throw new Error(`Failed to read ${label} at ${path}: ${formatErrorMessage(error)}`);
  }

  try {
    return parseDocument(document);
  } catch (error) {
    throw new Error(`Invalid ${label} TOML at ${path}: ${formatErrorMessage(error)}`);
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMainConfig(input: Record<string, unknown>): MainConfig {
  return {
    default_model: asString(input.default_model, DEFAULTS.default_model),
    default_thinking: asBoolean(input.default_thinking, DEFAULTS.default_thinking),
    default_yolo: asBoolean(input.default_yolo, DEFAULTS.default_yolo),
    default_plan_mode: asBoolean(input.default_plan_mode, DEFAULTS.default_plan_mode),
    default_editor: asString(input.default_editor, DEFAULTS.default_editor),
    theme: asString(input.theme, DEFAULTS.theme),
    show_thinking_stream: asBoolean(
      input.show_thinking_stream,
      DEFAULTS.show_thinking_stream,
    ),
    merge_all_available_skills: asBoolean(
      input.merge_all_available_skills,
      DEFAULTS.merge_all_available_skills,
    ),
    hooks: Array.isArray(input.hooks) ? input.hooks : [],
    models: isRecord(input.models) ? (input.models as MainConfig["models"]) : {},
    providers: isRecord(input.providers) ? (input.providers as MainConfig["providers"]) : {},
    loop_control: isRecord(input.loop_control) ? input.loop_control : {},
    background: isRecord(input.background) ? input.background : {},
    notifications: isRecord(input.notifications) ? input.notifications : {},
    services: isRecord(input.services) ? input.services : {},
    mcp: isRecord(input.mcp) ? input.mcp : {},
  };
}


function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseAppearanceMode(value: unknown, fallback: PanelSettings["theme"]): PanelSettings["theme"] {
  return value === "light" || value === "dark" || value === "auto" ? value : fallback;
}

function parseLocale(value: unknown, fallback: PanelSettings["locale"]): PanelSettings["locale"] {
  return typeof value === "string" && SUPPORTED_LOCALES.has(value as PanelSettings["locale"])
    ? value as PanelSettings["locale"]
    : fallback;
}

const APPEARANCE_THEMES: ReadonlySet<PanelSettings["appearance_theme"]> = new Set([
  "aurora",
  "ocean",
  "violet",
  "sunset",
  "forest",
  "sakura",
  "mint",
  "cosmos",
  "amber",
]);

function parseAppearanceTheme(
  value: unknown,
  fallback: PanelSettings["appearance_theme"],
): PanelSettings["appearance_theme"] {
  return typeof value === "string" && APPEARANCE_THEMES.has(value as PanelSettings["appearance_theme"])
    ? (value as PanelSettings["appearance_theme"])
    : fallback;
}

function parseUiFontSize(
  value: unknown,
  fallback: PanelSettings["ui_font_size"],
): PanelSettings["ui_font_size"] {
  return value === "mini"
    || value === "compact"
    || value === "small"
    || value === "standard"
    || value === "large"
    || value === "extra-large"
    ? value
    : fallback;
}

function parseDisplayOpenMode(
  value: unknown,
  fallback: PanelSettings["display_open_mode"],
): PanelSettings["display_open_mode"] {
  return value === "random" || value === "remember-last" || value === "active-display"
    ? value
    : fallback;
}

function parseCloseBehavior(
  value: unknown,
  fallback: PanelSettings["close_behavior"],
): PanelSettings["close_behavior"] {
  return value === "quit" || value === "keep-in-tray" ? value : fallback;
}

function parseTerminalApp(
  value: unknown,
  fallback: PanelSettings["terminal_app"],
): PanelSettings["terminal_app"] {
  return value === "system-terminal" || value === "iterm2" ? value : fallback;
}

function parseBackupFrequency(
  value: unknown,
  fallback: PanelSettings["backup_frequency"],
): PanelSettings["backup_frequency"] {
  return value === "hourly" || value === "daily" || value === "weekly" ? value : fallback;
}

function parseBackupDestinationType(
  value: unknown,
  fallback: BackupDestinationType,
): BackupDestinationType {
  return value === "local" || value === "webdav" ? value : fallback;
}

function parseBackupStrategy(
  value: unknown,
  fallback: BackupStrategy,
): BackupStrategy {
  return value === "manual" || value === "scheduled" || value === "on-change" ? value : fallback;
}

function parseBackupRetentionCount(
  value: unknown,
  fallback: PanelSettings["backup_retention_count"],
): PanelSettings["backup_retention_count"] {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(99, Math.round(value)));
}

function sanitizePath(path: string | undefined, fallback: string): string {
  return typeof path === "string" && path.trim() ? path.trim() : fallback;
}

function defaultProfilesPath(configPath: string): string {
  return joinPath(dirnamePath(configPath), PROFILE_FILENAME);
}

function defaultBackupPath(): string {
  return joinPath(DEFAULT_PANEL_DIRECTORY, BACKUP_DIRECTORY_NAME);
}

function resolveProfilesPath(options: {
  explicitProfilesPath?: string;
  configPath: string;
}): string {
  if (options.explicitProfilesPath?.trim()) {
    return options.explicitProfilesPath.trim();
  }
  return defaultProfilesPath(options.configPath);
}

export function normalizeStatePaths(state: AppState): AppState {
  const configPath = sanitizePath(state.configPath, DEFAULT_CONFIG_PATH);
  const panelSettingsPath = sanitizePath(state.panelSettingsPath, DEFAULT_PANEL_SETTINGS_PATH);
  const mcpConfigPath = sanitizePath(state.mcpConfigPath, DEFAULT_MCP_CONFIG_PATH);
  const panelSettings: PanelSettings = {
    ...state.panelSettings,
    config_path: configPath,
    theme: parseAppearanceMode(state.panelSettings.theme, "auto"),
    appearance_theme: parseAppearanceTheme(state.panelSettings.appearance_theme, "aurora"),
    ui_font_size: parseUiFontSize(state.panelSettings.ui_font_size, "standard"),
    display_open_mode: parseDisplayOpenMode(state.panelSettings.display_open_mode, "remember-last"),
    close_behavior: state.panelSettings.tray_icon
      ? parseCloseBehavior(state.panelSettings.close_behavior, "keep-in-tray")
      : "quit",
    terminal_app: parseTerminalApp(state.panelSettings.terminal_app, "system-terminal"),
    backup_strategy: parseBackupStrategy(state.panelSettings.backup_strategy, "manual"),
    backup_frequency: parseBackupFrequency(state.panelSettings.backup_frequency, "daily"),
    backup_retention_count: parseBackupRetentionCount(state.panelSettings.backup_retention_count, 10),
    backup_destination_type: parseBackupDestinationType(state.panelSettings.backup_destination_type, "local"),
    backup_local_path: sanitizePath(state.panelSettings.backup_local_path, defaultBackupPath()),
    backup_webdav_url: asString(state.panelSettings.backup_webdav_url, "").trim(),
    backup_webdav_username: asString(state.panelSettings.backup_webdav_username, ""),
    backup_webdav_password: asString(state.panelSettings.backup_webdav_password, ""),
    backup_webdav_path: asString(state.panelSettings.backup_webdav_path, "").trim(),
    sidebar_collapsed: asBoolean(state.panelSettings.sidebar_collapsed, false),
    shortcuts: normalizeShortcuts(state.panelSettings.shortcuts),
    last_display_id: state.panelSettings.last_display_id,
    mcp_servers: cloneMcpServers(state.mcpConfig.mcpServers),
    profiles_path: "",
    follow_config_profiles: true,
  };
  const profilesPath = resolveProfilesPath({
    configPath,
    explicitProfilesPath: state.profilesPath,
  });
  return {
    ...state,
    configPath,
    profilesPath,
    panelSettingsPath,
    mcpConfigPath,
    panelSettings: {
      ...panelSettings,
      mcp_servers: cloneMcpServers(state.mcpConfig.mcpServers),
      profiles_path: "",
    },
  };
}

export function exportConfig(state: AppState): ExportBundle {
  const { state: redacted } = redactAppStateSecrets(state);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "kimi-code-switch-gui",
    providers: structuredClone(redacted.mainConfig.providers),
    models: structuredClone(redacted.mainConfig.models),
    profiles: structuredClone(redacted.profiles),
    mcpServers: structuredClone(redacted.mcpConfig.mcpServers),
  };
}

export function validateImportData(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Data must be a JSON object."] };
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    errors.push("Missing or invalid 'version' field (must be a number).");
  }
  const hasProviders = obj.providers && typeof obj.providers === "object";
  const hasModels = obj.models && typeof obj.models === "object";
  const hasProfiles = obj.profiles && typeof obj.profiles === "object";
  const hasMcp = obj.mcpServers && typeof obj.mcpServers === "object";
  if (!hasProviders && !hasModels && !hasProfiles && !hasMcp) {
    errors.push("Data must contain at least one of: providers, models, profiles, mcpServers.");
  }
  return { valid: errors.length === 0, errors };
}

export function getImportPreview(state: AppState, data: ExportBundle): ImportPreview {
  const conflicts: ImportConflict[] = [];
  const newItems: ImportConflict[] = [];
  for (const name of Object.keys(data.providers ?? {})) {
    const existing = Boolean(state.mainConfig.providers[name]);
    const item: ImportConflict = { name, type: "provider", existing };
    (existing ? conflicts : newItems).push(item);
  }
  for (const name of Object.keys(data.models ?? {})) {
    const existing = Boolean(state.mainConfig.models[name]);
    const item: ImportConflict = { name, type: "model", existing };
    (existing ? conflicts : newItems).push(item);
  }
  for (const name of Object.keys(data.profiles ?? {})) {
    const existing = Boolean(state.profiles[name]);
    const item: ImportConflict = { name, type: "profile", existing };
    (existing ? conflicts : newItems).push(item);
  }
  for (const name of Object.keys(data.mcpServers ?? {})) {
    const existing = Boolean(state.mcpConfig.mcpServers[name]);
    const item: ImportConflict = { name, type: "mcp_server", existing };
    (existing ? conflicts : newItems).push(item);
  }
  return { conflicts, newItems };
}

export function importConfig(
  state: AppState,
  data: ExportBundle,
  strategy: ImportConflictStrategy,
): AppState {
  const next = cloneState(state);
  for (const [name, provider] of Object.entries(data.providers ?? {})) {
    const exists = Boolean(next.mainConfig.providers[name]);
    if (exists && strategy === "skip") continue;
    const key = exists && strategy === "rename" ? `${name}-imported` : name;
    next.mainConfig.providers[key] = structuredClone(provider);
  }
  for (const [name, model] of Object.entries(data.models ?? {})) {
    const exists = Boolean(next.mainConfig.models[name]);
    if (exists && strategy === "skip") continue;
    const key = exists && strategy === "rename" ? `${name}-imported` : name;
    next.mainConfig.models[key] = structuredClone(model);
  }
  for (const [name, profile] of Object.entries(data.profiles ?? {})) {
    const exists = Boolean(next.profiles[name]);
    if (exists && strategy === "skip") continue;
    const key = exists && strategy === "rename" ? `${name}-imported` : name;
    next.profiles[key] = { ...structuredClone(profile), name: key };
  }
  for (const [name, server] of Object.entries(data.mcpServers ?? {})) {
    const exists = Boolean(next.mcpConfig.mcpServers[name]);
    if (exists && strategy === "skip") continue;
    const key = exists && strategy === "rename" ? `${name}-imported` : name;
    next.mcpConfig.mcpServers[key] = structuredClone(server);
  }
  return next;
}

export function toggleFavorite(
  state: AppState,
  type: "provider" | "profile",
  name: string,
): void {
  if (!state.panelSettings.favorites) {
    state.panelSettings.favorites = {};
  }
  const key = type === "provider" ? "providers" : "profiles";
  if (!state.panelSettings.favorites[key]) {
    state.panelSettings.favorites[key] = [];
  }
  const list = state.panelSettings.favorites[key]!;
  const index = list.indexOf(name);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(name);
  }
}

export interface SearchResult {
  type: "provider" | "model" | "profile" | "mcp";
  name: string;
  subtitle: string;
  tabId: string;
}

export function searchConfig(state: AppState, query: string): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [name, provider] of Object.entries(state.mainConfig.providers)) {
    if (name.toLowerCase().includes(q) || provider.base_url.toLowerCase().includes(q)) {
      results.push({ type: "provider", name, subtitle: provider.base_url, tabId: "providers" });
    }
  }
  for (const [id, model] of Object.entries(state.mainConfig.models)) {
    if (id.toLowerCase().includes(q) || model.provider.toLowerCase().includes(q)) {
      results.push({ type: "model", name: id, subtitle: model.provider, tabId: "models" });
    }
  }
  for (const [name, profile] of Object.entries(state.profiles)) {
    if (name.toLowerCase().includes(q) || profile.default_model.toLowerCase().includes(q)) {
      results.push({ type: "profile", name, subtitle: profile.default_model, tabId: "profiles" });
    }
  }
  for (const name of Object.keys(state.mcpConfig.mcpServers)) {
    if (name.toLowerCase().includes(q)) {
      results.push({ type: "mcp", name, subtitle: "", tabId: "mcp" });
    }
  }
  return results;
}

function parsePanelMcpServers(value: unknown): Record<string, McpServerConfig> {
  if (!isRecord(value)) {
    return {};
  }

  try {
    const config = parseMcpConfigStrict(JSON.stringify({ mcpServers: value }));
    const disabledNames = Object.entries(value)
      .filter(([, raw]) => isRecord(raw) && raw.enabled === false)
      .map(([name]) => name);

    for (const name of disabledNames) {
      if (config.mcpServers[name]) {
        config.mcpServers[name].enabled = false;
      }
    }

    return config.mcpServers;
  } catch {
    return {};
  }
}

function mergePanelMcpServers(
  panelServers: Record<string, McpServerConfig>,
  fileServers: Record<string, McpServerConfig>,
): { mcpServers: Record<string, McpServerConfig> } {
  const merged = cloneMcpServers(panelServers);

  for (const [name, server] of Object.entries(fileServers)) {
    merged[name] = {
      ...server,
      enabled: panelServers[name]?.enabled ?? true,
    };
  }

  return { mcpServers: merged };
}

function cloneMcpServers(servers: Record<string, McpServerConfig>): Record<string, McpServerConfig> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      {
        ...server,
        headers: { ...server.headers },
        args: [...server.args],
        env: { ...server.env },
        extra: server.extra ? cloneUnknownRecord(server.extra) : undefined,
      },
    ]),
  );
}

function cloneUnknownRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (Array.isArray(entry)) {
        return [key, [...entry]];
      }
      if (isRecord(entry)) {
        return [key, cloneUnknownRecord(entry)];
      }
      return [key, entry];
    }),
  );
}

function parseUiState(value: unknown): PanelSettings["uiState"] {
  if (!isRecord(value)) {
    return undefined;
  }
  const result: NonNullable<PanelSettings["uiState"]> = {};
  if (typeof value.activeTab === "string") {
    result.activeTab = value.activeTab;
  }
  if (typeof value.providerSortBy === "string") {
    result.providerSortBy = value.providerSortBy;
  }
  if (typeof value.profileSortBy === "string") {
    result.profileSortBy = value.profileSortBy;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseFavorites(value: unknown): PanelSettings["favorites"] {
  if (!isRecord(value)) {
    return undefined;
  }
  const result: NonNullable<PanelSettings["favorites"]> = {};
  if (Array.isArray(value.providers)) {
    result.providers = value.providers.filter((v: unknown) => typeof v === "string");
  }
  if (Array.isArray(value.profiles)) {
    result.profiles = value.profiles.filter((v: unknown) => typeof v === "string");
  }
  return (result.providers?.length || result.profiles?.length) ? result : undefined;
}

function normalizePanelTomlIndentation(document: string): string {
  return document.replace(/^[ \t]+(?=(\[|[A-Za-z0-9_.-]+\s*=))/gm, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dirnamePath(path: string): string {
  if (!path.includes("/")) {
    return ".";
  }
  const normalized = path.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return normalized.startsWith("/") ? "/" : ".";
  }
  return normalized.slice(0, index);
}

function joinPath(base: string, name: string): string {
  if (!base || base === ".") {
    return name;
  }
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}
