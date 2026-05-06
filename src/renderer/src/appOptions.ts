import type {
  AppearanceMode,
  BackupDestinationType,
  BackupFrequency,
  BackupStrategy,
  CloseBehavior,
  DisplayOpenMode,
  Locale,
  McpTransport,
  PreviewBundle,
  UiFontSize,
} from "@shared/types";
import {
  Boxes, FileText, Globe, Info, Layers3, MonitorCog, MoonStar,
  Settings2, Sparkles, SunMedium, Zap,
} from "lucide-react";

export type TabId = "overview" | "profiles" | "providers" | "models" | "mcp" | "skills" | "settings" | "about";
export type PreviewFileId = "config" | "profiles" | "panel" | "mcp";

export const TAB_ITEMS: Array<{ id: TabId; icon: typeof Layers3; labelKey: string }> = [
  { id: "overview", icon: Sparkles, labelKey: "overview" },
  { id: "profiles", icon: Layers3, labelKey: "profiles" },
  { id: "providers", icon: Globe, labelKey: "providers" },
  { id: "models", icon: Boxes, labelKey: "models" },
  { id: "mcp", icon: Zap, labelKey: "mcp" },
  { id: "skills", icon: FileText, labelKey: "skillsNav" },
  { id: "settings", icon: Settings2, labelKey: "settings" },
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
  { value: "en-US", shortLabel: "🇺🇸", longLabel: "English" },
];

export const THEME_OPTIONS: Array<{
  value: AppearanceMode;
  icon: typeof MonitorCog;
  shortLabel: string;
  label: Record<Locale, string>;
}> = [
  {
    value: "auto",
    icon: MonitorCog,
    shortLabel: "A",
    label: { "zh-CN": "自动", "en-US": "Auto" },
  },
  {
    value: "light",
    icon: SunMedium,
    shortLabel: "L",
    label: { "zh-CN": "明亮", "en-US": "Light" },
  },
  {
    value: "dark",
    icon: MoonStar,
    shortLabel: "D",
    label: { "zh-CN": "暗色", "en-US": "Dark" },
  },
];

export const UI_FONT_SIZE_OPTIONS: Array<{
  value: UiFontSize;
  label: Record<Locale, string>;
  fontSize: string;
}> = [
  {
    value: "small",
    label: { "zh-CN": "小", "en-US": "Small" },
    fontSize: "14px",
  },
  {
    value: "standard",
    label: { "zh-CN": "标准", "en-US": "Standard" },
    fontSize: "16px",
  },
  {
    value: "large",
    label: { "zh-CN": "大", "en-US": "Large" },
    fontSize: "18px",
  },
];

export const PROVIDER_TYPE_OPTIONS: Array<{
  value: string;
  label: Record<Locale, string>;
}> = [
  {
    value: "kimi",
    label: { "zh-CN": "Kimi API（kimi）", "en-US": "Kimi API (kimi)" },
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
    label: { "zh-CN": "Anthropic Claude（anthropic）", "en-US": "Anthropic Claude (anthropic)" },
  },
  {
    value: "gemini",
    label: { "zh-CN": "Google Gemini（gemini）", "en-US": "Google Gemini (gemini)" },
  },
  {
    value: "vertexai",
    label: { "zh-CN": "Google Vertex AI（vertexai）", "en-US": "Google Vertex AI (vertexai)" },
  },
];

export const MODEL_CAPABILITY_OPTIONS: Array<{
  value: string;
  label: Record<Locale, string>;
}> = [
  {
    value: "thinking",
    label: { "zh-CN": "Thinking（thinking）", "en-US": "Thinking (thinking)" },
  },
  {
    value: "always_thinking",
    label: { "zh-CN": "始终 Thinking（always_thinking）", "en-US": "Always Thinking (always_thinking)" },
  },
  {
    value: "image_in",
    label: { "zh-CN": "图片输入（image_in）", "en-US": "Image Input (image_in)" },
  },
  {
    value: "video_in",
    label: { "zh-CN": "视频输入（video_in）", "en-US": "Video Input (video_in)" },
  },
];

export const MCP_TRANSPORT_OPTIONS: Array<{
  value: McpTransport;
  label: Record<Locale, string>;
}> = [
  {
    value: "streamable-http",
    label: { "zh-CN": "Streaming HTTP", "en-US": "Streaming HTTP" },
  },
  {
    value: "sse",
    label: { "zh-CN": "SSE", "en-US": "SSE" },
  },
  {
    value: "stdio",
    label: { "zh-CN": "stdio（本地进程）", "en-US": "stdio (Local Process)" },
  },
];

export const DISPLAY_OPEN_OPTIONS: Array<{
  value: DisplayOpenMode;
  label: Record<Locale, string>;
}> = [
  {
    value: "random",
    label: { "zh-CN": "随机屏幕", "en-US": "Random Display" },
  },
  {
    value: "remember-last",
    label: { "zh-CN": "记住上次屏幕", "en-US": "Remember Last Display" },
  },
  {
    value: "active-display",
    label: { "zh-CN": "跟随当前屏幕", "en-US": "Current Active Display" },
  },
];

export const CLOSE_BEHAVIOR_OPTIONS: Array<{
  value: CloseBehavior;
  label: Record<Locale, string>;
}> = [
  {
    value: "quit",
    label: { "zh-CN": "退出应用", "en-US": "Quit App" },
  },
  {
    value: "keep-in-tray",
    label: { "zh-CN": "隐藏到状态栏", "en-US": "Keep in Tray" },
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
