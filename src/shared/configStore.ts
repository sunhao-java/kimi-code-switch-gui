import parse from "@iarna/toml/parse-string.js";
import stringify from "@iarna/toml/stringify.js";

import type { AppState, MainConfig, PanelSettings, PreviewBundle, Profile } from "./types";

export const PROFILE_VERSION = 1;
export const PANEL_SETTINGS_VERSION = 1;
export const PROFILE_FILENAME = "config.profiles.toml";
export const PANEL_SETTINGS_FILENAME = "config.panel.toml";
export const DEFAULT_PROFILE_NAME = "default";
export const DEFAULT_CONFIG_PATH = "~/.kimi/config.toml";

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
  _settingsPath = DEFAULT_CONFIG_PATH.replace("config.toml", PANEL_SETTINGS_FILENAME),
): PanelSettings {
  return {
    version: PANEL_SETTINGS_VERSION,
    config_path: configPath,
    profiles_path: "",
    follow_config_profiles: true,
    theme: "auto",
    locale: "zh-CN",
    tray_icon: false,
    display_open_mode: "remember-last",
    close_behavior: "quit",
  };
}

export function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export async function loadAppState(
  files: FileAccess,
  paths?: {
    configPath?: string;
    profilesPath?: string;
    panelSettingsPath?: string;
  },
): Promise<AppState> {
  const panelSettingsPath =
    paths?.panelSettingsPath ?? DEFAULT_CONFIG_PATH.replace("config.toml", PANEL_SETTINGS_FILENAME);
  const panelSettings = await loadPanelSettings(files, panelSettingsPath);
  const configPath = sanitizePath(paths?.configPath ?? panelSettings.config_path, DEFAULT_CONFIG_PATH);
  const profilesPath = resolveProfilesPath({
    explicitProfilesPath: paths?.profilesPath,
    configPath,
    panelSettings,
  });
  const resolvedPanelSettingsPath = sanitizePath(
    panelSettingsPath,
    defaultPanelSettingsPath(configPath),
  );
  const mainConfig = normalizeMainConfig(parseDocument(await files.readText(configPath)));
  const rawProfiles = parseDocument(await files.readText(profilesPath));
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
    mainConfig,
    profiles,
    activeProfile,
    panelSettings: {
      ...panelSettings,
      config_path: configPath,
      profiles_path: panelSettings.follow_config_profiles ? "" : profilesPath,
    },
  };
}

export async function loadPanelSettings(
  files: FileAccess,
  panelSettingsPath: string,
): Promise<PanelSettings> {
  const fallback = createDefaultPanelSettings(DEFAULT_CONFIG_PATH, panelSettingsPath);
  const data = parseDocument(await files.readText(panelSettingsPath));
  const trayIcon = typeof data.tray_icon === "boolean" ? data.tray_icon : false;
  return {
    version: PANEL_SETTINGS_VERSION,
    config_path:
      typeof data.config_path === "string" && data.config_path.trim()
        ? data.config_path
        : fallback.config_path,
    profiles_path:
      typeof data.profiles_path === "string" ? data.profiles_path : fallback.profiles_path,
    follow_config_profiles:
      typeof data.follow_config_profiles === "boolean"
        ? data.follow_config_profiles
        : true,
    theme: parseAppearanceMode(data.theme, fallback.theme),
    locale: data.locale === "en-US" ? "en-US" : "zh-CN",
    tray_icon: trayIcon,
    display_open_mode: parseDisplayOpenMode(data.display_open_mode, fallback.display_open_mode),
    close_behavior: trayIcon ? parseCloseBehavior(data.close_behavior, "keep-in-tray") : "quit",
    last_display_id: typeof data.last_display_id === "number" ? data.last_display_id : undefined,
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
  await files.writeText(normalizedState.configPath, buildConfigDocument(normalizedState));
  await files.writeText(normalizedState.profilesPath, buildProfilesDocument(normalizedState));
  await files.writeText(
    normalizedState.panelSettingsPath,
    buildPanelSettingsDocument(normalizedState.panelSettings),
  );
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
  return stringify(settings as unknown as Record<string, unknown>);
}

export function bootstrapProfiles(mainConfig: MainConfig): Record<string, Profile> {
  return {
    [DEFAULT_PROFILE_NAME]: {
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
    },
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
  if (!state.mainConfig.models[profile.default_model]) {
    throw new Error(
      formatMissingModelError(profile.default_model, state.mainConfig.models, {
        context: `配置Profile ${profile.name || "（未命名）"}`,
      }),
    );
  }
  state.profiles[profile.name] = profile;
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
  state.profiles[targetName] = {
    ...source,
    name: targetName,
    label,
  };
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
}): PreviewBundle {
  const normalizedState = normalizeStatePaths(state);
  const configDocument = buildConfigDocument(normalizedState);
  const profilesDocument = buildProfilesDocument(normalizedState);
  const panelSettingsDocument = buildPanelSettingsDocument(normalizedState.panelSettings);

  return {
    configDocument,
    profilesDocument,
    panelSettingsDocument,
    configDiff: createLineDiff(disk.configDocument ?? "", configDocument),
    profilesDiff: createLineDiff(disk.profilesDocument ?? "", profilesDocument),
    panelDiff: createLineDiff(disk.panelSettingsDocument ?? "", panelSettingsDocument),
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
  return {
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
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function sanitizePath(path: string | undefined, fallback: string): string {
  return typeof path === "string" && path.trim() ? path.trim() : fallback;
}

function defaultProfilesPath(configPath: string): string {
  return joinPath(dirnamePath(configPath), PROFILE_FILENAME);
}

function defaultPanelSettingsPath(configPath: string): string {
  return joinPath(dirnamePath(configPath), PANEL_SETTINGS_FILENAME);
}

function resolveProfilesPath(options: {
  explicitProfilesPath?: string;
  configPath: string;
  panelSettings: PanelSettings;
}): string {
  if (options.explicitProfilesPath?.trim()) {
    return options.explicitProfilesPath.trim();
  }
  if (options.panelSettings.follow_config_profiles) {
    return defaultProfilesPath(options.configPath);
  }
  return sanitizePath(options.panelSettings.profiles_path, defaultProfilesPath(options.configPath));
}

export function normalizeStatePaths(state: AppState): AppState {
  const configPath = sanitizePath(state.configPath, DEFAULT_CONFIG_PATH);
  const panelSettingsPath = sanitizePath(
    state.panelSettingsPath,
    defaultPanelSettingsPath(configPath),
  );
  const panelSettings: PanelSettings = {
    ...state.panelSettings,
    config_path: configPath,
    theme: parseAppearanceMode(state.panelSettings.theme, "auto"),
    display_open_mode: parseDisplayOpenMode(state.panelSettings.display_open_mode, "remember-last"),
    close_behavior: state.panelSettings.tray_icon
      ? parseCloseBehavior(state.panelSettings.close_behavior, "keep-in-tray")
      : "quit",
    last_display_id: state.panelSettings.last_display_id,
    profiles_path: state.panelSettings.follow_config_profiles
      ? ""
      : sanitizePath(state.panelSettings.profiles_path, defaultProfilesPath(configPath)),
  };
  const profilesPath = resolveProfilesPath({
    configPath,
    panelSettings,
    explicitProfilesPath: state.profilesPath,
  });
  return {
    ...state,
    configPath,
    profilesPath,
    panelSettingsPath,
    panelSettings: {
      ...panelSettings,
      profiles_path: panelSettings.follow_config_profiles ? "" : profilesPath,
    },
  };
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
