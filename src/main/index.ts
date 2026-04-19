import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from "electron";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { electronApp, is, optimizer } from "@electron-toolkit/utils";

import {
  applyProfile,
  buildPanelSettingsDocument,
  buildPreviewBundle,
  createDefaultPanelSettings,
  DEFAULT_CONFIG_PATH,
  PANEL_SETTINGS_FILENAME,
  loadAppState,
  loadPanelSettings,
  saveAppState,
} from "@shared/configStore";
import type { AppState, FileDialogResult, Locale, PanelSettings, TrayCommand } from "@shared/types";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let rememberDisplayTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

const WINDOW_WIDTH = 1500;
const WINDOW_HEIGHT = 980;
const DEFAULT_PANEL_SETTINGS_PATH = DEFAULT_CONFIG_PATH.replace("config.toml", PANEL_SETTINGS_FILENAME);

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
    if (state.panelSettings.tray_icon) {
      createTray();
    }
    void updateTrayMenu();
    return state;
  });

  ipcMain.handle("app:save-state", async (_, state: AppState) => {
    await saveAppState(fileAccess, state);
    void updateTrayMenu();
    return { ok: true };
  });

  ipcMain.handle("app:preview-state", async (_, state: AppState) => {
    return buildPreviewBundle(state, {
      configDocument: await fileAccess.readText(state.configPath),
      profilesDocument: await fileAccess.readText(state.profilesPath),
      panelSettingsDocument: await fileAccess.readText(state.panelSettingsPath),
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

  ipcMain.handle("app:set-tray", (_, enabled: boolean) => {
    if (enabled) {
      createTray();
      void updateTrayMenu();
    } else {
      destroyTray();
    }
    return { ok: true };
  });

  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
