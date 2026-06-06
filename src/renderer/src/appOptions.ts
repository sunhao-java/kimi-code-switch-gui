import type {
  AppearanceMode,
  AppearanceTheme,
  BackupDestinationType,
  BackupFrequency,
  BackupStrategy,
  CloseBehavior,
  DisplayOpenMode,
  LocalizedText,
  Locale,
  McpTransport,
  PreviewBundle,
  TerminalApp,
  UiFontSize,
} from "@shared/types";
import {
  Boxes, Cherry, Droplets, FileText, Flame, Globe, Info, Layers3, Leaf, MonitorCog, MoonStar,
  Palette, Settings2, Snowflake, Sparkles, Star, SunMedium, TreePine, TrendingUp, Zap,
} from "lucide-react";

export type TabId = "overview" | "profiles" | "providers" | "models" | "mcp" | "skills" | "insights" | "settings" | "about";
export type PreviewFileId = "config" | "profiles" | "panel" | "mcp";

export const TAB_ITEMS: Array<{ id: TabId; icon: typeof Layers3; labelKey: string }> = [
  { id: "overview", icon: Sparkles, labelKey: "overview" },
  { id: "profiles", icon: Layers3, labelKey: "assistants" },
  { id: "mcp", icon: Zap, labelKey: "mcp" },
  { id: "skills", icon: FileText, labelKey: "skillsNav" },
  { id: "insights", icon: TrendingUp, labelKey: "insights" },
  { id: "settings", icon: Settings2, labelKey: "settings" },
];

export const ASSISTANT_SUB_ITEMS: Array<{ id: TabId; icon: typeof Layers3; labelKey: string }> = [
  { id: "providers", icon: Globe, labelKey: "providers" },
  { id: "models", icon: Boxes, labelKey: "models" },
];

export const ABOUT_TAB: { id: TabId; icon: typeof Info; labelKey: string } = {
  id: "about",
  icon: Info,
  labelKey: "about",
};

export const emptyPreview: PreviewBundle = {
  configDocument: "",
  profilesDocument: "",
  panelSettingsDocument: "",
  mcpDocument: "",
  configDiff: "",
  profilesDiff: "",
  panelDiff: "",
  mcpDiff: "",
};

export const LOCALE_OPTIONS: Array<{ value: Locale; shortLabel: string; longLabel: string }> = [
  { value: "zh-CN", shortLabel: "🇨🇳", longLabel: "中文" },
  { value: "zh-TW", shortLabel: "繁", longLabel: "繁體中文" },
  { value: "en-US", shortLabel: "🇺🇸", longLabel: "English" },
  { value: "ja-JP", shortLabel: "🇯🇵", longLabel: "日本語" },
  { value: "de-DE", shortLabel: "🇩🇪", longLabel: "Deutsch" },
  { value: "es-ES", shortLabel: "🇪🇸", longLabel: "Español" },
];

export function labelForLocale(label: LocalizedText, locale: Locale): string {
  return label[locale] ?? label["en-US"];
}

export const THEME_OPTIONS: Array<{
  value: AppearanceMode;
  icon: typeof MonitorCog;
  shortLabel: string;
  label: LocalizedText;
}> = [
  {
    value: "auto",
    icon: MonitorCog,
    shortLabel: "A",
    label: { "zh-CN": "自动", "zh-TW": "自動", "en-US": "Auto", "ja-JP": "自動", "de-DE": "Automatisch", "es-ES": "Automático" },
  },
  {
    value: "light",
    icon: SunMedium,
    shortLabel: "L",
    label: { "zh-CN": "明亮", "zh-TW": "明亮", "en-US": "Light", "ja-JP": "ライト", "de-DE": "Hell", "es-ES": "Claro" },
  },
  {
    value: "dark",
    icon: MoonStar,
    shortLabel: "D",
    label: { "zh-CN": "暗色", "zh-TW": "深色", "en-US": "Dark", "ja-JP": "ダーク", "de-DE": "Dunkel", "es-ES": "Oscuro" },
  },
];

export const APPEARANCE_THEME_OPTIONS: Array<{
  value: AppearanceTheme;
  icon: typeof Palette;
  label: LocalizedText;
}> = [
  {
    value: "aurora",
    icon: Sparkles,
    label: { "zh-CN": "极光", "zh-TW": "極光", "en-US": "Aurora", "ja-JP": "オーロラ", "de-DE": "Polarlicht", "es-ES": "Aurora" },
  },
  {
    value: "ocean",
    icon: Droplets,
    label: { "zh-CN": "海洋", "zh-TW": "海洋", "en-US": "Ocean", "ja-JP": "オーシャン", "de-DE": "Ozean", "es-ES": "Océano" },
  },
  {
    value: "violet",
    icon: Palette,
    label: { "zh-CN": "紫罗兰", "zh-TW": "紫羅蘭", "en-US": "Violet", "ja-JP": "バイオレット", "de-DE": "Violett", "es-ES": "Violeta" },
  },
  {
    value: "sunset",
    icon: Flame,
    label: { "zh-CN": "日落", "zh-TW": "日落", "en-US": "Sunset", "ja-JP": "夕焼け", "de-DE": "Sonnenuntergang", "es-ES": "Atardecer" },
  },
  {
    value: "forest",
    icon: TreePine,
    label: { "zh-CN": "森林", "zh-TW": "森林", "en-US": "Forest", "ja-JP": "フォレスト", "de-DE": "Wald", "es-ES": "Bosque" },
  },
  {
    value: "sakura",
    icon: Cherry,
    label: { "zh-CN": "樱花", "zh-TW": "櫻花", "en-US": "Sakura", "ja-JP": "桜", "de-DE": "Kirschblüte", "es-ES": "Sakura" },
  },
  {
    value: "mint",
    icon: Leaf,
    label: { "zh-CN": "薄荷", "zh-TW": "薄荷", "en-US": "Mint", "ja-JP": "ミント", "de-DE": "Minze", "es-ES": "Menta" },
  },
  {
    value: "cosmos",
    icon: Star,
    label: { "zh-CN": "星空", "zh-TW": "星空", "en-US": "Cosmos", "ja-JP": "コスモス", "de-DE": "Kosmos", "es-ES": "Cosmos" },
  },
  {
    value: "amber",
    icon: Snowflake,
    label: { "zh-CN": "琥珀", "zh-TW": "琥珀", "en-US": "Amber", "ja-JP": "アンバー", "de-DE": "Bernstein", "es-ES": "Ámbar" },
  },
];

export const UI_FONT_SIZE_OPTIONS: Array<{
  value: UiFontSize;
  label: LocalizedText;
  fontSize: string;
}> = [
  {
    value: "mini",
    label: { "zh-CN": "迷你", "zh-TW": "迷你", "en-US": "Mini", "ja-JP": "極小", "de-DE": "Sehr klein", "es-ES": "Muy pequeño" },
    fontSize: "12px",
  },
  {
    value: "compact",
    label: { "zh-CN": "紧凑", "zh-TW": "緊湊", "en-US": "Compact", "ja-JP": "コンパクト", "de-DE": "Kompakt", "es-ES": "Compacto" },
    fontSize: "13px",
  },
  {
    value: "small",
    label: { "zh-CN": "小", "zh-TW": "小", "en-US": "Small", "ja-JP": "小", "de-DE": "Klein", "es-ES": "Pequeño" },
    fontSize: "14px",
  },
  {
    value: "standard",
    label: { "zh-CN": "标准", "zh-TW": "標準", "en-US": "Standard", "ja-JP": "標準", "de-DE": "Standard", "es-ES": "Estándar" },
    fontSize: "16px",
  },
  {
    value: "large",
    label: { "zh-CN": "大", "zh-TW": "大", "en-US": "Large", "ja-JP": "大", "de-DE": "Groß", "es-ES": "Grande" },
    fontSize: "18px",
  },
  {
    value: "extra-large",
    label: { "zh-CN": "超大", "zh-TW": "超大", "en-US": "XL", "ja-JP": "特大", "de-DE": "Sehr groß", "es-ES": "Muy grande" },
    fontSize: "20px",
  },
];

export const PROVIDER_TYPE_OPTIONS: Array<{
  value: string;
  label: LocalizedText;
}> = [
  {
    value: "kimi",
    label: { "zh-CN": "Kimi API（kimi）", "zh-TW": "Kimi API（kimi）", "en-US": "Kimi API (kimi)", "ja-JP": "Kimi API（kimi）", "de-DE": "Kimi API (kimi)", "es-ES": "Kimi API (kimi)" },
  },
  {
    value: "openai_legacy",
    label: {
      "zh-CN": "OpenAI Chat Completions（openai_legacy）",
      "en-US": "OpenAI Chat Completions (openai_legacy)",
    },
  },
  {
    value: "openai_responses",
    label: {
      "zh-CN": "OpenAI Responses（openai_responses）",
      "en-US": "OpenAI Responses (openai_responses)",
    },
  },
  {
    value: "anthropic",
    label: { "zh-CN": "Anthropic Claude（anthropic）", "zh-TW": "Anthropic Claude（anthropic）", "en-US": "Anthropic Claude (anthropic)", "ja-JP": "Anthropic Claude（anthropic）", "de-DE": "Anthropic Claude (anthropic)", "es-ES": "Anthropic Claude (anthropic)" },
  },
  {
    value: "gemini",
    label: { "zh-CN": "Google Gemini（gemini）", "zh-TW": "Google Gemini（gemini）", "en-US": "Google Gemini (gemini)", "ja-JP": "Google Gemini（gemini）", "de-DE": "Google Gemini (gemini)", "es-ES": "Google Gemini (gemini)" },
  },
  {
    value: "vertexai",
    label: { "zh-CN": "Google Vertex AI（vertexai）", "zh-TW": "Google Vertex AI（vertexai）", "en-US": "Google Vertex AI (vertexai)", "ja-JP": "Google Vertex AI（vertexai）", "de-DE": "Google Vertex AI (vertexai)", "es-ES": "Google Vertex AI (vertexai)" },
  },
];

export const MODEL_CAPABILITY_OPTIONS: Array<{
  value: string;
  label: LocalizedText;
}> = [
  {
    value: "thinking",
    label: {
      "zh-CN": "Thinking（thinking）",
      "zh-TW": "Thinking（thinking）",
      "en-US": "Thinking (thinking)",
      "ja-JP": "Thinking（thinking）",
      "de-DE": "Denken (thinking)",
      "es-ES": "Razonamiento (thinking)",
    },
  },
  {
    value: "always_thinking",
    label: {
      "zh-CN": "始终 Thinking（always_thinking）",
      "zh-TW": "始終 Thinking（always_thinking）",
      "en-US": "Always Thinking (always_thinking)",
      "ja-JP": "常に Thinking（always_thinking）",
      "de-DE": "Immer denken (always_thinking)",
      "es-ES": "Razonamiento siempre activo (always_thinking)",
    },
  },
  {
    value: "image_in",
    label: {
      "zh-CN": "图片输入（image_in）",
      "zh-TW": "圖片輸入（image_in）",
      "en-US": "Image Input (image_in)",
      "ja-JP": "画像入力（image_in）",
      "de-DE": "Bildeingabe (image_in)",
      "es-ES": "Entrada de imágenes (image_in)",
    },
  },
  {
    value: "video_in",
    label: {
      "zh-CN": "视频输入（video_in）",
      "zh-TW": "影片輸入（video_in）",
      "en-US": "Video Input (video_in)",
      "ja-JP": "動画入力（video_in）",
      "de-DE": "Videoeingabe (video_in)",
      "es-ES": "Entrada de vídeo (video_in)",
    },
  },
];

export const MCP_TRANSPORT_OPTIONS: Array<{
  value: McpTransport;
  label: LocalizedText;
}> = [
  {
    value: "streamable-http",
    label: { "zh-CN": "Streaming HTTP", "zh-TW": "Streaming HTTP", "en-US": "Streaming HTTP", "ja-JP": "Streaming HTTP", "de-DE": "Streaming HTTP", "es-ES": "Streaming HTTP" },
  },
  {
    value: "sse",
    label: { "zh-CN": "SSE", "zh-TW": "SSE", "en-US": "SSE", "ja-JP": "SSE", "de-DE": "SSE", "es-ES": "SSE" },
  },
  {
    value: "stdio",
    label: {
      "zh-CN": "stdio（本地进程）",
      "zh-TW": "stdio（本機程序）",
      "en-US": "stdio (Local Process)",
      "ja-JP": "stdio（ローカルプロセス）",
      "de-DE": "stdio (lokaler Prozess)",
      "es-ES": "stdio (proceso local)",
    },
  },
];

export const DISPLAY_OPEN_OPTIONS: Array<{
  value: DisplayOpenMode;
  label: LocalizedText;
}> = [
  {
    value: "random",
    label: { "zh-CN": "随机屏幕", "zh-TW": "隨機螢幕", "en-US": "Random Display", "ja-JP": "ランダムなディスプレイ", "de-DE": "Zufälliger Bildschirm", "es-ES": "Pantalla aleatoria" },
  },
  {
    value: "remember-last",
    label: { "zh-CN": "记住上次屏幕", "zh-TW": "記住上次螢幕", "en-US": "Remember Last Display", "ja-JP": "前回のディスプレイを使用", "de-DE": "Letzten Bildschirm merken", "es-ES": "Recordar última pantalla" },
  },
  {
    value: "active-display",
    label: { "zh-CN": "跟随当前屏幕", "zh-TW": "跟隨目前螢幕", "en-US": "Current Active Display", "ja-JP": "現在のディスプレイに追従", "de-DE": "Aktivem Bildschirm folgen", "es-ES": "Usar pantalla activa" },
  },
];

export const CLOSE_BEHAVIOR_OPTIONS: Array<{
  value: CloseBehavior;
  label: LocalizedText;
}> = [
  {
    value: "quit",
    label: { "zh-CN": "退出应用", "zh-TW": "退出應用程式", "en-US": "Quit App", "ja-JP": "アプリを終了", "de-DE": "App beenden", "es-ES": "Salir de la app" },
  },
  {
    value: "keep-in-tray",
    label: { "zh-CN": "隐藏到状态栏", "zh-TW": "隱藏到狀態列", "en-US": "Keep in Tray", "ja-JP": "トレイに格納", "de-DE": "Im Tray behalten", "es-ES": "Mantener en bandeja" },
  },
];

export const TERMINAL_APP_OPTIONS: Array<{
  value: TerminalApp;
  label: LocalizedText;
}> = [
  {
    value: "system-terminal",
    label: { "zh-CN": "系统终端", "zh-TW": "系統終端", "en-US": "Terminal.app", "ja-JP": "システムターミナル", "de-DE": "System-Terminal", "es-ES": "Terminal del sistema" },
  },
  {
    value: "iterm2",
    label: { "zh-CN": "iTerm2", "zh-TW": "iTerm2", "en-US": "iTerm2", "ja-JP": "iTerm2", "de-DE": "iTerm2", "es-ES": "iTerm2" },
  },
];

export const BACKUP_FREQUENCY_OPTIONS: Array<{
  value: BackupFrequency;
  labelKey: string;
}> = [
  { value: "hourly", labelKey: "backupFrequencyHourly" },
  { value: "daily", labelKey: "backupFrequencyDaily" },
  { value: "weekly", labelKey: "backupFrequencyWeekly" },
];

export const BACKUP_DESTINATION_OPTIONS: Array<{
  value: BackupDestinationType;
  labelKey: string;
}> = [
  { value: "local", labelKey: "backupDestinationLocal" },
  { value: "webdav", labelKey: "backupDestinationWebdav" },
];

export const BACKUP_STRATEGY_OPTIONS: Array<{
  value: BackupStrategy;
  labelKey: string;
}> = [
  { value: "manual", labelKey: "backupStrategyManual" },
  { value: "scheduled", labelKey: "backupStrategyScheduled" },
  { value: "on-change", labelKey: "backupStrategyOnChange" },
];
