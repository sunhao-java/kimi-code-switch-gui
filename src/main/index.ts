import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from "electron";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { electronApp, is, optimizer } from "@electron-toolkit/utils";

import {
  applyProfile,
  buildConfigDocument,
  buildProfilesDocument,
  buildPanelSettingsDocument,
  buildPreviewBundle,
  cloneState,
  createDefaultPanelSettings,
  DEFAULT_CONFIG_PATH,
  normalizeStatePaths,
  PANEL_SETTINGS_FILENAME,
  loadAppState,
  loadPanelSettings,
  saveAppState,
} from "@shared/configStore";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import type { AppState, BackupFrequency, BackupRecord, BackupResult, FileDialogResult, Locale, PanelSettings, TrayCommand } from "@shared/types";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let rememberDisplayTimer: NodeJS.Timeout | null = null;
let scheduledBackupTimer: NodeJS.Timeout | null = null;
let changeBackupTimer: NodeJS.Timeout | null = null;
let latestAppState: AppState | null = null;
let backupInFlight = false;
let isQuitting = false;

const WINDOW_WIDTH = 1500;
const WINDOW_HEIGHT = 980;
const DEFAULT_PANEL_SETTINGS_PATH = DEFAULT_CONFIG_PATH.replace("config.toml", PANEL_SETTINGS_FILENAME);
const CHANGE_BACKUP_DELAY_MS = 4000;
const execFileAsync = promisify(execFile);

const resolveHome = (value: string): string =>
  value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;

const fileAccess = {
  async readText(path: string): Promise<string | null> {
    try {
      return await readFile(resolveHome(path), "utf-8");
    } catch {
      return null;
    }
  },
  async writeText(path: string, content: string): Promise<void> {
    await writeFile(resolveHome(path), content, "utf-8");
  },
  async ensureDir(path: string): Promise<void> {
    await mkdir(resolveHome(path), { recursive: true });
  },
};

async function runKimiMcpCommand(args: string[]): Promise<{ ok: true; stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("kimi", ["mcp", ...args], {
    windowsHide: true,
  });
  return {
    ok: true,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function runKimiConnectivityTest(state: AppState, modelName: string): Promise<{ ok: true; stdout: string; stderr: string }> {
  const configDocument = buildConfigDocument(state);
  const { stdout, stderr } = await execFileAsync(
    "kimi",
    [
      "--config",
      configDocument,
      "--model",
      modelName,
      "--quiet",
      "--print",
      "--command",
      "Reply with exactly OK.",
    ],
    {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return {
    ok: true,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
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

function buildBackupFiles(state: AppState): Array<{ name: string; content: string }> {
  const normalizedState = normalizeStatePaths(state);
  return [
    { name: "config.toml", content: buildConfigDocument(normalizedState) },
    { name: "config.profiles.toml", content: buildProfilesDocument(normalizedState) },
    { name: "config.panel.toml", content: buildPanelSettingsDocument(normalizedState.panelSettings) },
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

function getWebDavAuthHeader(settings: PanelSettings): string {
  const credentials = `${settings.backup_webdav_username}:${settings.backup_webdav_password}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function getWebDavBaseUrl(settings: PanelSettings): string {
  const baseUrl = settings.backup_webdav_url.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("WebDAV URL is required.");
  }
  return baseUrl;
}

function getWebDavPathSegments(settings: PanelSettings, additionalSegments: string[] = []): string[] {
  const segments = settings.backup_webdav_path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return [...segments, ...additionalSegments];
}

function buildWebDavUrl(settings: PanelSettings, additionalSegments: string[] = []): string {
  const baseUrl = getWebDavBaseUrl(settings);
  const segments = getWebDavPathSegments(settings, additionalSegments).map(encodeURIComponent);
  return segments.length ? `${baseUrl}/${segments.join("/")}` : baseUrl;
}

async function ensureWebDavCollection(settings: PanelSettings, additionalSegments: string[] = []): Promise<string> {
  let currentUrl = getWebDavBaseUrl(settings);
  const headers = new Headers({
    Authorization: getWebDavAuthHeader(settings),
  });

  for (const segment of getWebDavPathSegments(settings, additionalSegments)) {
    currentUrl = `${currentUrl}/${encodeURIComponent(segment)}`;
    const response = await fetch(currentUrl, {
      method: "MKCOL",
      headers,
    });
    if (![200, 201, 204, 301, 405].includes(response.status)) {
      throw new Error(`WebDAV MKCOL failed: ${response.status} ${response.statusText}`);
    }
  }

  return currentUrl;
}

async function uploadWebDavFile(settings: PanelSettings, url: string, content: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
      "Content-Type": "application/octet-stream",
    },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`WebDAV upload failed: ${response.status} ${response.statusText}`);
  }
}

async function deleteWebDavPath(settings: PanelSettings, url: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
    },
  });

  if (![200, 204, 404].includes(response.status)) {
    throw new Error(`WebDAV delete failed: ${response.status} ${response.statusText}`);
  }
}

async function readWebDavManifest(settings: PanelSettings, manifestUrl: string): Promise<Array<{ name: string; createdAt: string }>> {
  const response = await fetch(manifestUrl, {
    method: "GET",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
    },
  });

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`WebDAV manifest read failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { backups?: Array<{ name?: string; createdAt?: string }> };
  return Array.isArray(payload.backups)
    ? payload.backups
        .filter((entry) => typeof entry.name === "string" && typeof entry.createdAt === "string")
        .map((entry) => ({ name: entry.name as string, createdAt: entry.createdAt as string }))
    : [];
}

async function pruneWebDavBackups(
  settings: PanelSettings,
  manifestUrl: string,
  currentEntries: Array<{ name: string; createdAt: string }>,
): Promise<void> {
  const obsoleteEntries = [...currentEntries]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(settings.backup_retention_count);

  await Promise.all(
    obsoleteEntries.map((entry) => deleteWebDavPath(settings, buildWebDavUrl(settings, [entry.name]))),
  );

  const keptEntries = [...currentEntries]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, settings.backup_retention_count);

  await uploadWebDavFile(settings, manifestUrl, JSON.stringify({ backups: keptEntries }, null, 2));
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
  const backupName = `backup-${formatBackupStamp(new Date())}`;

  if (normalizedState.panelSettings.backup_destination_type === "webdav") {
    return createWebDavBackupSnapshot(normalizedState, backupName);
  }

  return createLocalBackupSnapshot(normalizedState, backupName);
}

function sortBackupRecords(records: BackupRecord[]): BackupRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.createdAt !== right.createdAt) {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return right.name.localeCompare(left.name);
  });
}

async function listLocalBackups(state: AppState): Promise<BackupRecord[]> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(backupRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
      .map(async (entry) => {
        const backupPath = join(backupRoot, entry.name);
        const [stats, files] = await Promise.all([
          stat(backupPath),
          readdir(backupPath).catch(() => [] as string[]),
        ]);

        return {
          name: entry.name,
          createdAt: stats.mtime.toISOString(),
          path: backupPath,
          itemCount: files.length,
        } satisfies BackupRecord;
      }),
  );

  return sortBackupRecords(records);
}

async function listWebDavBackups(state: AppState): Promise<BackupRecord[]> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const manifestUrl = `${buildWebDavUrl(settings)}/.kimi-backups.json`;
  const manifestEntries = await readWebDavManifest(settings, manifestUrl);

  return sortBackupRecords(
    manifestEntries.map((entry) => ({
      name: entry.name,
      createdAt: entry.createdAt,
      path: buildWebDavUrl(settings, [entry.name]),
    })),
  );
}

async function listBackups(state?: AppState): Promise<BackupRecord[]> {
  const sourceState = state
    ? normalizeStatePaths(state)
    : latestAppState
      ? cloneState(latestAppState)
      : await loadAppState(fileAccess);

  if (sourceState.panelSettings.backup_destination_type === "webdav") {
    return listWebDavBackups(sourceState);
  }

  return listLocalBackups(sourceState);
}

async function deleteLocalBackup(state: AppState, backupName: string): Promise<void> {
  const normalizedState = normalizeStatePaths(state);
  const backupRoot = resolveHome(normalizedState.panelSettings.backup_local_path);
  await rm(join(backupRoot, backupName), { recursive: true, force: true });
}

async function deleteWebDavBackup(state: AppState, backupName: string): Promise<void> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  await deleteWebDavPath(settings, buildWebDavUrl(settings, [backupName]));

  const manifestUrl = `${buildWebDavUrl(settings)}/.kimi-backups.json`;
  const manifestEntries = await readWebDavManifest(settings, manifestUrl);
  const keptEntries = manifestEntries.filter((entry) => entry.name !== backupName);
  await uploadWebDavFile(settings, manifestUrl, JSON.stringify({ backups: keptEntries }, null, 2));
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

const BACKUP_FILE_TARGETS: Array<{
  name: string;
  resolveTarget: (state: AppState) => string;
}> = [
  { name: "config.toml", resolveTarget: (state) => state.configPath },
  { name: "config.profiles.toml", resolveTarget: (state) => state.profilesPath },
  { name: "config.panel.toml", resolveTarget: (state) => state.panelSettingsPath },
  { name: "mcp.json", resolveTarget: (state) => state.mcpConfigPath },
];

async function readBackupFilesFromLocal(
  state: AppState,
  backupName: string,
): Promise<Array<{ name: string; content: string }>> {
  const backupRoot = resolveHome(state.panelSettings.backup_local_path);
  const backupDirectory = join(backupRoot, backupName);
  const results = await Promise.all(
    BACKUP_FILE_TARGETS.map(async (entry) => {
      try {
        const content = await readFile(join(backupDirectory, entry.name), "utf-8");
        return { name: entry.name, content };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    }),
  );
  return results.filter((entry): entry is { name: string; content: string } => entry !== null);
}

async function downloadWebDavFile(settings: PanelSettings, url: string): Promise<string | null> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
    },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`WebDAV download failed: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function readBackupFilesFromWebDav(
  state: AppState,
  backupName: string,
): Promise<Array<{ name: string; content: string }>> {
  const settings = state.panelSettings;
  const results = await Promise.all(
    BACKUP_FILE_TARGETS.map(async (entry) => {
      const url = buildWebDavUrl(settings, [backupName, entry.name]);
      const content = await downloadWebDavFile(settings, url);
      return content === null ? null : { name: entry.name, content };
    }),
  );
  return results.filter((entry): entry is { name: string; content: string } => entry !== null);
}

async function restoreBackup(state: AppState, backupName: string): Promise<AppState> {
  if (backupInFlight) {
    throw new Error("A backup is in progress. Wait for it to finish before restoring.");
  }

  const normalizedState = normalizeStatePaths(state);
  const files =
    normalizedState.panelSettings.backup_destination_type === "webdav"
      ? await readBackupFilesFromWebDav(normalizedState, backupName)
      : await readBackupFilesFromLocal(normalizedState, backupName);

  if (files.length === 0) {
    throw new Error(`Backup "${backupName}" has no restorable files.`);
  }

  const targetByName = new Map(
    BACKUP_FILE_TARGETS.map((entry) => [entry.name, entry.resolveTarget(normalizedState)]),
  );

  await Promise.all(
    files.map(async (file) => {
      const target = targetByName.get(file.name);
      if (!target) return;
      await fileAccess.ensureDir(dirname(resolveHome(target)));
      await fileAccess.writeText(target, file.content);
    }),
  );

  const restored = await loadAppState(fileAccess);
  updateBackupSchedule(restored);
  return restored;
}

async function testWebDavConnection(state: AppState): Promise<{ ok: true; target: string }> {
  const normalizedState = normalizeStatePaths(state);
  const settings = normalizedState.panelSettings;
  const target = buildWebDavUrl(settings);
  const response = await fetch(target, {
    method: "PROPFIND",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
      Depth: "0",
    },
  });

  if (response.status === 404) {
    const ensuredTarget = await ensureWebDavCollection(settings);
    return {
      ok: true,
      target: ensuredTarget,
    };
  }

  if (!response.ok) {
    throw new Error(`WebDAV test failed: ${response.status} ${response.statusText}`);
  }

  return {
    ok: true,
    target,
  };
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

function getTrayIcon(): nativeImage {
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

  nativeTheme.on("updated", () => {
    if (tray) {
      tray.setImage(getTrayIcon());
    }
  });
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

function sendTrayCommand(command: TrayCommand): void {
  if (!mainWindow) {
    void createWindow().then(() => {
      queueTrayCommand(command);
    });
    return;
  }
  showMainWindow();
  queueTrayCommand(command);
}

function queueTrayCommand(command: TrayCommand): void {
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
    { type: "separator" },
    {
      label: labels.quit,
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

function getTrayLabels(locale: Locale): Record<"showWindow" | "switchProfile" | "quit", string> {
  if (locale === "en-US") {
    return {
      showWindow: "Show Window",
      switchProfile: "Switch Profile",
      quit: "Quit",
    };
  }
  return {
    showWindow: "显示窗口",
    switchProfile: "切换 Profile",
    quit: "退出",
  };
}

function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
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
  }, 400);
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
  mainWindow.webContents.on("before-input-event", (_, input) => {
    if (input.type === "keyDown") {
      optimizer.watchWindowShortcuts(mainWindow!);
    }
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  setTimeout(() => {
    mainWindow?.show();
  }, 1500);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("cn.crazycoder.kimi-code-switch-gui");

  ipcMain.handle("app:load-state", async (_, paths) => {
    const state = await loadAppState(fileAccess, paths);
    updateBackupSchedule(state);
    if (state.panelSettings.tray_icon) {
      createTray();
    }
    void updateTrayMenu();
    return state;
  });

  ipcMain.handle("app:save-state", async (_, state: AppState) => {
    await saveAppState(fileAccess, state);
    updateBackupSchedule(state);
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

  ipcMain.handle("app:default-settings", () => {
    return createDefaultPanelSettings();
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
    if (!url.startsWith("https://")) {
      throw new Error("Only HTTPS URLs can be opened.");
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("backup:run", async (_, state?: AppState) => {
    return runBackup(state);
  });

  ipcMain.handle("backup:list", async (_, state?: AppState) => {
    return listBackups(state);
  });

  ipcMain.handle("backup:delete", async (_, state: AppState, backupName: string) => {
    return deleteBackup(state, backupName);
  });

  ipcMain.handle("backup:restore", async (_, state: AppState, backupName: string) => {
    return restoreBackup(state, backupName);
  });

  ipcMain.handle("backup:test-webdav", async (_, state: AppState) => {
    return testWebDavConnection(state);
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
