import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, safeStorage, screen, shell, Tray } from "electron";
import type { NativeImage } from "electron";
import { dirname, join, resolve } from "node:path";
import { hostname } from "node:os";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

import { electronApp, is, optimizer } from "@electron-toolkit/utils";

import {
  applyProfile,
  buildConfigDocument,
  buildProfilesDocument,
  buildPanelSettingsDocument,
  buildPreviewBundle,
  cloneState,
  DEFAULT_CONFIG_PATH,
  normalizeStatePaths,
  PANEL_SETTINGS_FILENAME,
  PROFILE_FILENAME,
  loadAppState,
  loadPanelSettings,
  parsePanelSettingsDocument,
  saveAppState,
} from "@shared/configStore";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import { scanSkills } from "@shared/skillsStore";
import { normalizeShortcuts } from "@shared/shortcutStore";
import { getCliEnv, runKimiConnectivityTest, runKimiMcpCommand } from "./modules/cli";
import { fileAccess, resolveHome, skillFileAccess } from "./modules/fileAccess";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./modules/shortcuts";
import {
  buildWebDavUrl,
  deleteWebDavPath,
  ensureWebDavCollection,
  getWebDavAuthHeader,
  pruneWebDavBackups,
  readWebDavManifest,
  testWebDavConnection,
  uploadWebDavFile,
} from "./modules/webdav";
import { checkForUpdates, detectInstallSource } from "./modules/updates";
import type {
  AppState,
  AppearanceMode,
  BackupFrequency,
  BackupRecord,
  BackupResult,
  FileDialogResult,
  Locale,
  PanelSettings,
} from "@shared/types";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let rememberDisplayTimer: NodeJS.Timeout | null = null;
let scheduledBackupTimer: NodeJS.Timeout | null = null;
let changeBackupTimer: NodeJS.Timeout | null = null;
let latestAppState: AppState | null = null;
let backupInFlight = false;
let isQuitting = false;
let trayThemeListenerRegistered = false;

const WINDOW_WIDTH = 1500;
const WINDOW_HEIGHT = 980;
const WINDOW_SHOW_TIMEOUT_MS = 1500;
const DISPLAY_REMEMBER_DELAY_MS = 400;
const DEFAULT_PANEL_SETTINGS_PATH = DEFAULT_CONFIG_PATH.replace("config.toml", PANEL_SETTINGS_FILENAME);
const CHANGE_BACKUP_DELAY_MS = 4000;

const ENCRYPTED_PASSWORD_PREFIX = "__enc__";
const SHORTCUTS_BACKUP_FILENAME = "shortcuts.json";

function encryptWebDavPassword(state: AppState): AppState {
  if (!state.panelSettings.backup_webdav_password || !safeStorage.isEncryptionAvailable()) {
    return state;
  }
  // Already encrypted
  if (state.panelSettings.backup_webdav_password.startsWith(ENCRYPTED_PASSWORD_PREFIX)) {
    return state;
  }
  const encrypted = safeStorage.encryptString(state.panelSettings.backup_webdav_password);
  state.panelSettings.backup_webdav_password = ENCRYPTED_PASSWORD_PREFIX + encrypted.toString("base64");
  return state;
}

function decryptWebDavPassword(state: AppState): AppState {
  if (!state.panelSettings.backup_webdav_password?.startsWith(ENCRYPTED_PASSWORD_PREFIX) || !safeStorage.isEncryptionAvailable()) {
    return state;
  }
  try {
    const encoded = state.panelSettings.backup_webdav_password.slice(ENCRYPTED_PASSWORD_PREFIX.length);
    const buffer = Buffer.from(encoded, "base64");
    state.panelSettings.backup_webdav_password = safeStorage.decryptString(buffer);
  } catch {
    // If decryption fails, leave as-is (might be from another machine)
    console.warn("Failed to decrypt WebDAV password, keychain may have changed");
  }
  return state;
}

function backupFrequencyToMs(frequency: BackupFrequency): number {
  if (frequency === "hourly") {
    return 60 * 60 * 1000;
  }
  if (frequency === "weekly") {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function formatBackupStamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
    "-",
    String(date.getMilliseconds()).padStart(3, "0"),
  ];
  return parts.join("");
}

function sanitizeMachineName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return normalized || "unknown-host";
}

function buildBackupFiles(state: AppState): Array<{ name: string; content: string }> {
  const normalizedState = normalizeStatePaths(state);
  const shortcuts = normalizeShortcuts(normalizedState.panelSettings.shortcuts);
  return [
    { name: "config.toml", content: buildConfigDocument(normalizedState) },
    { name: "config.profiles.toml", content: buildProfilesDocument(normalizedState) },
    { name: "config.panel.toml", content: buildPanelSettingsDocument(normalizedState.panelSettings) },
    { name: SHORTCUTS_BACKUP_FILENAME, content: JSON.stringify(shortcuts, null, 2) },
    { name: "mcp.json", content: buildMcpConfigDocument(normalizedState.mcpConfig) },
  ];
}

async function pruneBackupDirectories(backupRoot: string, keepCount: number): Promise<void> {
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const obsoleteDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(keepCount);

  await Promise.all(
    obsoleteDirectories.map((directory) => rm(join(backupRoot, directory), { recursive: true, force: true })),
  );
}

async function createLocalBackupSnapshot(state: AppState, backupName: string): Promise<BackupResult> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  const backupDirectory = join(backupRoot, backupName);
  const files = buildBackupFiles(normalizedState);

  await mkdir(backupDirectory, { recursive: true });

  await Promise.all(
    files.map((file) => writeFile(join(backupDirectory, file.name), file.content, "utf-8")),
  );
  await pruneBackupDirectories(backupRoot, normalizedState.panelSettings.backup_retention_count);

  return {
    ok: true,
    backupPath: backupDirectory,
    files: files.map((file) => join(backupDirectory, file.name)),
  };
}

async function createWebDavBackupSnapshot(state: AppState, backupName: string): Promise<BackupResult> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const files = buildBackupFiles(normalizedState);

  const backupDirectoryUrl = await ensureWebDavCollection(settings, [backupName]);
  await Promise.all(
    files.map((file) => uploadWebDavFile(settings, `${backupDirectoryUrl}/${encodeURIComponent(file.name)}`, file.content)),
  );

  const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
  const manifestEntries = await readWebDavManifest(settings, manifestUrl);
  const nextEntries = [
    ...manifestEntries.filter((entry) => entry.name !== backupName),
    { name: backupName, createdAt: backupName },
  ];
  await pruneWebDavBackups(settings, manifestUrl, nextEntries);

  return {
    ok: true,
    backupPath: backupDirectoryUrl,
    files: files.map((file) => `${backupDirectoryUrl}/${encodeURIComponent(file.name)}`),
  };
}

async function createBackupSnapshot(state: AppState): Promise<BackupResult> {
  const normalizedState = normalizeStatePaths(state);
  const backupName = `backup-${formatBackupStamp(new Date())}-${sanitizeMachineName(hostname())}`;

  if (normalizedState.panelSettings.backup_destination_type === "webdav") {
    return createWebDavBackupSnapshot(normalizedState, backupName);
  }

  return createLocalBackupSnapshot(normalizedState, backupName);
}

async function listLocalBackups(state: AppState): Promise<BackupRecord[]> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);

  try {
    const entries = await readdir(backupRoot, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
        .map(async (entry) => {
          const recordPath = join(backupRoot, entry.name);
          const files = await readdir(recordPath).catch(() => []);
          return {
            name: entry.name,
            createdAt: entry.name,
            path: recordPath,
            itemCount: files.length,
          } satisfies BackupRecord;
        }),
    );
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  }
}

async function listWebDavBackups(state: AppState): Promise<BackupRecord[]> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
  const manifestEntries = await readWebDavManifest(settings, manifestUrl);

  return manifestEntries
    .map((entry) => ({
      name: entry.name,
      createdAt: entry.createdAt,
      path: buildWebDavUrl(settings, [entry.name]),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function listBackups(state: AppState): Promise<BackupRecord[]> {
  const normalizedState = normalizeStatePaths(state);
  if (normalizedState.panelSettings.backup_destination_type === "webdav") {
    return listWebDavBackups(normalizedState);
  }
  return listLocalBackups(normalizedState);
}

async function deleteLocalBackup(state: AppState, backupName: string): Promise<void> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  await rm(join(backupRoot, backupName), { recursive: true, force: true });
}

async function deleteWebDavBackup(state: AppState, backupName: string): Promise<void> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
  const manifestEntries = await readWebDavManifest(settings, manifestUrl);
  await deleteWebDavPath(settings, buildWebDavUrl(settings, [backupName]));
  await uploadWebDavFile(
    settings,
    manifestUrl,
    JSON.stringify({ backups: manifestEntries.filter((entry) => entry.name !== backupName) }, null, 2),
  );
}

async function deleteBackup(state: AppState, backupName: string): Promise<{ ok: true }> {
  const normalizedState = normalizeStatePaths(state);
  if (normalizedState.panelSettings.backup_destination_type === "webdav") {
    await deleteWebDavBackup(normalizedState, backupName);
  } else {
    await deleteLocalBackup(normalizedState, backupName);
  }
  return { ok: true };
}

async function readLocalBackupFiles(state: AppState, backupName: string): Promise<Record<string, string>> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  const backupDirectory = join(backupRoot, backupName);
  const [configDocument, profilesDocument, panelSettingsDocument, mcpDocument] = await Promise.all([
    readFile(join(backupDirectory, "config.toml"), "utf-8"),
    readFile(join(backupDirectory, "config.profiles.toml"), "utf-8"),
    readFile(join(backupDirectory, "config.panel.toml"), "utf-8"),
    readFile(join(backupDirectory, "mcp.json"), "utf-8"),
  ]);

  return {
    configDocument,
    profilesDocument,
    panelSettingsDocument: mergeShortcutsBackupDocument(
      panelSettingsDocument,
      await readFile(join(backupDirectory, SHORTCUTS_BACKUP_FILENAME), "utf-8").catch(() => null),
    ),
    mcpDocument,
  };
}

async function readWebDavBackupFiles(state: AppState, backupName: string): Promise<Record<string, string>> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const backupDirectoryUrl = buildWebDavUrl(settings, [backupName]);

  const readRemoteText = async (filename: string): Promise<string> => {
    const response = await fetch(`${backupDirectoryUrl}/${encodeURIComponent(filename)}`, {
      method: "GET",
      headers: {
        Authorization: getWebDavAuthHeader(settings),
      },
    });
    if (!response.ok) {
      throw new Error(`WebDAV restore download failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  };

  const [configDocument, profilesDocument, panelSettingsDocument, shortcutsDocument, mcpDocument] = await Promise.all([
    readRemoteText("config.toml"),
    readRemoteText("config.profiles.toml"),
    readRemoteText("config.panel.toml"),
    readRemoteText(SHORTCUTS_BACKUP_FILENAME).catch(() => null),
    readRemoteText("mcp.json"),
  ]);

  return {
    configDocument,
    profilesDocument,
    panelSettingsDocument: mergeShortcutsBackupDocument(panelSettingsDocument, shortcutsDocument),
    mcpDocument,
  };
}

function mergeShortcutsBackupDocument(panelSettingsDocument: string, shortcutsDocument: string | null): string {
  if (!shortcutsDocument?.trim()) {
    return panelSettingsDocument;
  }

  try {
    const parsedShortcuts = JSON.parse(shortcutsDocument) as unknown;
    const panelSettings = parsePanelSettingsDocument(panelSettingsDocument);
    panelSettings.shortcuts = normalizeShortcuts(parsedShortcuts);
    return buildPanelSettingsDocument(panelSettings);
  } catch (error) {
    console.warn("Failed to merge shortcuts backup document", error);
    return panelSettingsDocument;
  }
}

function resolveProfilesPathFromPanelSettings(configPath: string, panelSettings: PanelSettings): string {
  if (panelSettings.follow_config_profiles) {
    return join(dirname(configPath), PROFILE_FILENAME);
  }
  return panelSettings.profiles_path.trim() || join(dirname(configPath), PROFILE_FILENAME);
}

async function restoreBackup(state: AppState, backupName: string): Promise<AppState> {
  const normalizedState = normalizeStatePaths(state);
  const documents =
    normalizedState.panelSettings.backup_destination_type === "webdav"
      ? await readWebDavBackupFiles(normalizedState, backupName)
      : await readLocalBackupFiles(normalizedState, backupName);

  await fileAccess.ensureDir(dirname(normalizedState.panelSettingsPath));
  await fileAccess.writeText(normalizedState.panelSettingsPath, documents.panelSettingsDocument);

  const restoredPanelSettings = await loadPanelSettings(fileAccess, normalizedState.panelSettingsPath);
  const restoredConfigPath = restoredPanelSettings.config_path.trim() || DEFAULT_CONFIG_PATH;
  const restoredProfilesPath = resolveProfilesPathFromPanelSettings(restoredConfigPath, restoredPanelSettings);

  await fileAccess.ensureDir(dirname(restoredConfigPath));
  await fileAccess.ensureDir(dirname(restoredProfilesPath));
  await fileAccess.ensureDir(dirname(normalizedState.mcpConfigPath));

  await Promise.all([
    fileAccess.writeText(restoredConfigPath, documents.configDocument),
    fileAccess.writeText(restoredProfilesPath, documents.profilesDocument),
    fileAccess.writeText(normalizedState.mcpConfigPath, documents.mcpDocument),
  ]);

  const restoredState = await loadAppState(fileAccess, {
    panelSettingsPath: normalizedState.panelSettingsPath,
    mcpConfigPath: normalizedState.mcpConfigPath,
  });
  updateBackupSchedule(restoredState);
  latestAppState = cloneState(restoredState);
  return restoredState;
}

function clearScheduledBackup(): void {
  if (scheduledBackupTimer) {
    clearTimeout(scheduledBackupTimer);
    scheduledBackupTimer = null;
  }
}

function clearChangeBackup(): void {
  if (changeBackupTimer) {
    clearTimeout(changeBackupTimer);
    changeBackupTimer = null;
  }
}

function clearBackupSchedule(): void {
  clearScheduledBackup();
  clearChangeBackup();
}

function updateBackupSchedule(state: AppState): void {
  latestAppState = cloneState(normalizeStatePaths(state));
  clearScheduledBackup();

  if (latestAppState.panelSettings.backup_strategy !== "scheduled") {
    return;
  }

  scheduledBackupTimer = setTimeout(() => {
    scheduledBackupTimer = null;
    void runScheduledBackup();
  }, backupFrequencyToMs(latestAppState.panelSettings.backup_frequency));
}

function queueChangeBackup(state: AppState): void {
  latestAppState = cloneState(normalizeStatePaths(state));
  clearChangeBackup();

  if (latestAppState.panelSettings.backup_strategy !== "on-change") {
    return;
  }

  changeBackupTimer = setTimeout(() => {
    changeBackupTimer = null;
    void runChangeBackup();
  }, CHANGE_BACKUP_DELAY_MS);
}

async function runScheduledBackup(): Promise<void> {
  if (latestAppState?.panelSettings.backup_strategy !== "scheduled" || backupInFlight) {
    if (latestAppState?.panelSettings.backup_strategy === "scheduled") {
      updateBackupSchedule(latestAppState);
    }
    return;
  }

  backupInFlight = true;
  try {
    await createBackupSnapshot(latestAppState);
  } catch (error) {
    console.error("automatic backup failed", error);
  } finally {
    backupInFlight = false;
    if (latestAppState?.panelSettings.backup_strategy === "scheduled") {
      updateBackupSchedule(latestAppState);
    }
  }
}

async function runChangeBackup(): Promise<void> {
  if (latestAppState?.panelSettings.backup_strategy !== "on-change" || backupInFlight) {
    if (latestAppState?.panelSettings.backup_strategy === "on-change") {
      queueChangeBackup(latestAppState);
    }
    return;
  }

  backupInFlight = true;
  try {
    await createBackupSnapshot(latestAppState);
  } catch (error) {
    console.error("change backup failed", error);
  } finally {
    backupInFlight = false;
  }
}

async function runBackup(state?: AppState): Promise<BackupResult> {
  if (backupInFlight) {
    throw new Error("A backup is already in progress.");
  }

  const sourceState = state
    ? normalizeStatePaths(state)
    : latestAppState
      ? cloneState(latestAppState)
      : await loadAppState(fileAccess);

  backupInFlight = true;
  try {
    const result = await createBackupSnapshot(sourceState);
    updateBackupSchedule(sourceState);
    return result;
  } finally {
    backupInFlight = false;
  }
}

function getResourcePath(filename: string): string {
  if (is.dev) {
    return join(app.getAppPath(), "resources", filename);
  }
  return join(process.resourcesPath, filename);
}

function getTrayIcon(): NativeImage {
  const isDark = nativeTheme.shouldUseDarkColors;
  const iconFile = isDark ? "tray-dark.png" : "tray-light.png";
  const icon2xFile = isDark ? "tray-dark@2x.png" : "tray-light@2x.png";
  const img = nativeImage.createFromPath(getResourcePath(iconFile));
  const img2x = nativeImage.createFromPath(getResourcePath(icon2xFile));
  if (!img2x.isEmpty()) {
    img.addRepresentation({ scaleFactor: 2, width: 22, height: 22, buffer: img2x.toPNG() });
  }
  if (process.platform === "darwin") {
    img.setTemplateImage(true);
  }
  return img;
}

function getAppIconPath(): string {
  const isDark = nativeTheme.shouldUseDarkColors;
  return getResourcePath(isDark ? "icon-dark.png" : "icon-light.png");
}

function createTray(): void {
  if (tray) return;
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Kimi Code Switch GUI");
  void updateTrayMenu();

  tray.on("click", () => {
    tray?.popUpContextMenu();
  });

  ensureTrayThemeListener();
}

function showMainWindow(): void {
  if (mainWindow) {
    showDockIcon();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  showDockIcon();
  void createWindow();
}

function hideMainWindow(): void {
  mainWindow?.hide();
  hideDockIcon();
}

function toggleMainWindow(): void {
  if (!mainWindow || !mainWindow.isVisible()) {
    showMainWindow();
    return;
  }
  hideMainWindow();
}

function showDockIcon(): void {
  if (process.platform === "darwin") {
    app.dock?.show();
  }
}

function hideDockIcon(): void {
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
}

function queueTrayCommand(command: "reload"): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("tray:command", command);
    });
    return;
  }
  mainWindow.webContents.send("tray:command", command);
}

async function updateTrayMenu(): Promise<void> {
  if (!tray) return;
  const state = await loadAppState(fileAccess);
  const settings = state.panelSettings;
  const labels = getTrayLabels(settings.locale);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: labels.showWindow,
      accelerator: getTrayToggleWindowAccelerator(state),
      click: showMainWindow,
    },
    { type: "separator" },
    {
      label: labels.switchProfile,
      submenu: Object.entries(state.profiles).map(([name, profile]) => ({
        label: profile.label ? `${profile.label} (${name})` : name,
        type: "radio" as const,
        checked: name === state.activeProfile,
        click: () => void activateProfileFromTray(name),
      })),
      enabled: Object.keys(state.profiles).length > 0,
    },
    {
      label: labels.switchLanguage,
      submenu: [
        {
          label: "中文",
          type: "radio" as const,
          checked: settings.locale === "zh-CN",
          click: () => void updateLocaleFromTray("zh-CN"),
        },
        {
          label: "English",
          type: "radio" as const,
          checked: settings.locale === "en-US",
          click: () => void updateLocaleFromTray("en-US"),
        },
      ],
    },
    {
      label: labels.switchTheme,
      submenu: [
        {
          label: labels.themeAuto,
          type: "radio" as const,
          checked: settings.theme === "auto",
          click: () => void updateThemeFromTray("auto"),
        },
        {
          label: labels.themeLight,
          type: "radio" as const,
          checked: settings.theme === "light",
          click: () => void updateThemeFromTray("light"),
        },
        {
          label: labels.themeDark,
          type: "radio" as const,
          checked: settings.theme === "dark",
          click: () => void updateThemeFromTray("dark"),
        },
      ],
    },
    { type: "separator" },
    {
      label: labels.quit,
      accelerator: "CommandOrControl+Q",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

async function activateProfileFromTray(profileName: string): Promise<void> {
  const state = await loadAppState(fileAccess);
  applyProfile(state, profileName);
  await saveAppState(fileAccess, state);
  updateBackupSchedule(state);
  queueChangeBackup(state);
  await updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    queueTrayCommand("reload");
  }
}

async function activateRelativeProfile(direction: 1 | -1): Promise<void> {
  const state = await loadAppState(fileAccess);
  const profileNames = Object.keys(state.profiles);
  if (profileNames.length < 2) {
    return;
  }
  const currentIndex = Math.max(0, profileNames.indexOf(state.activeProfile));
  const nextIndex = (currentIndex + direction + profileNames.length) % profileNames.length;
  await activateProfileFromTray(profileNames[nextIndex]);
}

function refreshGlobalShortcuts(state: AppState): void {
  registerGlobalShortcuts(state, {
    toggleWindow: toggleMainWindow,
    activateNextProfile: () => void activateRelativeProfile(1),
    activatePreviousProfile: () => void activateRelativeProfile(-1),
  });
}

function getTrayToggleWindowAccelerator(state: AppState): string {
  const shortcut = normalizeShortcuts(state.panelSettings.shortcuts)["window.toggle"];
  return shortcut.enabled && shortcut.accelerator.trim()
    ? shortcut.accelerator
    : "CommandOrControl+Shift+K";
}

async function updateLocaleFromTray(locale: Locale): Promise<void> {
  const state = await loadAppState(fileAccess);
  if (state.panelSettings.locale === locale) {
    return;
  }
  state.panelSettings.locale = locale;
  await saveAppState(fileAccess, state);
  latestAppState = cloneState(normalizeStatePaths(state));
  await updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    queueTrayCommand("reload");
  }
}

async function updateThemeFromTray(theme: AppearanceMode): Promise<void> {
  const state = await loadAppState(fileAccess);
  if (state.panelSettings.theme === theme) {
    return;
  }
  state.panelSettings.theme = theme;
  await saveAppState(fileAccess, state);
  latestAppState = cloneState(normalizeStatePaths(state));
  await updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    queueTrayCommand("reload");
  }
}

function getTrayLabels(
  locale: Locale,
): Record<
  "showWindow" | "switchProfile" | "switchLanguage" | "switchTheme" | "themeAuto" | "themeLight" | "themeDark" | "quit",
  string
> {
  if (locale === "en-US") {
    return {
      showWindow: "Show / Hide Window",
      switchProfile: "Switch Profile",
      switchLanguage: "Language",
      switchTheme: "Theme",
      themeAuto: "Auto",
      themeLight: "Light",
      themeDark: "Dark",
      quit: "Quit",
    };
  }
  return {
    showWindow: "显示/隐藏窗口",
    switchProfile: "切换 Profile",
    switchLanguage: "切换语言",
    switchTheme: "切换主题",
    themeAuto: "自动",
    themeLight: "明亮",
    themeDark: "暗色",
    quit: "退出",
  };
}

function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function ensureTrayThemeListener(): void {
  if (trayThemeListenerRegistered) {
    return;
  }
  nativeTheme.on("updated", () => {
    if (tray) {
      tray.setImage(getTrayIcon());
    }
  });
  trayThemeListenerRegistered = true;
}

async function loadWindowPanelSettings(): Promise<PanelSettings> {
  return loadPanelSettings(fileAccess, DEFAULT_PANEL_SETTINGS_PATH);
}

function resolveInitialWindowBounds(settings: PanelSettings): { x: number; y: number } {
  const displays = screen.getAllDisplays();
  const targetDisplay = (() => {
    if (settings.display_open_mode === "random") {
      return displays[Math.floor(Math.random() * displays.length)] ?? screen.getPrimaryDisplay();
    }
    if (settings.display_open_mode === "active-display") {
      return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    }
    return displays.find((display) => display.id === settings.last_display_id) ?? screen.getPrimaryDisplay();
  })();
  const workArea = targetDisplay.workArea;
  return {
    x: Math.round(workArea.x + (workArea.width - WINDOW_WIDTH) / 2),
    y: Math.round(workArea.y + (workArea.height - WINDOW_HEIGHT) / 2),
  };
}

function scheduleRememberWindowDisplay(): void {
  if (rememberDisplayTimer) {
    clearTimeout(rememberDisplayTimer);
  }
  rememberDisplayTimer = setTimeout(() => {
    rememberDisplayTimer = null;
    void rememberWindowDisplay();
  }, DISPLAY_REMEMBER_DELAY_MS);
}

async function rememberWindowDisplay(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  const settings = await loadWindowPanelSettings();
  if (settings.last_display_id === currentDisplay.id) {
    return;
  }
  await fileAccess.ensureDir(dirname(DEFAULT_PANEL_SETTINGS_PATH));
  await fileAccess.writeText(
    DEFAULT_PANEL_SETTINGS_PATH,
    buildPanelSettingsDocument({
      ...settings,
      last_display_id: currentDisplay.id,
    }),
  );
}

async function handleWindowCloseRequest(): Promise<void> {
  const settings = await loadWindowPanelSettings();
  if (settings.close_behavior === "keep-in-tray") {
    createTray();
    mainWindow?.hide();
    hideDockIcon();
    return;
  }
  isQuitting = true;
  app.quit();
}

async function createWindow(): Promise<void> {
  const panelSettings = await loadWindowPanelSettings();
  const initialBounds = resolveInitialWindowBounds(panelSettings);

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 12 } : undefined,
    backgroundColor: "#07111f",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(true);
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    void rememberWindowDisplay();
  });
  mainWindow.on("move", scheduleRememberWindowDisplay);
  mainWindow.on("close", (event) => {
    void rememberWindowDisplay();
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    void handleWindowCloseRequest();
  });
  mainWindow.webContents.on("did-fail-load", (_, code, description) => {
    console.error("renderer failed to load", { code, description });
    mainWindow?.show();
  });
  mainWindow.webContents.on("render-process-gone", (_, details) => {
    console.error("renderer process gone", details);
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  optimizer.watchWindowShortcuts(mainWindow);

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  setTimeout(() => {
    mainWindow?.show();
  }, WINDOW_SHOW_TIMEOUT_MS);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("cn.crazycoder.kimi-code-switch-gui");

  ipcMain.handle("app:load-state", async (_, paths) => {
    const state = await loadAppState(fileAccess, paths);
    decryptWebDavPassword(state);
    updateBackupSchedule(state);
    refreshGlobalShortcuts(state);
    if (state.panelSettings.tray_icon) {
      createTray();
    }
    void updateTrayMenu();
    return state;
  });

  ipcMain.handle("app:save-state", async (_, state: AppState) => {
    encryptWebDavPassword(state);
    await saveAppState(fileAccess, state);
    updateBackupSchedule(state);
    refreshGlobalShortcuts(state);
    queueChangeBackup(state);
    void updateTrayMenu();
    return { ok: true };
  });

  ipcMain.handle("app:preview-state", async (_, state: AppState) => {
    return buildPreviewBundle(state, {
      configDocument: await fileAccess.readText(state.configPath),
      profilesDocument: await fileAccess.readText(state.profilesPath),
      panelSettingsDocument: await fileAccess.readText(state.panelSettingsPath),
      mcpDocument: await fileAccess.readText(state.mcpConfigPath),
    });
  });
  ipcMain.handle("skills:scan", async (_, state: AppState) => {
    const normalizedState = normalizeStatePaths(state);
    return scanSkills(skillFileAccess, {
      mergeAllAvailableSkills: normalizedState.mainConfig.merge_all_available_skills,
    });
  });

  ipcMain.handle("app:default-settings", () => {
    return createDefaultPanelSettings();
  });

  ipcMain.handle("app:check-for-updates", async () => {
    return checkForUpdates(getCliEnv);
  });

  ipcMain.handle("app:get-install-source", async () => {
    return detectInstallSource(getCliEnv);
  });

  ipcMain.handle("dialog:pick-file", async (_, options): Promise<FileDialogResult> => {
    if (!mainWindow) {
      return { canceled: true };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      ...options,
    });
    return {
      canceled: result.canceled,
      filePath: result.filePaths[0],
    };
  });

  ipcMain.handle("app:open-external", async (_, url: string) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error("Invalid URL provided.");
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "mailto:") {
      throw new Error("Only HTTPS and mailto URLs can be opened.");
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("backup:run", async (_, state?: AppState) => {
    return runBackup(state);
  });

  ipcMain.handle("backup:list", async (_, state: AppState) => {
    return listBackups(state);
  });

  ipcMain.handle("backup:delete", async (_, state: AppState, backupName: string) => {
    return deleteBackup(state, backupName);
  });

  ipcMain.handle("backup:restore", async (_, state: AppState, backupName: string) => {
    return restoreBackup(state, backupName);
  });

  ipcMain.handle("backup:test-webdav", async (_, state: AppState) => {
    return testWebDavConnection(state.panelSettings);
  });

  ipcMain.handle("app:set-tray", (_, enabled: boolean) => {
    if (enabled) {
      createTray();
      void updateTrayMenu();
    } else {
      destroyTray();
    }
    return { ok: true };
  });

  ipcMain.handle("mcp:test-server", async (_, name: string) => {
    return runKimiMcpCommand(["test", name]);
  });

  ipcMain.handle("mcp:auth-server", async (_, name: string) => {
    return runKimiMcpCommand(["auth", name]);
  });

  ipcMain.handle("mcp:reset-auth", async (_, name: string) => {
    return runKimiMcpCommand(["reset-auth", name]);
  });

  ipcMain.handle("profile:test-connectivity", async (_, state: AppState, profileName: string) => {
    const draft = cloneState(state);
    applyProfile(draft, profileName);
    return runKimiConnectivityTest(draft, draft.mainConfig.default_model);
  });

  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  clearBackupSchedule();
  unregisterGlobalShortcuts();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
});
