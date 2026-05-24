import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, safeStorage, screen, Tray } from "electron";
import type { NativeImage } from "electron";
import { basename, dirname, join, resolve } from "node:path";
import { hostname } from "node:os";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { electronApp, is, optimizer } from "@electron-toolkit/utils";

import {
  applyProfile,
  buildConfigDocument,
  buildProfilesDocument,
  buildPanelSettingsDocument,
  cloneState,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PANEL_DIRECTORY,
  DEFAULT_PANEL_SETTINGS_PATH,
  LEGACY_PANEL_SETTINGS_PATH,
  normalizeStatePaths,
  loadAppState,
  loadPanelSettings,
  saveAppState,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildManagedDocuments } from "@shared/configSafety";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import { normalizeShortcuts } from "@shared/shortcutStore";
import type { ManagedFileId } from "@shared/types";
import { captureSnapshotForState, detectExternalChangeConflict, resolveManagedPaths } from "./modules/fileSnapshots";
import { markSelfWrite, startWatching, stopWatching, updateBaseline } from "./modules/fileWatcher";
import { fileAccess, resolveHome, skillFileAccess } from "./modules/fileAccess";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./modules/shortcuts";
import {
  buildWebDavUrl,
  deleteWebDavPath,
  ensureWebDavCollection,
  getWebDavAuthHeader,
  pruneWebDavBackups,
  readWebDavManifest,
  uploadWebDavFile,
} from "./modules/webdav";
import { registerStateIpc } from "./modules/stateIpc";
import { registerDialogIpc } from "./modules/dialogIpc";
import { registerCliIpc } from "./modules/cliIpc";
import { registerBackupIpc } from "./modules/backupIpc";
import { registerTrayIpc } from "./modules/trayIpc";
import { registerMcpProfileIpc } from "./modules/mcpProfileIpc";
import { registerUsageIpc } from "./modules/usageIpc";
import { getTrayLabels } from "./modules/trayLabels";
import { openKimiInTerminal } from "./modules/terminal";
import { UsageDb } from "./modules/usageDb";
import { UsageLogWatcher } from "./modules/usageLogWatcher";
import { ingestPending } from "./modules/usageIngest";
import { normalizeInsightsSettings } from "@shared/usageStore";
import type { InsightsSettings } from "@shared/usageTypes";
import type {
  AppState,
  AppearanceMode,
  BackupMetadata,
  BackupFrequency,
  BackupRecord,
  BackupResult,
  FileSnapshotBundle,
  Locale,
  PanelSettings,
  SaveStateConflictResult,
  SaveStateResult,
} from "@shared/types";

if (process.platform === "darwin") {
  // Suppress noisy Chromium CoreVideo display-link errors caused by transient macOS display states.
  app.commandLine.appendSwitch("log-level", "3");
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let rememberDisplayTimer: NodeJS.Timeout | null = null;
let scheduledBackupTimer: NodeJS.Timeout | null = null;
let changeBackupTimer: NodeJS.Timeout | null = null;
let latestAppState: AppState | null = null;
let backupInFlight = false;
let isQuitting = false;
let trayThemeListenerRegistered = false;
let usageDb: UsageDb | null = null;
let usageLogWatcher: UsageLogWatcher | null = null;
let usageIngestTimer: NodeJS.Timeout | null = null;

const WINDOW_WIDTH = 1500;
const WINDOW_HEIGHT = 980;
const WINDOW_SHOW_TIMEOUT_MS = 1500;
const DISPLAY_REMEMBER_DELAY_MS = 400;
const CHANGE_BACKUP_DELAY_MS = 4000;

const ENCRYPTED_PASSWORD_PREFIX = "__enc__";
const SHORTCUTS_BACKUP_FILENAME = "shortcuts.json";
const BACKUP_METADATA_FILENAME = "backup.meta.json";
const BACKUP_TEMP_DIRECTORY = `${DEFAULT_PANEL_DIRECTORY}/tmp/backups`;
const INITIAL_THEME_ARG_PREFIX = "--kimi-initial-theme=";
const INITIAL_APPEARANCE_THEME_ARG_PREFIX = "--kimi-appearance-theme=";

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

function buildBackupMetadata(
  state: AppState,
  backupName: string,
  trigger: BackupMetadata["trigger"],
): BackupMetadata {
  const normalizedState = normalizeStatePaths(state);
  return {
    name: backupName,
    createdAt: new Date().toISOString(),
    trigger,
    sourceHost: sanitizeMachineName(hostname()),
    paths: {
      config: resolveHome(normalizedState.configPath),
      profiles: resolveHome(normalizedState.profilesPath),
      panel: resolveHome(normalizedState.panelSettingsPath),
      mcp: resolveHome(normalizedState.mcpConfigPath),
    },
  };
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

async function createBackupWorkingDirectory(backupName: string): Promise<string> {
  const workingRoot = resolveHome(BACKUP_TEMP_DIRECTORY);
  const workingDirectory = join(workingRoot, backupName);
  await rm(workingDirectory, { recursive: true, force: true });
  await mkdir(workingDirectory, { recursive: true });
  return workingDirectory;
}

async function writeBackupWorkingFiles(
  workingDirectory: string,
  files: Array<{ name: string; content: string }>,
  metadata: BackupMetadata,
): Promise<void> {
  await Promise.all(
    [
      ...files.map((file) => writeFile(join(workingDirectory, file.name), file.content, "utf-8")),
      writeFile(join(workingDirectory, BACKUP_METADATA_FILENAME), `${JSON.stringify(metadata, null, 2)}\n`, "utf-8"),
    ],
  );
}

async function createLocalBackupSnapshot(
  state: AppState,
  backupName: string,
  trigger: BackupMetadata["trigger"],
): Promise<BackupResult> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  const backupDirectory = join(backupRoot, backupName);
  const files = buildBackupFiles(normalizedState);
  const metadata = buildBackupMetadata(normalizedState, backupName, trigger);
  const workingDirectory = await createBackupWorkingDirectory(backupName);

  try {
    await writeBackupWorkingFiles(workingDirectory, files, metadata);
    await mkdir(backupRoot, { recursive: true });
    await rm(backupDirectory, { recursive: true, force: true });
    await rename(workingDirectory, backupDirectory);
    await pruneBackupDirectories(backupRoot, normalizedState.panelSettings.backup_retention_count);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  return {
    ok: true,
    backupPath: backupDirectory,
    files: files.map((file) => join(backupDirectory, file.name)),
  };
}

async function createWebDavBackupSnapshot(
  state: AppState,
  backupName: string,
  trigger: BackupMetadata["trigger"],
): Promise<BackupResult> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const files = buildBackupFiles(normalizedState);
  const metadata = buildBackupMetadata(normalizedState, backupName, trigger);
  const workingDirectory = await createBackupWorkingDirectory(backupName);
  let backupDirectoryUrl = "";

  try {
    await writeBackupWorkingFiles(workingDirectory, files, metadata);

    backupDirectoryUrl = await ensureWebDavCollection(settings, [backupName]);
    await Promise.all(
      [
        ...files.map(async (file) => uploadWebDavFile(
          settings,
          `${backupDirectoryUrl}/${encodeURIComponent(file.name)}`,
          await readFile(join(workingDirectory, file.name), "utf-8"),
        )),
        uploadWebDavFile(
          settings,
          `${backupDirectoryUrl}/${encodeURIComponent(BACKUP_METADATA_FILENAME)}`,
          await readFile(join(workingDirectory, BACKUP_METADATA_FILENAME), "utf-8"),
        ),
      ],
    );

    const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
    const manifestEntries = await readWebDavManifest(settings, manifestUrl);
    const nextEntries = [
      ...manifestEntries.filter((entry) => entry.name !== backupName),
      { name: backupName, createdAt: backupName },
    ];
    await pruneWebDavBackups(settings, manifestUrl, nextEntries);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  return {
    ok: true,
    backupPath: backupDirectoryUrl,
    files: files.map((file) => `${backupDirectoryUrl}/${encodeURIComponent(file.name)}`),
  };
}

async function createBackupSnapshot(
  state: AppState,
  trigger: BackupMetadata["trigger"] = "manual",
): Promise<BackupResult & { backupName: string }> {
  const normalizedState = normalizeStatePaths(state);
  const backupName = `backup-${formatBackupStamp(new Date())}-${sanitizeMachineName(hostname())}`;

  if (normalizedState.panelSettings.backup_destination_type === "webdav") {
    return {
      ...(await createWebDavBackupSnapshot(normalizedState, backupName, trigger)),
      backupName,
    };
  }

  return {
    ...(await createLocalBackupSnapshot(normalizedState, backupName, trigger)),
    backupName,
  };
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
            itemCount: files.filter((file) => file !== BACKUP_METADATA_FILENAME).length,
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
    await createBackupSnapshot(latestAppState, "scheduled");
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
    await createBackupSnapshot(latestAppState, "on-change");
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
    const result = await createBackupSnapshot(sourceState, "manual");
    updateBackupSchedule(sourceState);
    return result;
  } finally {
    backupInFlight = false;
  }
}

async function saveStateWithSafety(
  state: AppState,
  options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
): Promise<SaveStateResult | SaveStateConflictResult> {
  const normalizedState = normalizeStatePaths(state);

  // 保留 main 进程已有的洞察设置（防止被渲染进程的旧 state 覆盖）
  if (latestAppState) {
    normalizedState.panelSettings.insights_status = latestAppState.panelSettings.insights_status;
    normalizedState.panelSettings.insights_proxy_port = latestAppState.panelSettings.insights_proxy_port;
    normalizedState.panelSettings.insights_retention_days = latestAppState.panelSettings.insights_retention_days;
    normalizedState.panelSettings.insights_disk_warn_threshold_mb = latestAppState.panelSettings.insights_disk_warn_threshold_mb;
    normalizedState.panelSettings.insights_store_prompt_preview = latestAppState.panelSettings.insights_store_prompt_preview;
    normalizedState.panelSettings.insights_onboarding_shown_at = latestAppState.panelSettings.insights_onboarding_shown_at;
    normalizedState.panelSettings.insights_last_known_port = latestAppState.panelSettings.insights_last_known_port;
  }

  const draftDocuments = buildManagedDocuments(normalizedState);
  const targetPaths = resolveManagedPaths(normalizedState);
  const doctor = buildConfigDoctorReport(normalizedState);

  // 移除冲突检测，直接保存
  // 如果文件被外部修改，文件监听器会自动重新加载

  encryptWebDavPassword(normalizedState);
  for (const id of Object.keys(targetPaths) as ManagedFileId[]) {
    markSelfWrite(id);
  }
  await saveAppState(fileAccess, normalizedState);
  // 更新 latestAppState 以反映最新保存的状态
  latestAppState = cloneState(normalizedState);
  void updateBaseline();
  updateBackupSchedule(normalizedState);
  refreshGlobalShortcuts(normalizedState);
  queueChangeBackup(normalizedState);
  void updateTrayMenu();

  return {
    ok: true,
    snapshot: await captureSnapshotForState(normalizedState),
    doctor,
  };
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

function onExternalFileChange(changedFileIds: ManagedFileId[]): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const paths = latestAppState ? resolveManagedPaths(latestAppState) : null;
  const changedFileNames = changedFileIds.map((id) => paths ? basename(resolveHome(paths[id])) : id);
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("file:external-change", { changedFileIds, changedFileNames });
    });
    return;
  }
  mainWindow.webContents.send("file:external-change", { changedFileIds, changedFileNames });
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
          label: "繁體中文",
          type: "radio" as const,
          checked: settings.locale === "zh-TW",
          click: () => void updateLocaleFromTray("zh-TW"),
        },
        {
          label: "English",
          type: "radio" as const,
          checked: settings.locale === "en-US",
          click: () => void updateLocaleFromTray("en-US"),
        },
        {
          label: "日本語",
          type: "radio" as const,
          checked: settings.locale === "ja-JP",
          click: () => void updateLocaleFromTray("ja-JP"),
        },
        {
          label: "Deutsch",
          type: "radio" as const,
          checked: settings.locale === "de-DE",
          click: () => void updateLocaleFromTray("de-DE"),
        },
        {
          label: "Español",
          type: "radio" as const,
          checked: settings.locale === "es-ES",
          click: () => void updateLocaleFromTray("es-ES"),
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
  if (!tray) return;
  tray.setContextMenu(contextMenu);
}

async function activateProfileFromTray(profileName: string): Promise<void> {
  const state = await loadAppState(fileAccess);
  applyProfile(state, profileName);
  for (const id of Object.keys(resolveManagedPaths(state)) as ManagedFileId[]) {
    markSelfWrite(id);
  }
  await saveAppState(fileAccess, state);
  void updateBaseline();
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
  for (const id of Object.keys(resolveManagedPaths(state)) as ManagedFileId[]) {
    markSelfWrite(id);
  }
  await saveAppState(fileAccess, state);
  void updateBaseline();
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
  for (const id of Object.keys(resolveManagedPaths(state)) as ManagedFileId[]) {
    markSelfWrite(id);
  }
  await saveAppState(fileAccess, state);
  void updateBaseline();
  latestAppState = cloneState(normalizeStatePaths(state));
  await updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    queueTrayCommand("reload");
  }
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

async function migrateLegacyPanelSettingsFile(): Promise<void> {
  const existingPanelSettings = await fileAccess.readText(DEFAULT_PANEL_SETTINGS_PATH);
  if (existingPanelSettings?.trim()) {
    return;
  }
  const legacyPanelSettings = await fileAccess.readText(LEGACY_PANEL_SETTINGS_PATH);
  if (!legacyPanelSettings?.trim()) {
    return;
  }
  await fileAccess.ensureDir(dirname(DEFAULT_PANEL_SETTINGS_PATH));
  await fileAccess.writeText(DEFAULT_PANEL_SETTINGS_PATH, legacyPanelSettings);
}

function resolveRendererTheme(theme: AppearanceMode): "dark" | "light" {
  if (theme === "auto") {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }
  return theme;
}

function getWindowBackgroundColor(theme: AppearanceMode): string {
  return resolveRendererTheme(theme) === "light" ? "#edf3fb" : "#07111f";
}

function getInitialAppearanceTheme(settings: PanelSettings): string {
  return settings.appearance_theme ?? "aurora";
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
  const nextSettings: PanelSettings = {
    ...settings,
    last_display_id: currentDisplay.id,
  };
  markSelfWrite("panel");
  await fileAccess.ensureDir(dirname(DEFAULT_PANEL_SETTINGS_PATH));
  await fileAccess.writeText(
    DEFAULT_PANEL_SETTINGS_PATH,
    buildPanelSettingsDocument(nextSettings),
  );
  if (latestAppState) {
    latestAppState = cloneState({
      ...latestAppState,
      panelSettings: nextSettings,
    });
  }
  await updateBaseline();
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
  const initialRendererTheme = resolveRendererTheme(panelSettings.theme);
  const initialAppearanceTheme = getInitialAppearanceTheme(panelSettings);

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
    backgroundColor: getWindowBackgroundColor(panelSettings.theme),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      additionalArguments: [
        `${INITIAL_THEME_ARG_PREFIX}${initialRendererTheme}`,
        `${INITIAL_APPEARANCE_THEME_ARG_PREFIX}${initialAppearanceTheme}`,
      ],
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("cn.crazycoder.kimi-code-switch-gui");
  await migrateLegacyPanelSettingsFile();

  registerStateIpc(ipcMain, {
    fileAccess,
    skillFileAccess,
    decryptWebDavPassword,
    saveStateWithSafety,
    updateBackupSchedule,
    refreshGlobalShortcuts,
    createTray,
    updateTrayMenu,
    onExternalFileChange,
  });

  registerCliIpc(ipcMain);

  registerDialogIpc(ipcMain, {
    getMainWindow: () => mainWindow,
    openKimiInTerminal,
  });

  registerBackupIpc(ipcMain, {
    runBackup,
    listBackups,
    deleteBackup,
    createBackupSnapshot,
    loadAppState: (paths?) => loadAppState(fileAccess, paths),
    decryptWebDavPassword,
    updateBackupSchedule,
    refreshGlobalShortcuts,
    cloneState,
    updateBaseline,
    updateTrayMenu,
    setLatestAppState: (state) => { latestAppState = state; },
    captureSnapshotForState,
  });

  registerTrayIpc(ipcMain, {
    createTray,
    destroyTray,
    updateTrayMenu,
  });

  registerMcpProfileIpc(ipcMain);

  registerUsageIpc(ipcMain, {
    getLogWatcher: () => usageLogWatcher,
    getDb: () => usageDb,
    getAppState: () => latestAppState,
    enableInsights: async () => {
      try {
        if (!latestAppState) {
          return { ok: false, message: "app state not loaded" };
        }
        if (!usageDb) {
          usageDb = await UsageDb.open({ dbPath: "~/.kimi/usage/index.db" });
        }
        if (!usageLogWatcher) {
          usageLogWatcher = new UsageLogWatcher({
            getActiveProfile: () => latestAppState?.activeProfile ?? "default",
            db: usageDb,
          });
        }
        await usageLogWatcher.start();
        latestAppState.panelSettings.insights_status = "enabled";
        latestAppState.panelSettings.insights_last_known_port = null;
        markSelfWrite("panel");
        await saveAppState(fileAccess, latestAppState);
        void updateBaseline();
        startUsageIngest();
        return { ok: true };
      } catch (err) {
        return { ok: false, message: String(err) };
      }
    },
    disableInsights: async () => {
      if (usageLogWatcher) {
        usageLogWatcher.stop();
        usageLogWatcher = null;
        stopUsageIngest();
      }
      if (latestAppState) {
        latestAppState.panelSettings.insights_status = "disabled";
        markSelfWrite("panel");
        await saveAppState(fileAccess, latestAppState);
        void updateBaseline();
      }
      return { ok: true };
    },
    pauseInsights: async () => {
      if (usageLogWatcher) {
        usageLogWatcher.stop();
        usageLogWatcher = null;
        stopUsageIngest();
      }
      if (latestAppState) {
        latestAppState.panelSettings.insights_status = "paused";
        markSelfWrite("panel");
        await saveAppState(fileAccess, latestAppState);
        void updateBaseline();
      }
      return { ok: true };
    },
    updateInsightsSettings: async (patch: Partial<InsightsSettings>) => {
      if (!latestAppState) throw new Error("app state not loaded");
      const current = extractInsightsSettings(latestAppState);
      const updated = normalizeInsightsSettings({ ...current, ...patch });
      latestAppState.panelSettings.insights_status = updated.insights_status;
      latestAppState.panelSettings.insights_proxy_port = updated.insights_proxy_port;
      latestAppState.panelSettings.insights_retention_days = updated.insights_retention_days;
      latestAppState.panelSettings.insights_disk_warn_threshold_mb = updated.insights_disk_warn_threshold_mb;
      latestAppState.panelSettings.insights_store_prompt_preview = updated.insights_store_prompt_preview;
      latestAppState.panelSettings.insights_onboarding_shown_at = updated.insights_onboarding_shown_at;
      latestAppState.panelSettings.insights_last_known_port = updated.insights_last_known_port;
      markSelfWrite("panel");
      await saveAppState(fileAccess, latestAppState);
      void updateBaseline();
      return updated;
    },
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
  stopWatching();
  unregisterGlobalShortcuts();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  destroyTray();
  stopWatching();
  unregisterGlobalShortcuts();
  stopUsageIngest();
  if (usageLogWatcher) {
    usageLogWatcher.stop();
  }
  if (usageDb) {
    usageDb.close();
  }
});

function extractInsightsSettings(state: AppState): InsightsSettings {
  const ps = state.panelSettings;
  return {
    insights_status: ps.insights_status ?? "disabled",
    insights_proxy_port: ps.insights_proxy_port ?? "auto",
    insights_retention_days: ps.insights_retention_days ?? 90,
    insights_disk_warn_threshold_mb: ps.insights_disk_warn_threshold_mb ?? 100,
    insights_store_prompt_preview: ps.insights_store_prompt_preview ?? false,
    insights_onboarding_shown_at: ps.insights_onboarding_shown_at ?? "",
    insights_last_known_port: ps.insights_last_known_port ?? null,
  };
}

function startUsageIngest(): void {
  stopUsageIngest();
  usageIngestTimer = setInterval(() => {
    if (usageDb) {
      void ingestPending(usageDb, "~/.kimi/usage").catch((err) => {
        console.error("usage ingest failed", err);
      });
    }
  }, 60000);
}

function stopUsageIngest(): void {
  if (usageIngestTimer) {
    clearInterval(usageIngestTimer);
    usageIngestTimer = null;
  }
}
