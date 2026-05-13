import type { Locale } from "@shared/types";

export type TrayLabelKey =
  | "showWindow" | "switchProfile" | "switchLanguage" | "switchTheme"
  | "themeAuto" | "themeLight" | "themeDark" | "quit";

export type TrayLabels = Record<TrayLabelKey, string>;

const TRAY_LABELS: Record<Locale, TrayLabels> = {
  "zh-CN": {
    showWindow: "显示/隐藏窗口", switchProfile: "切换 Profile", switchLanguage: "切换语言",
    switchTheme: "切换主题", themeAuto: "自动", themeLight: "明亮", themeDark: "暗色", quit: "退出",
  },
  "zh-TW": {
    showWindow: "顯示/隱藏視窗", switchProfile: "切換 Profile", switchLanguage: "切換語言",
    switchTheme: "切換主題", themeAuto: "自動", themeLight: "明亮", themeDark: "深色", quit: "退出",
  },
  "en-US": {
    showWindow: "Show / Hide Window", switchProfile: "Switch Profile", switchLanguage: "Language",
    switchTheme: "Theme", themeAuto: "Auto", themeLight: "Light", themeDark: "Dark", quit: "Quit",
  },
  "ja-JP": {
    showWindow: "ウィンドウを表示/非表示", switchProfile: "Profile を切り替え", switchLanguage: "言語",
    switchTheme: "テーマ", themeAuto: "自動", themeLight: "ライト", themeDark: "ダーク", quit: "終了",
  },
  "de-DE": {
    showWindow: "Fenster anzeigen/ausblenden", switchProfile: "Profil wechseln", switchLanguage: "Sprache",
    switchTheme: "Design", themeAuto: "Automatisch", themeLight: "Hell", themeDark: "Dunkel", quit: "Beenden",
  },
  "es-ES": {
    showWindow: "Mostrar/Ocultar ventana", switchProfile: "Cambiar perfil", switchLanguage: "Idioma",
    switchTheme: "Tema", themeAuto: "Automático", themeLight: "Claro", themeDark: "Oscuro", quit: "Salir",
  },
};

export function getTrayLabels(locale: Locale): TrayLabels {
  return TRAY_LABELS[locale] ?? TRAY_LABELS["en-US"];
}
