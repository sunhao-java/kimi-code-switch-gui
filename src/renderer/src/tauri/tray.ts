// 托盘前端适配：构建动态菜单结构传给 Rust，监听点击事件执行动作。
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";

import { applyProfile, loadAppState, saveAppState } from "@shared/configStore";
import type { AppState, Locale } from "@shared/types";

import { tauriFileAccess } from "./fileAccess";

interface MenuItemSpec {
  id?: string;
  label?: string;
  separator?: boolean;
  checked?: boolean;
  submenu?: MenuItemSpec[];
}

const LOCALE_LABELS: Array<[Locale, string]> = [
  ["zh-CN", "中文"],
  ["zh-TW", "繁體中文"],
  ["en-US", "English"],
  ["ja-JP", "日本語"],
  ["de-DE", "Deutsch"],
  ["es-ES", "Español"],
];

const TRAY_LABELS: Record<Locale, { show: string; insights: string; profile: string; language: string; theme: string; auto: string; light: string; dark: string; quit: string }> = {
  "zh-CN": { show: "显示窗口", insights: "用量洞察", profile: "切换 Profile", language: "切换语言", theme: "切换主题", auto: "跟随系统", light: "浅色", dark: "深色", quit: "退出" },
  "zh-TW": { show: "顯示視窗", insights: "用量洞察", profile: "切換 Profile", language: "切換語言", theme: "切換主題", auto: "跟隨系統", light: "淺色", dark: "深色", quit: "結束" },
  "en-US": { show: "Show Window", insights: "Usage Insights", profile: "Switch Profile", language: "Language", theme: "Theme", auto: "System", light: "Light", dark: "Dark", quit: "Quit" },
  "ja-JP": { show: "ウィンドウを表示", insights: "使用状況インサイト", profile: "Profile 切替", language: "言語", theme: "テーマ", auto: "システム", light: "ライト", dark: "ダーク", quit: "終了" },
  "de-DE": { show: "Fenster anzeigen", insights: "Nutzungsanalyse", profile: "Profil wechseln", language: "Sprache", theme: "Thema", auto: "System", light: "Hell", dark: "Dunkel", quit: "Beenden" },
  "es-ES": { show: "Mostrar ventana", insights: "Análisis de uso", profile: "Cambiar perfil", language: "Idioma", theme: "Tema", auto: "Sistema", light: "Claro", dark: "Oscuro", quit: "Salir" },
};

function buildMenu(state: AppState): MenuItemSpec[] {
  const settings = state.panelSettings;
  const labels = TRAY_LABELS[settings.locale] ?? TRAY_LABELS["en-US"];
  return [
    { id: "show-window", label: labels.show },
    { id: "show-insights", label: labels.insights },
    { separator: true },
    {
      label: labels.profile,
      submenu: Object.entries(state.profiles).map(([name, profile]) => ({
        id: `profile:${name}`,
        label: profile.label ? `${profile.label} (${name})` : name,
        checked: name === state.activeProfile,
      })),
    },
    {
      label: labels.language,
      submenu: LOCALE_LABELS.map(([loc, label]) => ({
        id: `locale:${loc}`,
        label,
        checked: settings.locale === loc,
      })),
    },
    {
      label: labels.theme,
      submenu: [
        { id: "theme:auto", label: labels.auto, checked: settings.theme === "auto" },
        { id: "theme:light", label: labels.light, checked: settings.theme === "light" },
        { id: "theme:dark", label: labels.dark, checked: settings.theme === "dark" },
      ],
    },
    { separator: true },
    { id: "quit", label: labels.quit },
  ];
}

let unlisten: UnlistenFn | null = null;

/** 安装/刷新托盘。reloadState 用于动作后重建菜单。getState 提供最新 state。 */
export async function setupTray(
  getState: () => AppState | null,
  onReload: () => void,
): Promise<void> {
  const state = getState();
  if (!state || !state.panelSettings.tray_icon) {
    await invoke("set_tray", { enabled: false, menu: [], tooltip: null });
    return;
  }
  await invoke("set_tray", { enabled: true, menu: buildMenu(state), tooltip: "Kimi Code Switch GUI" });

  if (!unlisten) {
    unlisten = await listen<string>("tray://command", async (event) => {
      const action = event.payload;
      const cur = getState();
      if (!cur) return;

      if (action === "show-window") {
        await invoke("show_main_window");
      } else if (action === "show-insights") {
        await invoke("show_main_window");
        window.dispatchEvent(new Event("kimi-open-insights"));
      } else if (action === "quit") {
        await exit(0);
      } else if (action.startsWith("profile:")) {
        const name = action.slice("profile:".length);
        applyProfile(cur, name);
        await saveAppState(tauriFileAccess, cur);
        const reloaded = await loadAppState(tauriFileAccess);
        Object.assign(cur, reloaded);
        await invoke("set_tray", { enabled: true, menu: buildMenu(cur), tooltip: "Kimi Code Switch GUI" });
        onReload();
      } else if (action.startsWith("locale:")) {
        cur.panelSettings.locale = action.slice("locale:".length) as Locale;
        await saveAppState(tauriFileAccess, cur);
        await invoke("set_tray", { enabled: true, menu: buildMenu(cur), tooltip: "Kimi Code Switch GUI" });
        onReload();
      } else if (action.startsWith("theme:")) {
        cur.panelSettings.theme = action.slice("theme:".length) as AppState["panelSettings"]["theme"];
        await saveAppState(tauriFileAccess, cur);
        await invoke("set_tray", { enabled: true, menu: buildMenu(cur), tooltip: "Kimi Code Switch GUI" });
        onReload();
      }
    });
  }
}

export async function teardownTray(): Promise<void> {
  await invoke("set_tray", { enabled: false, menu: [], tooltip: null });
}
