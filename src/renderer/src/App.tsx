import { useCallback, useEffect, useRef, useState } from "react";
import {
  Boxes,
  Bug,
  CheckCheck,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileInput,
  FileText,
  Globe,
  Eye,
  EyeOff,
  FolderOpen,
  Github,
  History,
  Info,
  LayoutGrid,
  List,
  Layers3,
  LoaderCircle,
  Mail,
  MonitorCog,
  MoonStar,
  PenSquare,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Star,
  SunMedium,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import {
  applyProfile,
  cloneProfile,
  cloneState,
  deleteModel,
  deleteProfile,
  deleteProvider,
  normalizeStatePaths,
  upsertModel,
  upsertProfile,
  upsertProvider,
} from "@shared/configStore";
import { buildModelName, ensureUniqueEntryName, normalizeEntryName } from "@shared/nameRules";
import type { SkillEntry, SkillsScanReport } from "@shared/skillsStore";
import type {
  AppState,
  BackupDestinationType,
  BackupRecord,
  Locale,
  PreviewBundle,
  Profile,
  AppearanceMode,
  DisplayOpenMode,
  BackupFrequency,
  BackupStrategy,
  CloseBehavior,
  McpServerConfig,
  McpTransport,
  UiFontSize,
} from "@shared/types";
import { parseMcpConfigStrict } from "@shared/mcpStore";

import { t, translateError } from "./i18n";
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

type TabId = "overview" | "profiles" | "providers" | "models" | "mcp" | "skills" | "settings" | "about";
type DiagnosticLevel = "ok" | "failed" | "pending" | "unavailable";
type PreviewFileId = "config" | "profiles" | "panel" | "mcp";
type SkillsViewMode = "grid" | "list";

interface DiagnosticsState {
  preload: DiagnosticLevel;
  loadState: DiagnosticLevel;
  previewState: DiagnosticLevel;
  lastError: string;
}

type ConfirmDialogTone = "primary" | "danger";
type ConfirmDialogKind = "save" | "delete";

interface ConfirmDialogState {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmDialogTone;
  kind: ConfirmDialogKind;
}

interface DocumentViewerState {
  title: string;
  format: "TOML" | "JSON";
  content: string;
}

interface BackupRecordsDialogState {
  destinationType: BackupDestinationType;
  records: BackupRecord[];
  isLoading: boolean;
  errorMessage: string;
  deletingName?: string;
  restoringName?: string;
}

const TAB_ITEMS: Array<{ id: TabId; icon: typeof Layers3; labelKey: string }> = [
  { id: "overview", icon: Sparkles, labelKey: "overview" },
  { id: "profiles", icon: Layers3, labelKey: "profiles" },
  { id: "providers", icon: Globe, labelKey: "providers" },
  { id: "models", icon: Boxes, labelKey: "models" },
  { id: "mcp", icon: Zap, labelKey: "mcp" },
  { id: "skills", icon: FileText, labelKey: "skillsNav" },
  { id: "settings", icon: Settings2, labelKey: "settings" },
];

const ABOUT_TAB: { id: TabId; icon: typeof Info; labelKey: string } = {
  id: "about",
  icon: Info,
  labelKey: "about",
};

const ABOUT_INFO = {
  version: "1.0.4",
  author: "Hulk Sun",
  license: "MIT",
  repositoryUrl: "https://github.com/sunhao-java/kimi-code-switch-gui",
  issuesUrl: "https://github.com/sunhao-java/kimi-code-switch-gui/issues",
  authorBlogUrl: "https://www.crazy-coder.cn",
  contactEmail: "sunhao.java@gmail.com",
};

const emptyPreview: PreviewBundle = {
  configDocument: "",
  profilesDocument: "",
  panelSettingsDocument: "",
  mcpDocument: "",
  configDiff: "",
  profilesDiff: "",
  panelDiff: "",
  mcpDiff: "",
};

const LOCALE_OPTIONS: Array<{ value: Locale; shortLabel: string; longLabel: string }> = [
  { value: "zh-CN", shortLabel: "🇨🇳", longLabel: "中文" },
  { value: "en-US", shortLabel: "🇺🇸", longLabel: "English" },
];

const THEME_OPTIONS: Array<{
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

const UI_FONT_SIZE_OPTIONS: Array<{
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

const PROVIDER_TYPE_OPTIONS: Array<{
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

const MODEL_CAPABILITY_OPTIONS: Array<{
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

const MCP_TRANSPORT_OPTIONS: Array<{
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

const DISPLAY_OPEN_OPTIONS: Array<{
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

const CLOSE_BEHAVIOR_OPTIONS: Array<{
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

const BACKUP_FREQUENCY_OPTIONS: Array<{
  value: BackupFrequency;
  labelKey: string;
}> = [
  { value: "hourly", labelKey: "backupFrequencyHourly" },
  { value: "daily", labelKey: "backupFrequencyDaily" },
  { value: "weekly", labelKey: "backupFrequencyWeekly" },
];

const BACKUP_DESTINATION_OPTIONS: Array<{
  value: BackupDestinationType;
  labelKey: string;
}> = [
  { value: "local", labelKey: "backupDestinationLocal" },
  { value: "webdav", labelKey: "backupDestinationWebdav" },
];

const BACKUP_STRATEGY_OPTIONS: Array<{
  value: BackupStrategy;
  labelKey: string;
}> = [
  { value: "manual", labelKey: "backupStrategyManual" },
  { value: "scheduled", labelKey: "backupStrategyScheduled" },
  { value: "on-change", labelKey: "backupStrategyOnChange" },
];

function getApi() {
  return typeof window !== "undefined" ? window.kimiSwitch : undefined;
}

function getMcpAction(
  api: ReturnType<typeof getApi>,
  action: "test" | "auth" | "reset-auth",
): ((name: string) => Promise<{ ok: true; stdout: string; stderr: string }>) | null {
  if (!api) {
    return null;
  }
  if (action === "test") {
    return typeof api.testMcpServer === "function" ? api.testMcpServer : null;
  }
  if (action === "auth") {
    return typeof api.authMcpServer === "function" ? api.authMcpServer : null;
  }
  return typeof api.resetMcpServerAuth === "function" ? api.resetMcpServerAuth : null;
}

function getMcpActionNotice(locale: Locale, action: "test" | "auth" | "reset-auth"): string {
  if (action === "test") {
    return t(locale, "mcpTestSuccess");
  }
  if (action === "auth") {
    return t(locale, "mcpAuthStarted");
  }
  return t(locale, "mcpResetSuccess");
}

function isEqualValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectDirtyKeys<T>(
  current: Record<string, T>,
  saved: Record<string, T>,
): Set<string> {
  const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
  return new Set(
    [...keys].filter((key) => !isEqualValue(current[key] ?? null, saved[key] ?? null)),
  );
}

function isDraftEntry<T>(savedEntries: Record<string, T> | undefined, name: string): boolean {
  return Boolean(name) && !savedEntries?.[name];
}

function createUniqueName(baseName: string, existingNames: string[]): string {
  const normalizedBaseName = normalizeEntryName(baseName) || "item";
  if (!existingNames.includes(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let index = 2;
  while (existingNames.includes(`${normalizedBaseName}-${index}`)) {
    index += 1;
  }
  return `${normalizedBaseName}-${index}`;
}

function updateModelReferences(state: AppState, currentName: string, nextName: string): void {
  if (currentName === nextName) {
    return;
  }
  for (const profile of Object.values(state.profiles)) {
    if (profile.default_model === currentName) {
      profile.default_model = nextName;
    }
  }
  if (state.mainConfig.default_model === currentName) {
    state.mainConfig.default_model = nextName;
  }
}

function renameModelInState(
  state: AppState,
  currentName: string,
  nextModel: {
    provider: string;
    model: string;
    max_context_size: number;
    capabilities: string[];
  },
): string {
  const nextName = buildModelName(nextModel.provider, nextModel.model);
  if (currentName !== nextName && state.mainConfig.models[nextName]) {
    throw new Error(`Model already exists: ${nextName}`);
  }

  const nextModels = { ...state.mainConfig.models };
  delete nextModels[currentName];
  nextModels[nextName] = nextModel;
  state.mainConfig.models = nextModels;
  updateModelReferences(state, currentName, nextName);
  return nextName;
}

function renameProviderInState(
  state: AppState,
  currentName: string,
  nextNameInput: string,
  nextProvider: {
    type: string;
    base_url: string;
    api_key: string;
  },
): string {
  const nextName = ensureUniqueEntryName({
    kind: "Provider",
    name: nextNameInput,
    currentName,
    existingNames: Object.keys(state.mainConfig.providers),
  });

  const dependentModels = Object.entries(state.mainConfig.models).filter(([, model]) => model.provider === currentName);
  const dependentModelNames = new Set(dependentModels.map(([modelName]) => modelName));
  const nextModelEntries = dependentModels.map(([modelName, model]) => {
    const nextModelName = buildModelName(nextName, model.model);
    return {
      currentName: modelName,
      nextName: nextModelName,
      value: {
        ...model,
        provider: nextName,
      },
    };
  });

  const seenNames = new Set<string>();
  for (const entry of nextModelEntries) {
    if (seenNames.has(entry.nextName)) {
      throw new Error(`Model already exists: ${entry.nextName}`);
    }
    seenNames.add(entry.nextName);
    if (
      entry.currentName !== entry.nextName &&
      state.mainConfig.models[entry.nextName] &&
      !dependentModelNames.has(entry.nextName)
    ) {
      throw new Error(`Model already exists: ${entry.nextName}`);
    }
  }

  const nextProviders = { ...state.mainConfig.providers };
  delete nextProviders[currentName];
  nextProviders[nextName] = nextProvider;
  state.mainConfig.providers = nextProviders;

  const nextModels = { ...state.mainConfig.models };
  for (const entry of nextModelEntries) {
    delete nextModels[entry.currentName];
  }
  for (const entry of nextModelEntries) {
    nextModels[entry.nextName] = entry.value;
    updateModelReferences(state, entry.currentName, entry.nextName);
  }
  state.mainConfig.models = nextModels;

  return nextName;
}

function getResourceLabel(
  locale: Locale,
  resource: "provider" | "model" | "profile" | "mcp",
): string {
  if (locale === "zh-CN") {
    if (resource === "provider") return "提供方";
    if (resource === "model") return "模型";
    if (resource === "profile") return "Profile";
    return "MCP";
  }
  if (resource === "provider") return "provider";
  if (resource === "model") return "model";
  if (resource === "profile") return "profile";
  return "MCP";
}

function parseBackupDisplayDate(value: string): Date | null {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = /^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );
}

function formatBackupDisplayDate(locale: Locale, value: string): string {
  const parsed = parseBackupDisplayDate(value);
  if (!parsed) {
    return value;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [savedState, setSavedState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedMcpServer, setSelectedMcpServer] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [selectedSkillPath, setSelectedSkillPath] = useState("");
  const [skillsViewMode, setSkillsViewMode] = useState<SkillsViewMode>("grid");
  const [preview, setPreview] = useState<PreviewBundle>(emptyPreview);
  const [skillsReport, setSkillsReport] = useState<SkillsScanReport | null>(null);
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [documentViewer, setDocumentViewer] = useState<DocumentViewerState | null>(null);
  const [backupRecordsDialog, setBackupRecordsDialog] = useState<BackupRecordsDialogState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isMcpImportOpen, setIsMcpImportOpen] = useState(false);
  const [mcpImportDraft, setMcpImportDraft] = useState("");
  const [mcpImportInitialDraft, setMcpImportInitialDraft] = useState("");
  const [mcpTestingName, setMcpTestingName] = useState("");
  const [profileTestingName, setProfileTestingName] = useState("");
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const [isWebDavTesting, setIsWebDavTesting] = useState(false);
  const [isBackupPasswordVisible, setIsBackupPasswordVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    preload: "pending",
    loadState: "pending",
    previewState: "pending",
    lastError: "",
  });
  const unsavedResolutionRef = useRef(false);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }
    applyAppearanceMode(state.panelSettings.theme);
  }, [state?.panelSettings.theme]);

  useEffect(() => {
    if (!state) {
      return;
    }
    applyUiFontSize(state.panelSettings.ui_font_size);
  }, [state?.panelSettings.ui_font_size]);

  useEffect(() => {
    if (!state) {
      return;
    }
    void refreshSkills(state, { silent: true });
  }, [state?.mainConfig.merge_all_available_skills]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = getApi();
    if (!api?.onTrayCommand || !state) {
      return;
    }
    return api.onTrayCommand((command) => {
      if (command === "reload") {
        void loadState();
      }
    });
  }, [state]);

  const locale = (state?.panelSettings.locale ?? "zh-CN") as Locale;

  async function loadState(): Promise<void> {
    const api = getApi();
    if (!api) {
      setState(createFallbackState());
      setError("Electron preload API is unavailable. Check the preload script and packaged entry paths.");
      setDiagnostics({
        preload: "unavailable",
        loadState: "failed",
        previewState: "unavailable",
        lastError: "Electron preload API is unavailable.",
      });
      return;
    }

    try {
      setDiagnostics((current) => ({
        ...current,
        preload: "ok",
        loadState: "pending",
      }));
      const next = await api.loadState();
      const normalized = normalizeStatePaths(next);
      setState(normalized);
      setSavedState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      setSelectedProvider(Object.keys(normalized.mainConfig.providers)[0] ?? "");
      setSelectedModel(Object.keys(normalized.mainConfig.models)[0] ?? "");
      setSelectedProfile(normalized.activeProfile);
      setSelectedMcpServer(Object.keys(normalized.mcpConfig.mcpServers)[0] ?? "");
      const nextPreview = await api.previewState(normalized);
      setPreview(nextPreview);
      await refreshSkills(normalized, { silent: true });
      setError("");
      setNotice("");
      setDiagnostics({
        preload: "ok",
        loadState: "ok",
        previewState: "ok",
        lastError: "",
      });
    } catch (loadError) {
      const fallback = createFallbackState();
      setState(fallback);
      setSavedState(fallback);
      applyAppearanceMode(fallback.panelSettings.theme);
      applyUiFontSize(fallback.panelSettings.ui_font_size);
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setDiagnostics((current) => ({
        preload: current.preload === "pending" ? "ok" : current.preload,
        loadState: "failed",
        previewState: current.previewState,
        lastError: message,
      }));
    }
  }

  const title = t(locale, "appTitle");

  const persistState = async (nextState: AppState): Promise<void> => {
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }
    try {
      const normalized = normalizeStatePaths(nextState);
      await api.saveState(normalized);
      if (savedState?.panelSettings.tray_icon !== normalized.panelSettings.tray_icon) {
        await api.setTray(normalized.panelSettings.tray_icon);
      }
      const nextPreview = await api.previewState(normalized);
      setState(normalized);
      setSavedState(normalized);
      setPreview(nextPreview);
      void refreshSkills(normalized, { silent: true });
      setError("");
      setNotice("");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  const onSave = async (): Promise<void> => {
    await persistState(state);
  };

  const persistImmediateState = async (nextVisibleState: AppState, nextSavedStateOverride?: AppState): Promise<void> => {
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }

    const previousSavedState = savedState;
    const normalizedVisibleState = normalizeStatePaths(nextVisibleState);
    const normalizedSavedState = normalizeStatePaths(nextSavedStateOverride ?? nextVisibleState);

    setState(normalizedVisibleState);
    setSavedState(normalizedSavedState);
    applyAppearanceMode(normalizedVisibleState.panelSettings.theme);
    applyUiFontSize(normalizedVisibleState.panelSettings.ui_font_size);
    void refreshPreview(normalizedVisibleState);
    setError("");
    setNotice("");

    try {
      await api.saveState(normalizedSavedState);
      if (previousSavedState?.panelSettings.tray_icon !== normalizedSavedState.panelSettings.tray_icon) {
        await api.setTray(normalizedSavedState.panelSettings.tray_icon);
      }
      const nextPreview = await api.previewState(normalizedVisibleState);
      setPreview(nextPreview);
      void refreshSkills(normalizedVisibleState, { silent: true });
      setError("");
      setNotice("");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setSavedState(previousSavedState ?? null);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  const requestConfirm = (options: ConfirmDialogState): Promise<boolean> =>
    new Promise((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmDialog(options);
    });

  const closeConfirmDialog = (confirmed: boolean): void => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(confirmed);
  };

  const confirmDeleteResource = async (resourceLabel: string, name: string): Promise<boolean> =>
    requestConfirm({
      title: formatMessage(t(locale, "deleteResourceConfirm"), {
        resource: resourceLabel,
        name,
      }),
      confirmLabel: t(locale, "delete"),
      cancelLabel: t(locale, "cancel"),
      tone: "danger",
      kind: "delete",
    });

  const closeMcpImportDialog = useCallback((): void => {
    setIsMcpImportOpen(false);
    setMcpImportDraft("");
    setMcpImportInitialDraft("");
  }, []);

  const requestCloseMcpImportDialog = useCallback((): void => {
    void (async () => {
      if (mcpImportDraft === mcpImportInitialDraft) {
        closeMcpImportDialog();
        return;
      }

      const shouldDiscard = await requestConfirm({
        title: t(locale, "mcpImportUnsavedTitle"),
        description: t(locale, "mcpImportUnsavedDescription"),
        confirmLabel: t(locale, "discardChanges"),
        cancelLabel: t(locale, "cancel"),
        tone: "danger",
        kind: "delete",
      });

      if (shouldDiscard) {
        closeMcpImportDialog();
      }
    })();
  }, [closeMcpImportDialog, locale, mcpImportDraft, mcpImportInitialDraft]);

  const restoreSavedState = (nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
    applyUiFontSize(restored.panelSettings.ui_font_size);
    setSelectedProvider((current) =>
      restored.mainConfig.providers[current] ? current : Object.keys(restored.mainConfig.providers)[0] ?? "",
    );
    setSelectedModel((current) =>
      restored.mainConfig.models[current] ? current : Object.keys(restored.mainConfig.models)[0] ?? "",
    );
    setSelectedProfile((current) =>
      restored.profiles[current] ? current : (restored.activeProfile || Object.keys(restored.profiles)[0] || ""),
    );
    setSelectedMcpServer((current) =>
      restored.mcpConfig.mcpServers[current] ? current : Object.keys(restored.mcpConfig.mcpServers)[0] ?? "",
    );
    void refreshSkills(restored, { silent: true });
    void refreshPreview(restored);
    setError("");
    setNotice("");
  };

  const refreshPreview = async (draft = state): Promise<void> => {
    const api = getApi();
    if (!api) {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({ ...current, previewState: "unavailable" }));
      return;
    }
    try {
      const nextPreview = await api.previewState(draft);
      setPreview(nextPreview);
      setDiagnostics((current) => ({ ...current, previewState: "ok" }));
    } catch {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({
        ...current,
        previewState: "failed",
        lastError: current.lastError || "Preview generation failed.",
      }));
    }
  };

  const refreshSkills = async (
    draft = state,
    options: { silent?: boolean } = {},
  ): Promise<void> => {
    const api = getApi();
    if (!api) {
      setSkillsReport(null);
      return;
    }
    if (typeof api.scanSkills !== "function") {
      if (!options.silent) {
        setNotice("");
        setError(t(locale, "skillsRuntimeOutdated"));
      }
      setSkillsReport(null);
      return;
    }
    try {
      setIsSkillsLoading(true);
      const report = await api.scanSkills(draft);
      setSkillsReport(report);
      setSelectedSkillPath((current) => {
        if (current && report.paths.some((path) => path.id === current)) {
          return current;
        }
        return report.paths.find((path) => path.selected)?.id ?? report.paths[0]?.id ?? "";
      });
      setSelectedSkill((current) => {
        if (current && report.skills.some((skill) => skill.id === current)) {
          return current;
        }
        return "";
      });
      if (!options.silent) {
        setError("");
        setNotice(t(locale, "skillsRefreshed"));
      }
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : String(scanError);
      if (!options.silent) {
        setNotice("");
        setError(translateError(locale, message));
      }
    } finally {
      setIsSkillsLoading(false);
    }
  };

  const updateState = (updater: (draft: AppState) => void, options: { persist?: boolean } = {}): void => {
    const draft = cloneState(state);
    try {
      updater(draft);
      const normalized = normalizeStatePaths(draft);
      setState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      void refreshPreview(normalized);
      if (options.persist !== false) {
        void persistState(normalized);
      }
      setError("");
      setNotice("");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  const updateImmediateState = (updater: (draft: AppState) => void): void => {
    const visibleDraft = cloneState(state);
    const persistedDraft = cloneState(savedState ?? state);

    try {
      updater(visibleDraft);
      updater(persistedDraft);
      void persistImmediateState(visibleDraft, persistedDraft);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  const hasUnsavedChanges = Boolean(savedState) && !isEqualValue(state, savedState);
  const dirtyProviders = savedState
    ? collectDirtyKeys(state.mainConfig.providers, savedState.mainConfig.providers)
    : new Set<string>();
  const dirtyModels = savedState
    ? collectDirtyKeys(state.mainConfig.models, savedState.mainConfig.models)
    : new Set<string>();
  const dirtyProfiles = savedState
    ? collectDirtyKeys(state.profiles, savedState.profiles)
    : new Set<string>();
  const dirtyMcpServers = savedState
    ? collectDirtyKeys(state.mcpConfig.mcpServers, savedState.mcpConfig.mcpServers)
    : new Set<string>();
  const resolveUnsavedChanges = async (): Promise<void> => {
    if (!hasUnsavedChanges || !savedState || unsavedResolutionRef.current) {
      return;
    }
    unsavedResolutionRef.current = true;
    try {
      const shouldSave = await requestConfirm({
        title: t(locale, "unsavedChangesTitle"),
        description: t(locale, "unsavedChangesDescription"),
        confirmLabel: t(locale, "save"),
        cancelLabel: t(locale, "discardChanges"),
        tone: "primary",
        kind: "save",
      });
      if (shouldSave) {
        await persistState(state);
      } else {
        restoreSavedState(savedState);
      }
    } finally {
      unsavedResolutionRef.current = false;
    }
  };

  const runAfterUnsavedHandled = (action: () => void | Promise<void>): void => {
    void (async () => {
      await resolveUnsavedChanges();
      await action();
    })();
  };

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handleBlur = (): void => {
      void resolveUnsavedChanges();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [hasUnsavedChanges, locale, state, savedState]);

  if (!state) {
    return <div className="boot-screen">Loading…</div>;
  }

  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);
  const mcpEntries = Object.entries(state.mcpConfig.mcpServers);
  const skillPathEntries = skillsReport?.paths ?? [];
  const skillEntries = skillsReport?.skills ?? [];
  const sortedSkillPathEntries = [...skillPathEntries].sort((left, right) => {
    if (left.group === "builtin" && right.group !== "builtin") {
      return 1;
    }
    if (right.group === "builtin" && left.group !== "builtin") {
      return -1;
    }
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }
    if (left.exists !== right.exists) {
      return left.exists ? -1 : 1;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.label.localeCompare(right.label);
  });
  const selectedProviderName = selectedProvider || providerEntries[0]?.[0] || "";
  const selectedModelName = selectedModel || modelEntries[0]?.[0] || "";
  const selectedProfileName = selectedProfile || profileEntries[0]?.[0] || "";
  const selectedMcpServerName = selectedMcpServer || mcpEntries[0]?.[0] || "";
  const selectedSkillPathId =
    selectedSkillPath || skillPathEntries.find((path) => path.selected)?.id || skillPathEntries[0]?.id || "";
  const visibleSkillEntries = skillEntries.filter((skill) => skill.sourcePathId === selectedSkillPathId);
  const selectedSkillId = selectedSkill;

  const selectedProviderData =
    (selectedProvider && state.mainConfig.providers[selectedProvider]) ||
    providerEntries[0]?.[1] ||
    null;
  const selectedModelData =
    (selectedModel && state.mainConfig.models[selectedModel]) || modelEntries[0]?.[1] || null;
  const selectedProfileData =
    (selectedProfile && state.profiles[selectedProfile]) || profileEntries[0]?.[1] || null;
  const selectedMcpServerData =
    (selectedMcpServer && state.mcpConfig.mcpServers[selectedMcpServer]) || mcpEntries[0]?.[1] || null;
  const selectedSkillPathData =
    (selectedSkillPathId && skillPathEntries.find((path) => path.id === selectedSkillPathId)) ||
    skillPathEntries[0] ||
    null;
  const selectedSkillData =
    (selectedSkillId && visibleSkillEntries.find((skill) => skill.id === selectedSkillId)) ||
    null;
  const isProviderNameEditable = isDraftEntry(savedState?.mainConfig.providers, selectedProviderName);
  const isProfileNameEditable = isDraftEntry(savedState?.profiles, selectedProfileName);
  const isMcpServerNameEditable = isDraftEntry(savedState?.mcpConfig.mcpServers, selectedMcpServerName);

  const openDocumentViewer = (file: PreviewFileId): void => {
    const mapping: Record<PreviewFileId, DocumentViewerState> = {
      config: {
        title: t(locale, "previewConfig"),
        format: "TOML",
        content: preview.configDocument,
      },
      profiles: {
        title: t(locale, "previewProfiles"),
        format: "TOML",
        content: preview.profilesDocument,
      },
      panel: {
        title: t(locale, "previewPanel"),
        format: "TOML",
        content: preview.panelSettingsDocument,
      },
      mcp: {
        title: t(locale, "previewMcp"),
        format: "JSON",
        content: preview.mcpDocument,
      },
    };

    setDocumentViewer(mapping[file]);
  };

  const runManualBackup = (): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup cannot continue.");
      return;
    }
    if (typeof api.runBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      try {
        setIsBackupRunning(true);
        const result = await api.runBackup(state);
        setError("");
        setNotice(formatMessage(t(locale, "backupSuccess"), { path: result.backupPath }));
      } catch (backupError) {
        const message = backupError instanceof Error ? backupError.message : String(backupError);
        setNotice("");
        setError(translateError(locale, message));
      } finally {
        setIsBackupRunning(false);
      }
    })();
  };

  const runWebDavTest = (): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup test cannot continue.");
      return;
    }
    if (typeof api.testBackupWebdav !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      try {
        setIsWebDavTesting(true);
        const result = await api.testBackupWebdav(state);
        setError("");
        setNotice(formatMessage(t(locale, "backupWebdavTestSuccess"), { path: result.target }));
      } catch (backupError) {
        const message = backupError instanceof Error ? backupError.message : String(backupError);
        setNotice("");
        setError(translateError(locale, message));
      } finally {
        setIsWebDavTesting(false);
      }
    })();
  };

  const loadBackupRecords = async (
    destinationType: BackupDestinationType,
    deletingName?: string,
  ): Promise<void> => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup records cannot be loaded.");
      return;
    }
    if (typeof api.listBackups !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }
    setBackupRecordsDialog({
      destinationType,
      records: [],
      isLoading: true,
      errorMessage: "",
      deletingName,
    });

    try {
      const records = await api.listBackups(state);
      setBackupRecordsDialog({
        destinationType,
        records,
        isLoading: false,
        errorMessage: "",
        deletingName,
      });
    } catch (listError) {
      const message = listError instanceof Error ? listError.message : String(listError);
      setBackupRecordsDialog({
        destinationType,
        records: [],
        isLoading: false,
        errorMessage: translateError(locale, message),
        deletingName,
      });
    }
  };

  const openBackupRecords = (): void => {
    void loadBackupRecords(state.panelSettings.backup_destination_type);
  };

  const deleteBackupRecord = (record: BackupRecord): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup deletion cannot continue.");
      return;
    }
    if (typeof api.deleteBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      const resourceLabel = locale === "zh-CN" ? "备份" : "backup";
      const confirmed = await confirmDeleteResource(resourceLabel, record.name);
      if (!confirmed) {
        return;
      }

      try {
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                deletingName: record.name,
              }
            : current,
        );
        await api.deleteBackup(state, record.name);
        setError("");
        setNotice(formatMessage(t(locale, "backupDeleteSuccess"), { name: record.name }));
        await loadBackupRecords(state.panelSettings.backup_destination_type);
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
        setNotice("");
        setError(translateError(locale, message));
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                deletingName: undefined,
              }
            : current,
        );
      }
    })();
  };

  const restoreBackupRecord = (record: BackupRecord): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup restore cannot continue.");
      return;
    }
    if (typeof api.restoreBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      const confirmed = await requestConfirm({
        title: formatMessage(t(locale, "backupRestoreConfirmTitle"), { name: record.name }),
        description: t(locale, "backupRestoreConfirmDescription"),
        confirmLabel: t(locale, "restore"),
        cancelLabel: t(locale, "cancel"),
        tone: "primary",
        kind: "save",
      });
      if (!confirmed) {
        return;
      }

      try {
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                restoringName: record.name,
              }
            : current,
        );
        const restored = await api.restoreBackup(state, record.name);
        const normalized = normalizeStatePaths(restored);
        setState(normalized);
        setSavedState(normalized);
        applyAppearanceMode(normalized.panelSettings.theme);
        applyUiFontSize(normalized.panelSettings.ui_font_size);
        setSelectedProvider((current) =>
          normalized.mainConfig.providers[current]
            ? current
            : Object.keys(normalized.mainConfig.providers)[0] ?? "",
        );
        setSelectedModel((current) =>
          normalized.mainConfig.models[current]
            ? current
            : Object.keys(normalized.mainConfig.models)[0] ?? "",
        );
        setSelectedProfile((current) =>
          normalized.profiles[current]
            ? current
            : normalized.activeProfile || Object.keys(normalized.profiles)[0] || "",
        );
        setSelectedMcpServer((current) =>
          normalized.mcpConfig.mcpServers[current]
            ? current
            : Object.keys(normalized.mcpConfig.mcpServers)[0] ?? "",
        );
        void refreshPreview(normalized);
        setError("");
        setNotice(formatMessage(t(locale, "backupRestoreSuccess"), { name: record.name }));
        setBackupRecordsDialog(null);
      } catch (restoreError) {
        const message = restoreError instanceof Error ? restoreError.message : String(restoreError);
        setNotice("");
        setError(translateError(locale, message));
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                restoringName: undefined,
              }
            : current,
        );
      }
    })();
  };

  return (
    <div className="shell">
      <div className="window-titlebar drag-region" aria-hidden="true">
        <div className="window-titlebar-safe" />
      </div>
      {error ? (
        <div className="app-tip-layer" role="status" aria-live="polite">
          <div className="app-tip app-tip-error">
            <span className="app-tip-message">{error}</span>
            <button
              type="button"
              className="app-tip-close"
              aria-label={t(locale, "close")}
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {!error && notice ? (
        <div className="app-tip-layer" role="status" aria-live="polite">
          <div className="app-tip app-tip-success">
            <span className="app-tip-message">{notice}</span>
            <button
              type="button"
              className="app-tip-close"
              aria-label={t(locale, "close")}
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      <div className="background-grid" />
      <aside className="sidebar glass-panel">
        <div className="brand drag-region">
          <div className="brand-mark">
            <img className="brand-logo brand-logo-light" src={logoLight} alt="Kimi Code Switch" />
            <img className="brand-logo brand-logo-dark" src={logoDark} alt="Kimi Code Switch" />
          </div>
          <div>
            <h1>{title}</h1>
            <p>{t(locale, "appSubtitle")}</p>
          </div>
        </div>
        <nav className="nav">
          {TAB_ITEMS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              className={id === activeTab ? "nav-item active" : "nav-item"}
              onClick={() => {
                if (id === activeTab) return;
                runAfterUnsavedHandled(() => setActiveTab(id));
              }}
            >
              <Icon size={18} />
              <span>{t(locale, labelKey)}</span>
            </button>
          ))}
        </nav>
        <nav className="nav nav-bottom">
          <button
            className={ABOUT_TAB.id === activeTab ? "nav-item active" : "nav-item"}
            onClick={() => {
              if (ABOUT_TAB.id === activeTab) return;
              runAfterUnsavedHandled(() => setActiveTab(ABOUT_TAB.id));
            }}
          >
            <ABOUT_TAB.icon size={18} />
            <span>{t(locale, ABOUT_TAB.labelKey)}</span>
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="summary-grid">
            <SummaryCard label={t(locale, "summaryProfiles")} value={String(profileEntries.length)} />
            <SummaryCard label={t(locale, "summaryProviders")} value={String(providerEntries.length)} />
            <SummaryCard label={t(locale, "summaryModels")} value={String(modelEntries.length)} />
            <SummaryCard
              label={t(locale, "summaryMcp")}
              value={formatMessage(t(locale, "summaryMcpCompact"), {
                total: mcpEntries.length,
                enabled: mcpEntries.filter(([, server]) => server.enabled !== false).length,
              })}
              title={`${formatMessage(t(locale, "summaryMcpTotal"), { count: mcpEntries.length })} · ${formatMessage(
                t(locale, "summaryMcpEnabled"),
                { count: mcpEntries.filter(([, server]) => server.enabled !== false).length },
              )}`}
            />
            <SummaryCard
              label={t(locale, "summarySkills")}
              value={
                skillsReport
                  ? formatMessage(t(locale, "summarySkillsCompact"), {
                      total: skillsReport.summary.total,
                      effective: skillsReport.summary.effective,
                    })
                  : "-"
              }
              title={
                skillsReport
                  ? `${formatMessage(t(locale, "summarySkillsTotal"), { count: skillsReport.summary.total })} · ${formatMessage(
                      t(locale, "summarySkillsEffective"),
                      { count: skillsReport.summary.effective },
                    )}`
                  : undefined
              }
            />
            <SummaryCard label={t(locale, "summaryActive")} value={state.activeProfile || "-"} accent />
          </div>
          <div className="toolbar">
            <TopbarControls
              locale={locale}
              theme={state.panelSettings.theme}
              onLocaleChange={(value) =>
                updateImmediateState((draft) => {
                  draft.panelSettings.locale = value;
                })
              }
              onThemeChange={(value) =>
                updateImmediateState((draft) => {
                  draft.panelSettings.theme = value;
                })
              }
            />
          </div>
        </header>

        {activeTab === "overview" ? (
          <OverviewDashboard
            state={state}
            locale={locale}
            diagnostics={diagnostics}
            onActivateProfile={(name) =>
              updateState((draft) => {
                applyProfile(draft, name);
              }, { persist: true })
            }
            onNavigate={(tab) => runAfterUnsavedHandled(() => setActiveTab(tab))}
          />
        ) : null}

        {activeTab === "providers" ? (
          <SplitLayout
            listTitle={t(locale, "providers")}
            listItems={providerEntries.map(([name]) => name)}
            dirtyItems={dirtyProviders}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProvider}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedProvider(item))}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const provider = draft.mainConfig.providers[name];
                if (!provider) return;
                const copyName = createCopyName(name, draft.mainConfig.providers);
                draft.mainConfig.providers[copyName] = { ...provider };
                setSelectedProvider(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newProvider")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newProvider")}
            addButtonContent={<Plus size={15} />}
            onAdd={() =>
              updateState((draft) => {
                const name = createUniqueName("provider", Object.keys(draft.mainConfig.providers));
                upsertProvider(draft, name, {
                  type: "kimi",
                  base_url: "https://api.example.com/v1",
                  api_key: "",
                });
                setSelectedProvider(name);
              }, { persist: false })
            }
          >
            {selectedProviderData ? (
              <ProviderForm
                locale={locale}
                name={selectedProviderName}
                nameEditable={isProviderNameEditable}
                value={selectedProviderData}
                onChange={(name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedProviderName;
                    const currentProvider = draft.mainConfig.providers[currentName];
                    if (!currentProvider) return;
                    const nextProvider = { ...currentProvider, ...patch };
                    const nextName = isProviderNameEditable
                      ? renameProviderInState(draft, currentName, name, nextProvider)
                      : currentName;

                    if (!isProviderNameEditable) {
                      draft.mainConfig.providers[currentName] = nextProvider;
                    }
                    setSelectedProvider(nextName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() => {
                  void (async () => {
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "provider"), selectedProviderName))) return;
                    updateState((draft) => {
                      deleteProvider(draft, selectedProviderName);
                      setSelectedProvider(Object.keys(draft.mainConfig.providers)[0] ?? "");
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "models" ? (
          <SplitLayout
            listTitle={t(locale, "models")}
            listItems={modelEntries.map(([name]) => name)}
            dirtyItems={dirtyModels}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedModel}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedModel(item))}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const model = draft.mainConfig.models[name];
                if (!model) return;
                const copyModelId = createUniqueName(`${model.model}-copy`, Object.values(draft.mainConfig.models)
                  .filter((entry) => entry.provider === model.provider)
                  .map((entry) => entry.model));
                const copyName = buildModelName(model.provider, copyModelId);
                draft.mainConfig.models[copyName] = {
                  ...model,
                  model: copyModelId,
                  capabilities: [...model.capabilities],
                };
                setSelectedModel(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newModel")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newModel")}
            addButtonContent={<Plus size={15} />}
            onAdd={() =>
              updateState((draft) => {
                const providerName = Object.keys(draft.mainConfig.providers)[0];
                if (!providerName) {
                  throw new Error("Please create a provider first.");
                }
                const modelId = createUniqueName(
                  "new-model",
                  Object.values(draft.mainConfig.models)
                    .filter((model) => model.provider === providerName)
                    .map((model) => model.model),
                );
                const name = buildModelName(providerName, modelId);
                upsertModel(draft, name, {
                  provider: providerName,
                  model: modelId,
                  max_context_size: 128000,
                  capabilities: [],
                });
                setSelectedModel(name);
              }, { persist: false })
            }
          >
            {selectedModelData ? (
              <ModelForm
                locale={locale}
                providers={Object.keys(state.mainConfig.providers)}
                name={selectedModelName}
                value={selectedModelData}
                onChange={(name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedModelName;
                    const currentModel = draft.mainConfig.models[currentName];
                    if (!currentModel) return;
                    const nextModel = {
                      ...currentModel,
                      ...patch,
                      provider: normalizeEntryName(patch.provider ?? currentModel.provider),
                      model: normalizeEntryName(patch.model ?? currentModel.model),
                    };
                    const nextName = renameModelInState(draft, currentName, nextModel);
                    setSelectedModel(nextName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() => {
                  void (async () => {
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "model"), selectedModelName))) return;
                    updateState((draft) => {
                      deleteModel(draft, selectedModelName);
                      setSelectedModel(Object.keys(draft.mainConfig.models)[0] ?? "");
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "profiles" ? (
          <SplitLayout
            listTitle={t(locale, "profiles")}
            listItems={profileEntries.map(([name]) => name)}
            dirtyItems={dirtyProfiles}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProfile}
            highlightedItem={state.activeProfile}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedProfile(item))}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const profile = draft.profiles[name];
                if (!profile) return;
                const copyName = createCopyName(name, draft.profiles);
                cloneProfile(draft, name, copyName, `${profile.label} Copy`);
                setSelectedProfile(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newProfile")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newProfile")}
            addButtonContent={<Plus size={15} />}
            onAdd={() =>
              updateState((draft) => {
                const firstModel = Object.keys(draft.mainConfig.models)[0];
                if (!firstModel) {
                  throw new Error("Please create a model first.");
                }
                const name = createUniqueName("profile", Object.keys(draft.profiles));
                upsertProfile(draft, {
                  name,
                  label: "New Profile",
                  default_model: firstModel,
                  default_thinking: true,
                  default_yolo: false,
                  default_plan_mode: false,
                  default_editor: "",
                  theme: "dark",
                  show_thinking_stream: false,
                  merge_all_available_skills: false,
                });
                setSelectedProfile(name);
              }, { persist: false })
            }
            renderItemAction={(name) =>
              name === state.activeProfile ? (
                <span className="list-current-badge" aria-label={t(locale, "summaryActive")} title={t(locale, "summaryActive")}>
                  {locale === "zh-CN" ? "已激活" : "Active"}
                </span>
              ) : (
                <button
                  className="list-activate-button"
                  type="button"
                  aria-label={`${t(locale, "activate")} ${name}`}
                  title={t(locale, "activate")}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateState((draft) => {
                      applyProfile(draft, name);
                    });
                  }}
                >
                  {t(locale, "activate")}
                </button>
              )
            }
          >
            {selectedProfileData ? (
              <ProfileForm
                locale={locale}
                models={Object.keys(state.mainConfig.models)}
                name={selectedProfileName}
                nameEditable={isProfileNameEditable}
                value={selectedProfileData}
                isActive={selectedProfileName === state.activeProfile}
                isTesting={profileTestingName === selectedProfileName}
                onChange={(name, nextProfile) =>
                  updateState((draft) => {
                    const currentName = selectedProfileName;
                    const normalizedName = isProfileNameEditable
                      ? ensureUniqueEntryName({
                          kind: "Profile",
                          name,
                          currentName,
                          existingNames: Object.keys(draft.profiles),
                        })
                      : currentName;
                    const normalizedProfile = {
                      ...nextProfile,
                      default_editor: "",
                      theme: "dark",
                    };
                    const nextProfiles = { ...draft.profiles };
                    delete nextProfiles[currentName];
                    nextProfiles[normalizedName] = { ...normalizedProfile, name: normalizedName };
                    if (draft.activeProfile === currentName) {
                      draft.activeProfile = normalizedName;
                    }
                    draft.profiles = nextProfiles;
                    setSelectedProfile(normalizedName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onTest={async () => {
                  const api = getApi();
                  if (!api || typeof api.testProfileConnectivity !== "function") {
                    setNotice("");
                    setError(t(locale, "profileRuntimeOutdated"));
                    return;
                  }
                  try {
                    setProfileTestingName(selectedProfileName);
                    await api.testProfileConnectivity(state, selectedProfileName);
                    setError("");
                    setNotice(t(locale, "profileTestSuccess"));
                  } catch (testError) {
                    const message = testError instanceof Error ? testError.message : String(testError);
                    setNotice("");
                    setError(translateError(locale, message));
                  } finally {
                    setProfileTestingName("");
                  }
                }}
                onActivate={() =>
                  updateState((draft) => {
                    applyProfile(draft, selectedProfileName);
                  })
                }
                onClone={() =>
                  updateState((draft) => {
                    const source = selectedProfileName;
                    cloneProfile(draft, source, `${source}-copy`, `${selectedProfileData.label} Copy`);
                    setSelectedProfile(`${source}-copy`);
                  }, { persist: false })
                }
                onDelete={() => {
                  void (async () => {
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "profile"), selectedProfileName))) return;
                    updateState((draft) => {
                      deleteProfile(draft, selectedProfileName);
                      setSelectedProfile(Object.keys(draft.profiles)[0] ?? "");
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "mcp" ? (
          <SplitLayout
            listTitle={t(locale, "mcpServers")}
            listItems={mcpEntries.map(([name]) => name)}
            dirtyItems={dirtyMcpServers}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedMcpServer}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedMcpServer(item))}
            addLabel={t(locale, "newMcpServer")}
            onAdd={() =>
              updateState((draft) => {
                const name = createUniqueName("mcp", Object.keys(draft.mcpConfig.mcpServers));
                draft.mcpConfig.mcpServers[name] = createDefaultMcpServer();
                setSelectedMcpServer(name);
              }, { persist: false })
            }
            headerActions={
              <button
                className="action-button compact icon-only"
                type="button"
                aria-label={t(locale, "importMcpJson")}
                title={t(locale, "importMcpJson")}
                onClick={() => {
                  const initialDraft = t(locale, "mcpImportPlaceholder");
                  setIsMcpImportOpen(true);
                  setMcpImportDraft(initialDraft);
                  setMcpImportInitialDraft(initialDraft);
                }}
              >
                <FileInput size={15} />
              </button>
            }
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newMcpServer")}
            addButtonContent={<Plus size={15} />}
            itemClassName={(name) =>
              state.mcpConfig.mcpServers[name]?.enabled === false ? "disabled" : null
            }
            renderItemAction={(name) => {
              const server = state.mcpConfig.mcpServers[name];
              if (!server) {
                return null;
              }
              return (
                <>
                  <button
                    className={server.enabled ? "list-toggle-button" : "list-toggle-button disabled"}
                    type="button"
                    aria-label={server.enabled ? (locale === "zh-CN" ? "禁用 MCP" : "Disable MCP") : (locale === "zh-CN" ? "启用 MCP" : "Enable MCP")}
                    title={server.enabled ? (locale === "zh-CN" ? "禁用 MCP" : "Disable MCP") : (locale === "zh-CN" ? "启用 MCP" : "Enable MCP")}
                    onClick={() =>
                      updateState((draft) => {
                        const target = draft.mcpConfig.mcpServers[name];
                        if (!target) return;
                        target.enabled = !target.enabled;
                      })
                    }
                  >
                    <Power size={15} />
                  </button>
                  <button
                    className="list-delete-button"
                    type="button"
                    aria-label={`${t(locale, "delete")} ${name}`}
                    title={t(locale, "delete")}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmDeleteResource(getResourceLabel(locale, "mcp"), name))) return;
                        updateState((draft) => {
                          delete draft.mcpConfig.mcpServers[name];
                          if (selectedMcpServer === name) {
                            setSelectedMcpServer(Object.keys(draft.mcpConfig.mcpServers)[0] ?? "");
                          }
                        });
                      })();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              );
            }}
          >
            <div className="mcp-workspace">
              {selectedMcpServerData ? (
                <McpServerForm
                  locale={locale}
                  name={selectedMcpServerName}
                  nameEditable={isMcpServerNameEditable}
                  value={selectedMcpServerData}
                  isTesting={mcpTestingName === selectedMcpServerName}
                  onRunAction={async (action, serverName) => {
                    const api = getApi();
                    const runAction = getMcpAction(api, action);
                    if (!api) {
                      setError("Electron preload API is unavailable. MCP command cannot continue.");
                      return;
                    }
                    if (!runAction) {
                      setNotice("");
                      setError(t(locale, "mcpRuntimeOutdated"));
                      return;
                    }
                    try {
                      if (action === "test") {
                        setMcpTestingName(serverName);
                      }
                      await persistState(state);
                      await runAction(serverName);
                      setError("");
                      setNotice(getMcpActionNotice(locale, action));
                    } catch (commandError) {
                      const message = commandError instanceof Error ? commandError.message : String(commandError);
                      setNotice("");
                      setError(translateError(locale, message));
                    } finally {
                      if (action === "test") {
                        setMcpTestingName("");
                      }
                    }
                  }}
                  onChange={(name, nextServer) =>
                    updateState((draft) => {
                      const currentName = selectedMcpServerName;
                      const normalizedName = isMcpServerNameEditable
                        ? ensureUniqueEntryName({
                            kind: "MCP server",
                            name,
                            currentName,
                            existingNames: Object.keys(draft.mcpConfig.mcpServers),
                          })
                        : currentName;
                      const nextServers = { ...draft.mcpConfig.mcpServers };
                      delete nextServers[currentName];
                      nextServers[normalizedName] = nextServer;
                      draft.mcpConfig.mcpServers = nextServers;
                      setSelectedMcpServer(normalizedName);
                    }, { persist: false })
                  }
                  onSave={() => void onSave()}
                  onDelete={() => {
                    void (async () => {
                      if (!(await confirmDeleteResource(getResourceLabel(locale, "mcp"), selectedMcpServerName))) return;
                      updateState((draft) => {
                        delete draft.mcpConfig.mcpServers[selectedMcpServerName];
                        setSelectedMcpServer(Object.keys(draft.mcpConfig.mcpServers)[0] ?? "");
                      });
                    })();
                  }}
                />
              ) : (
                <EmptyState locale={locale} />
              )}
            </div>
          </SplitLayout>
        ) : null}

        {activeTab === "skills" ? (
          <SplitLayout
            listTitle={t(locale, "skillsDirectory")}
            listItems={sortedSkillPathEntries.map((path) => path.id)}
            itemLabel={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? formatSkillPathLabel(path) : item;
            }}
            renderItemLabel={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? renderSkillPathLabel(path) : item;
            }}
            itemTitle={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? path.path : item;
            }}
            selectedItem={selectedSkillPathId}
            onSelect={(item) => {
              setSelectedSkillPath(item);
              setSelectedSkill("");
            }}
            addLabel={t(locale, "skillsRefresh")}
            onAdd={() => void refreshSkills(state)}
            addButtonTitle={t(locale, "skillsRefresh")}
            addButtonContent={
              isSkillsLoading ? <LoaderCircle size={15} className="button-spinner" /> : <RefreshCw size={15} />
            }
            addButtonClassName={isSkillsLoading ? "action-button compact icon-only is-loading" : "action-button compact icon-only"}
            itemClassName={(item) => {
              const path = skillPathEntries.find((entry) => entry.id === item);
              if (!path) {
                return null;
              }
              if (!path.exists || !path.selected) {
                return "disabled";
              }
              return null;
            }}
            renderItemAction={(item) => {
              const path = skillPathEntries.find((entry) => entry.id === item);
              if (!path) {
                return null;
              }
              const pathSkills = skillEntries.filter((skill) => skill.sourcePathId === item);
              return (
                <>
                  <span className="list-current-badge">{pathSkills.length}</span>
                </>
              );
            }}
          >
            <SkillsWorkspace
              locale={locale}
              report={skillsReport}
              selectedPath={selectedSkillPathData}
              visibleSkills={visibleSkillEntries}
              selectedSkill={selectedSkillData}
              viewMode={skillsViewMode}
              onViewModeChange={setSkillsViewMode}
              onSelectSkill={setSelectedSkill}
              isLoading={isSkillsLoading}
            />
          </SplitLayout>
        ) : null}

        {activeTab === "settings" ? (
          <section className="glass-panel form-panel settings-grid">
            <div className="section-title">{t(locale, "settings")}</div>
            <SettingsGroup title={t(locale, "settingsGroupPaths")}>
              <PathField
                locale={locale}
                label={t(locale, "configPath")}
                value={state.configPath}
                onView={() => openDocumentViewer("config")}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.configPath = value;
                    draft.panelSettings.config_path = value;
                  })
                }
              />
              <PathField
                locale={locale}
                label={t(locale, "profilesPath")}
                value={state.profilesPath}
                onView={() => openDocumentViewer("profiles")}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.profilesPath = value;
                    draft.panelSettings.profiles_path = value;
                    draft.panelSettings.follow_config_profiles = false;
                  })
                }
              />
              <PathField
                locale={locale}
                label={t(locale, "panelSettingsPath")}
                value={state.panelSettingsPath}
                onView={() => openDocumentViewer("panel")}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettingsPath = value;
                  })
                }
              />
              <PathField
                locale={locale}
                label={t(locale, "mcpConfigPathLabel")}
                value={state.mcpConfigPath}
                readOnly
                fileType="json"
                onView={() => openDocumentViewer("mcp")}
                onChange={() => {}}
              />
            </SettingsGroup>
            <SettingsGroup title={t(locale, "settingsGroupAppearance")}>
              <SelectField
                label={t(locale, "locale")}
                value={state.panelSettings.locale}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.locale = value as Locale;
                  })
                }
                options={LOCALE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.longLabel,
                  badge: option.shortLabel,
                  badgeClassName: "flag",
                }))}
              />
              <SelectField
                label={t(locale, "theme")}
                value={state.panelSettings.theme}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.theme = value as AppearanceMode;
                  })
                }
                selectedIcon={(THEME_OPTIONS.find((option) => option.value === state.panelSettings.theme) ?? THEME_OPTIONS[0]).icon}
                options={THEME_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label[locale],
                  icon: option.icon,
                }))}
              />
              <FontSizeSliderField
                locale={locale}
                label={t(locale, "uiFontSize")}
                value={state.panelSettings.ui_font_size ?? "standard"}
                options={UI_FONT_SIZE_OPTIONS}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.ui_font_size = value;
                  })
                }
              />
              <SelectField
                label={t(locale, "displayOpenMode")}
                value={state.panelSettings.display_open_mode}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.display_open_mode = value as DisplayOpenMode;
                  })
                }
                options={DISPLAY_OPEN_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label[locale],
                }))}
              />
            </SettingsGroup>
            <SettingsGroup title={t(locale, "settingsGroupBehavior")}>
              <label className="toggle-row">
                <span>{t(locale, "trayIcon")}</span>
                <input
                  type="checkbox"
                  checked={state.panelSettings.tray_icon}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    updateImmediateState((draft) => {
                      draft.panelSettings.tray_icon = enabled;
                      draft.panelSettings.close_behavior = enabled ? "keep-in-tray" : "quit";
                    });
                  }}
                />
              </label>
              {state.panelSettings.tray_icon ? (
                <SelectField
                  label={t(locale, "closeBehavior")}
                  value={state.panelSettings.close_behavior}
                  onChange={(value) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.close_behavior = value as CloseBehavior;
                    })
                  }
                  options={CLOSE_BEHAVIOR_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label[locale],
                  }))}
                />
              ) : null}
              <label className="toggle-row">
                <span>{t(locale, "followConfigProfiles")}</span>
                <input
                  type="checkbox"
                  checked={state.panelSettings.follow_config_profiles}
                  onChange={(event) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.follow_config_profiles = event.target.checked;
                    })
                  }
                />
              </label>
            </SettingsGroup>
            <SettingsGroup title={t(locale, "settingsGroupBackup")}>
              <SelectField
                label={t(locale, "backupStrategy")}
                value={state.panelSettings.backup_strategy}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_strategy = value as BackupStrategy;
                  })
                }
                options={BACKUP_STRATEGY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(locale, option.labelKey),
                }))}
              />
              {state.panelSettings.backup_strategy === "scheduled" ? (
                <SelectField
                  label={t(locale, "backupFrequency")}
                  value={state.panelSettings.backup_frequency}
                  onChange={(value) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.backup_frequency = value as BackupFrequency;
                    })
                  }
                  options={BACKUP_FREQUENCY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(locale, option.labelKey),
                  }))}
                />
              ) : null}
              <Field
                label={t(locale, "backupRetentionCount")}
                value={String(state.panelSettings.backup_retention_count)}
                onChange={(value) => {
                  const nextCount = Number.parseInt(value, 10);
                  if (Number.isNaN(nextCount)) {
                    return;
                  }
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_retention_count = Math.max(1, Math.min(99, nextCount));
                  });
                }}
                inputMode="numeric"
              />
              <SelectField
                label={t(locale, "backupDestinationType")}
                value={state.panelSettings.backup_destination_type}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_destination_type = value as BackupDestinationType;
                  })
                }
                options={BACKUP_DESTINATION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(locale, option.labelKey),
                }))}
              />
              {state.panelSettings.backup_destination_type === "local" ? (
                <PathField
                  locale={locale}
                  label={t(locale, "backupLocalPath")}
                  value={state.panelSettings.backup_local_path}
                  pickerProperties={["openDirectory", "createDirectory"]}
                  onChange={(value) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.backup_local_path = value;
                    })
                  }
                />
              ) : (
                <>
                  <Field
                    label={t(locale, "backupWebdavUrl")}
                    value={state.panelSettings.backup_webdav_url}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_url = value;
                      })
                    }
                  />
                  <Field
                    label={t(locale, "backupWebdavUsername")}
                    value={state.panelSettings.backup_webdav_username}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_username = value;
                      })
                    }
                  />
                  <SecretField
                    label={t(locale, "backupWebdavPassword")}
                    value={state.panelSettings.backup_webdav_password}
                    visible={isBackupPasswordVisible}
                    onToggleVisible={() => setIsBackupPasswordVisible((current) => !current)}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_password = value;
                      })
                    }
                  />
                  <Field
                    label={t(locale, "backupWebdavPath")}
                    value={state.panelSettings.backup_webdav_path}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_path = value;
                      })
                    }
                  />
                </>
              )}
              <div className="button-row settings-action-row">
                <button
                  className={isBackupRunning ? "action-button action-button-primary is-loading" : "action-button action-button-primary"}
                  type="button"
                  disabled={isBackupRunning}
                  onClick={runManualBackup}
                >
                  {isBackupRunning ? <LoaderCircle size={16} className="button-spinner" /> : <History size={16} />}
                  <span>{isBackupRunning ? t(locale, "backupRunning") : t(locale, "backupNow")}</span>
                </button>
                <button
                  className={
                    backupRecordsDialog?.isLoading ? "action-button is-loading" : "action-button"
                  }
                  type="button"
                  disabled={backupRecordsDialog?.isLoading}
                  onClick={openBackupRecords}
                >
                  {backupRecordsDialog?.isLoading ? <LoaderCircle size={16} className="button-spinner" /> : <FolderOpen size={16} />}
                  <span>{t(locale, "backupViewRecords")}</span>
                </button>
                {state.panelSettings.backup_destination_type === "webdav" ? (
                  <button
                    className={isWebDavTesting ? "action-button is-loading" : "action-button"}
                    type="button"
                    disabled={isWebDavTesting}
                    onClick={runWebDavTest}
                  >
                    {isWebDavTesting ? <LoaderCircle size={16} className="button-spinner" /> : <Bug size={16} />}
                    <span>{isWebDavTesting ? t(locale, "backupWebdavTesting") : t(locale, "backupWebdavTest")}</span>
                  </button>
                ) : null}
              </div>
            </SettingsGroup>
          </section>
        ) : null}

        {activeTab === "about" ? (
          <AboutPage locale={locale} />
        ) : null}
      </main>
      {confirmDialog ? (
        <ConfirmDialog
          {...confirmDialog}
          onConfirm={() => closeConfirmDialog(true)}
          onCancel={() => closeConfirmDialog(false)}
        />
      ) : null}
      {documentViewer ? (
        <DocumentViewerDialog
          locale={locale}
          {...documentViewer}
          onClose={() => setDocumentViewer(null)}
        />
      ) : null}
      {backupRecordsDialog ? (
        <BackupRecordsDialog
          locale={locale}
          {...backupRecordsDialog}
          onDelete={deleteBackupRecord}
          onRestore={restoreBackupRecord}
          onClose={() => setBackupRecordsDialog(null)}
        />
      ) : null}
      {isMcpImportOpen ? (
        <McpImportDialog
          locale={locale}
          value={mcpImportDraft}
          onChange={setMcpImportDraft}
          onCancel={requestCloseMcpImportDialog}
          onImport={() => {
            try {
              const imported = parseMcpConfigStrict(mcpImportDraft);
              const importedNames = Object.keys(imported.mcpServers);
              if (!importedNames.length) {
                setNotice("");
                setError(t(locale, "mcpImportInvalid"));
                return;
              }

              updateState((draft) => {
                draft.mcpConfig.mcpServers = {
                  ...draft.mcpConfig.mcpServers,
                  ...imported.mcpServers,
                };
                setSelectedMcpServer(importedNames[0] ?? "");
              }, { persist: false });

              closeMcpImportDialog();
              setError("");
              setNotice(t(locale, "mcpImportSuccess"));
            } catch (importError) {
              const message = importError instanceof Error ? importError.message : String(importError);
              setNotice("");
              setError(`${t(locale, "mcpImportInvalid")} ${message}`);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard(props: { label: string; value: string; note?: string; title?: string; accent?: boolean }): JSX.Element {
  return (
    <div className={props.accent ? "summary-card accent" : "summary-card"} title={props.title}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.note ? <small>{props.note}</small> : null}
    </div>
  );
}

function ConfirmDialog(
  props: ConfirmDialogState & {
    onConfirm: () => void;
    onCancel: () => void;
  },
): JSX.Element {
  const Icon = props.kind === "delete" ? Trash2 : Save;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section className="confirm-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog-header">
          <div className={props.tone === "danger" ? "confirm-dialog-icon danger" : "confirm-dialog-icon"}>
            <Icon size={20} />
          </div>
          <div className="confirm-dialog-copy">
            <h3 id="confirm-dialog-title">{props.title}</h3>
            {props.description ? <p>{props.description}</p> : null}
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button className="action-button" type="button" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
          <button
            className={
              props.tone === "danger"
                ? "action-button confirm-dialog-confirm danger"
                : "action-button action-button-primary confirm-dialog-confirm"
            }
            type="button"
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function DocumentViewerDialog(
  props: DocumentViewerState & {
    locale: Locale;
    onClose: () => void;
  },
): JSX.Element {
  const [copied, setCopied] = useState(false);

  useDialogEscape(props.onClose);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(props.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      className="document-viewer-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="document-viewer glass-panel" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
        <div className="document-viewer-header">
          <div className="document-viewer-title">
            <div className="document-viewer-icon">
              <FileText size={18} />
            </div>
            <div>
              <h3 id="document-viewer-title">{props.title}</h3>
              <p>{props.format}</p>
            </div>
          </div>
          <div className="document-viewer-actions">
            <button className="action-button compact icon-only" type="button" aria-label="Close" onClick={props.onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <CodePanel
          title={props.format}
          content={props.content}
          onCopy={handleCopy}
          copied={copied}
        />
      </section>
    </div>
  );
}

function BackupRecordsDialog(
  props: BackupRecordsDialogState & {
    locale: Locale;
    onDelete: (record: BackupRecord) => void;
    onRestore: (record: BackupRecord) => void;
    onClose: () => void;
  },
): JSX.Element {
  const sourceLabel =
    props.destinationType === "webdav"
      ? t(props.locale, "backupRecordsSourceWebdav")
      : t(props.locale, "backupRecordsSourceLocal");

  return (
    <div
      className="backup-records-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="backup-records-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="backup-records-title">
        <div className="backup-records-header">
          <div className="backup-records-title">
            <div className="backup-records-icon">
              <History size={18} />
            </div>
            <div>
              <h3 id="backup-records-title">{t(props.locale, "backupRecordsTitle")}</h3>
              <p>{sourceLabel}</p>
            </div>
          </div>
          <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "cancel")} onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>
        {props.isLoading ? (
          <div className="backup-records-empty">
            <LoaderCircle size={18} className="button-spinner" />
            <span>{t(props.locale, "backupRecordsLoading")}</span>
          </div>
        ) : props.errorMessage ? (
          <div className="backup-records-empty is-error">
            <span>{props.errorMessage}</span>
          </div>
        ) : props.records.length ? (
          <div className="backup-records-list">
            <div className="backup-records-table-head">
              <span>{t(props.locale, "backupRecordsPath")}</span>
              <span>{t(props.locale, "backupRecordsCreatedAt")}</span>
              <span>{t(props.locale, "backupRecordsItems")}</span>
            </div>
            {props.records.map((record) => (
              <article key={`${record.name}-${record.path}`} className="backup-record-card">
                <div className="backup-record-meta">
                  <div>
                    <span>{record.name}</span>
                  </div>
                  <div>
                    <span>{formatBackupDisplayDate(props.locale, record.createdAt)}</span>
                  </div>
                  <div className="backup-record-action-cell">
                    <div className="backup-record-actions">
                      <button
                        className={
                          props.restoringName === record.name
                            ? "action-button compact is-loading"
                            : "action-button compact"
                        }
                        type="button"
                        disabled={
                          props.restoringName === record.name || props.deletingName === record.name
                        }
                        onClick={() => props.onRestore(record)}
                      >
                        {props.restoringName === record.name ? (
                          <LoaderCircle size={16} className="button-spinner" />
                        ) : null}
                        <span>
                          {props.restoringName === record.name
                            ? t(props.locale, "backupRestoring")
                            : t(props.locale, "restore")}
                        </span>
                      </button>
                      <button
                        className={props.deletingName === record.name ? "action-button compact danger is-loading" : "action-button compact danger"}
                        type="button"
                        disabled={
                          props.deletingName === record.name || props.restoringName === record.name
                        }
                        onClick={() => props.onDelete(record)}
                      >
                        {props.deletingName === record.name ? <LoaderCircle size={16} className="button-spinner" /> : null}
                        <span>{t(props.locale, "delete")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="backup-records-empty">
            <span>{t(props.locale, "backupRecordsEmpty")}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function SkillsDetailDialog(props: {
  locale: Locale;
  skill: SkillEntry;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}): JSX.Element {
  useDialogEscape(props.onClose);
  const detailItems = [
    { label: t(props.locale, "skillsSource"), value: props.skill.sourceLabel },
    { label: t(props.locale, "skillsDirectory"), value: props.skill.directoryPath },
    { label: t(props.locale, "skillsFrontmatter"), value: props.skill.frontmatter ? t(props.locale, "overviewOn") : t(props.locale, "overviewOff") },
    { label: t(props.locale, "skillsLineCount"), value: String(props.skill.lineCount) },
    { label: t(props.locale, "skillsAttachments"), value: formatSkillAssets(props.locale, props.skill) },
    ...(props.skill.overriddenBy
      ? [{ label: t(props.locale, "skillsOverrideTarget"), value: props.skill.overriddenBy }]
      : []),
    ...(props.skill.metadata.license
      ? [{ label: "license", value: props.skill.metadata.license }]
      : []),
    ...(props.skill.metadata.compatibility
      ? [{ label: "compatibility", value: props.skill.metadata.compatibility }]
      : []),
    ...(Object.keys(props.skill.metadata.metadata).length > 0
      ? [{
          label: "metadata",
          value: Object.entries(props.skill.metadata.metadata).map(([key, value]) => `${key}: ${value}`).join(" · "),
        }]
      : []),
  ];

  return (
    <div
      className="skills-detail-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="skills-detail-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="skills-detail-dialog-title">
        <div className="skills-detail-dialog-header">
          <div className="skills-detail-dialog-copy">
            <div className="skills-detail-dialog-title-row">
              <span className="list-current-badge">{props.skill.metadata.type}</span>
              <h3 id="skills-detail-dialog-title">{props.skill.name}</h3>
            </div>
            {props.skill.metadata.description ? (
              <p className="skills-detail-dialog-description">{props.skill.metadata.description}</p>
            ) : null}
          </div>
          <div className="document-viewer-actions">
            <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "close")} onClick={props.onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="skills-detail-summary-grid">
          {detailItems.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={[
                "skills-kv",
                "skills-kv-compact",
                item.value.includes(" · ") || item.value.includes(": ") ? "skills-kv-multiline" : "",
              ].filter(Boolean).join(" ")}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <CodePanel
          title={props.skill.skillFilePath}
          content={props.skill.content}
          onCopy={props.onCopy}
          copied={props.copied}
        />
      </section>
    </div>
  );
}

function SkillsWorkspace(props: {
  locale: Locale;
  report: SkillsScanReport | null;
  selectedPath: SkillsScanReport["paths"][number] | null;
  visibleSkills: SkillEntry[];
  selectedSkill: SkillEntry | null;
  viewMode: SkillsViewMode;
  onViewModeChange: (mode: SkillsViewMode) => void;
  onSelectSkill: (skillId: string) => void;
  isLoading: boolean;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);

  const pageSize = props.viewMode === "grid" ? 9 : 3;
  const totalPages = Math.max(1, Math.ceil(props.visibleSkills.length / pageSize));
  const pagedSkills = props.visibleSkills.slice((page - 1) * pageSize, page * pageSize);
  const gridStyle =
    props.viewMode === "grid" && pagedSkills.length > 0 && pagedSkills.length < 4
      ? {
          gridTemplateColumns: `repeat(${pagedSkills.length}, 240px)`,
          justifyContent: "start" as const,
        }
      : undefined;

  useEffect(() => {
    setPage(1);
  }, [props.selectedPath?.id, props.viewMode]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleCopy = (): void => {
    if (!props.selectedSkill) {
      return;
    }
    void navigator.clipboard.writeText(props.selectedSkill.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  if (props.isLoading && !props.report) {
    return (
      <section className="glass-panel form-panel empty-state">
        <div className="section-title">{t(props.locale, "skills")}</div>
        <p>{t(props.locale, "skillsLoading")}</p>
      </section>
    );
  }

  if (!props.report) {
    return (
      <section className="glass-panel form-panel empty-state">
        <div className="section-title">{t(props.locale, "skills")}</div>
        <p>{t(props.locale, "skillsEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="skills-workspace">
      <section className="glass-panel form-panel skills-overview-panel">
        <div className="skills-detail-header">
          <div className="skills-header-main">
            <div className="section-title">{t(props.locale, "skills")}</div>
            <div className="skills-path-caption">{props.selectedPath?.path ?? t(props.locale, "overviewNone")}</div>
          </div>
          <div className="skills-detail-badges">
            <div className="skills-view-toggle" role="tablist" aria-label={t(props.locale, "skillsViewMode")}>
              <button
                className={props.viewMode === "grid" ? "skills-view-button active" : "skills-view-button"}
                type="button"
                onClick={() => props.onViewModeChange("grid")}
                aria-pressed={props.viewMode === "grid"}
                title={t(props.locale, "skillsViewGrid")}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={props.viewMode === "list" ? "skills-view-button active" : "skills-view-button"}
                type="button"
                onClick={() => props.onViewModeChange("list")}
                aria-pressed={props.viewMode === "list"}
                title={t(props.locale, "skillsViewList")}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {props.selectedPath && !isSkillPathLoaded(props.selectedPath) ? (
          <p className="skills-note skills-note-warning">{formatSkillPathNotice(props.locale, props.selectedPath)}</p>
        ) : null}

        {props.visibleSkills.length ? (
          <>
            <div className="skills-pagination">
              <span className="skills-pagination-info">
                {formatMessage(t(props.locale, "skillsPagination"), {
                  current: page,
                  total: totalPages,
                  count: props.visibleSkills.length,
                })}
              </span>
              <div className="skills-pagination-actions">
                <button
                  className="action-button compact"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t(props.locale, "previousPage")}
                </button>
                <button
                  className="action-button compact"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  {t(props.locale, "nextPage")}
                </button>
              </div>
            </div>
            <div
              className={props.viewMode === "grid" ? "skills-read-grid" : "skills-read-list"}
              role="list"
              style={gridStyle}
            >
              {pagedSkills.map((skill) => (
              <button
                key={skill.id}
                className={[
                  props.viewMode === "grid" ? "skills-read-card" : "skills-read-row",
                  skill.id === props.selectedSkill?.id ? "active" : "",
                  skill.enabled ? "is-enabled" : "is-disabled",
                  skill.effective ? "" : "muted",
                ].filter(Boolean).join(" ")}
                type="button"
                onClick={() => props.onSelectSkill(skill.id)}
              >
                <div className={props.viewMode === "grid" ? "skills-read-card-top" : "skills-read-row-main"}>
                  {props.viewMode === "grid" ? (
                    <div className="skills-read-row-header">
                      <span className="list-current-badge">{skill.metadata.type}</span>
                      <strong>{skill.name}</strong>
                    </div>
                  ) : (
                    <div className="skills-read-row-header">
                      <span className="list-current-badge">{skill.metadata.type}</span>
                      <strong>{skill.name}</strong>
                    </div>
                  )}
                  <p>{skill.metadata.description}</p>
                  {props.viewMode === "list" ? (
                    <div className="skills-read-row-folder">{skill.directoryName}</div>
                  ) : null}
                </div>
                {props.viewMode === "grid" ? (
                  <div className="skills-read-card-meta">
                    <div className="skills-read-row-folder">{skill.directoryName}</div>
                  </div>
                ) : null}
              </button>
              ))}
            </div>
          </>
        ) : (
          <div className="skills-empty-issues">{t(props.locale, "skillsEmptyInDirectory")}</div>
        )}
      </section>
      {props.selectedSkill ? (
        <SkillsDetailDialog
          locale={props.locale}
          skill={props.selectedSkill}
          copied={copied}
          onCopy={handleCopy}
          onClose={() => props.onSelectSkill("")}
        />
      ) : null}
    </section>
  );
}

function SettingsGroup(props: { title: string; children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <section className="settings-group">
      <div className="settings-group-header">
        <div className="settings-group-title">
          <span className="settings-group-dot" aria-hidden="true" />
          <span>{props.title}</span>
        </div>
        <div className="settings-group-rule" aria-hidden="true" />
      </div>
      <div className="settings-group-body">{props.children}</div>
    </section>
  );
}

function SplitLayout(props: {
  listTitle: string;
  listItems: string[];
  itemLabel?: (item: string) => string;
  renderItemLabel?: (item: string) => JSX.Element | string;
  itemTitle?: (item: string) => string;
  dirtyItems?: Set<string>;
  dirtyLabel?: string;
  selectedItem: string;
  highlightedItem?: string;
  onSelect: (item: string) => void;
  copyLabel?: string;
  onCopy?: (item: string) => void;
  addLabel: string;
  onAdd: () => void;
  addButtonContent?: JSX.Element;
  addButtonTitle?: string;
  addButtonClassName?: string;
  itemClassName?: (item: string) => string | null;
  renderItemAction?: (item: string) => JSX.Element | null;
  headerActions?: JSX.Element | null;
  reverse?: boolean;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section className={props.reverse ? "split-layout split-layout-reverse" : "split-layout"}>
      <div className="glass-panel list-panel">
        <div className="list-header">
          <div className="section-title">{props.listTitle}</div>
          <div className="list-header-actions">
            {props.headerActions}
            <button
              className={props.addButtonClassName ?? "action-button compact"}
              type="button"
              aria-label={props.addButtonTitle ?? props.addLabel}
              title={props.addButtonTitle ?? props.addLabel}
              onClick={props.onAdd}
            >
              {props.addButtonContent ?? props.addLabel}
            </button>
          </div>
        </div>
        <div className="list-scroll">
          {props.listItems.map((item) => (
            <div
              key={item}
              className={[
                "list-row",
                item === props.selectedItem ? "active" : "",
                item === props.highlightedItem ? "current" : "",
                props.itemClassName?.(item) ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                className="list-item"
                title={props.itemTitle ? props.itemTitle(item) : props.itemLabel ? props.itemLabel(item) : item}
                onClick={() => {
                  if (item === props.selectedItem) return;
                  props.onSelect(item);
                }}
              >
                {props.renderItemLabel ? props.renderItemLabel(item) : props.itemLabel ? props.itemLabel(item) : item}
              </button>
              {props.dirtyItems?.has(item) ? (
                <span className="list-dirty-badge" title={props.dirtyLabel} aria-label={props.dirtyLabel}>
                  <Star size={14} fill="currentColor" />
                </span>
              ) : null}
              <div className="list-row-actions">
                {props.copyLabel && props.onCopy ? (
                  <button
                    className="list-copy-button"
                    type="button"
                    aria-label={`${props.copyLabel} ${item}`}
                    title={props.copyLabel}
                    onClick={() => props.onCopy?.(item)}
                  >
                    <Copy size={15} />
                  </button>
                ) : null}
                {props.renderItemAction?.(item)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {props.children}
    </section>
  );
}

function EmptyState(props: { locale: Locale }): JSX.Element {
  return (
    <section className="glass-panel form-panel empty-state">
      <div className="section-title">{t(props.locale, "emptyState")}</div>
      <p>{t(props.locale, "addHint")}</p>
    </section>
  );
}

function createCopyName(sourceName: string, existing: Record<string, unknown>): string {
  const baseName = `${sourceName} Copy`;
  if (!existing[baseName]) {
    return baseName;
  }
  let index = 2;
  while (existing[`${baseName}${index}`]) {
    index += 1;
  }
  return `${baseName}${index}`;
}

function createDefaultMcpServer(): McpServerConfig {
  return {
    enabled: true,
    transport: "streamable-http",
    url: "",
    headers: {},
    command: "",
    args: [],
    env: {},
  };
}

function switchMcpTransport(server: McpServerConfig, transport: McpTransport): McpServerConfig {
  if (transport === server.transport) {
    return server;
  }
  return {
    enabled: server.enabled,
    transport,
    url: "",
    headers: {},
    command: "",
    args: [],
    env: {},
    extra: server.extra,
  };
}

function parseListLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatListLines(value: string[]): string {
  return value.join("\n");
}

function isRemoteMcpTransport(transport: McpTransport): boolean {
  return transport !== "stdio";
}

function parseRecordLines(value: string): Record<string, string> {
  const pairs = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const entryValue = line.slice(separatorIndex + 1).trim();
      if (!key) {
        return null;
      }
      return [key, entryValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  return Object.fromEntries(pairs);
}

function formatRecordLines(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, entryValue]) => `${key}=${entryValue}`)
    .join("\n");
}

function toRecordEntries(value: Record<string, string>): Array<{ id: string; key: string; value: string }> {
  const entries = Object.entries(value).map(([entryKey, entryValue], index) => ({
    id: `${entryKey}-${index}`,
    key: entryKey,
    value: entryValue,
  }));
  return entries.length ? entries : [{ id: "new-0", key: "", value: "" }];
}

function fromRecordEntries(entries: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(
    entries
      .map((entry) => [entry.key.trim(), entry.value] as const)
      .filter(([entryKey]) => Boolean(entryKey)),
  );
}

function ProviderForm(props: {
  locale: Locale;
  name: string;
  nameEditable: boolean;
  value: { type: string; base_url: string; api_key: string };
  onChange: (name: string, patch: { type?: string; base_url?: string; api_key?: string }) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const providerTypeOptions = ensureEnumOptions(
    PROVIDER_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label[props.locale],
    })),
    props.value.type,
    props.locale,
  );

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Provider 编辑" : "Provider Editor"}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(value) => props.onChange(value, {})} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <SelectField
        label={t(props.locale, "formType")}
        value={props.value.type}
        onChange={(value) => props.onChange(props.name, { type: value })}
        options={providerTypeOptions}
        popoverClassName="field-select-popover-full"
      />
      <Field label={t(props.locale, "formBaseUrl")} value={props.value.base_url} onChange={(value) => props.onChange(props.name, { base_url: value })} />
      <SecretField
        label={t(props.locale, "formApiKey")}
        value={props.value.api_key}
        visible={isApiKeyVisible}
        onToggleVisible={() => setIsApiKeyVisible((current) => !current)}
        onChange={(value) => props.onChange(props.name, { api_key: value })}
      />
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveProvider")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function SecretField(props: {
  label: string;
  value: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
  showLabel?: string;
  hideLabel?: string;
}): JSX.Element {
  const Icon = props.visible ? EyeOff : Eye;
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="secret-field">
        <input
          type={props.visible ? "text" : "password"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button
          className="secret-toggle"
          type="button"
          aria-label={props.visible ? (props.hideLabel ?? "Hide secret") : (props.showLabel ?? "Show secret")}
          onClick={props.onToggleVisible}
        >
          <Icon size={16} />
        </button>
      </div>
    </label>
  );
}

function ModelForm(props: {
  locale: Locale;
  providers: string[];
  name: string;
  value: {
    provider: string;
    model: string;
    max_context_size: number;
    capabilities: string[];
  };
  onChange: (
    name: string,
    patch: Partial<{
      provider: string;
      model: string;
      max_context_size: number;
      capabilities: string[];
    }>,
  ) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const capabilityOptions = ensureEnumOptions(
    MODEL_CAPABILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label[props.locale],
    })),
    props.value.capabilities,
    props.locale,
  );

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Model 编辑" : "Model Editor"}</div>
      <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      <SelectField
        label={t(props.locale, "formProvider")}
        value={props.value.provider}
        onChange={(value) => props.onChange(props.name, { provider: value })}
        options={props.providers.map((provider) => ({ value: provider, label: provider }))}
      />
      <Field
        label={t(props.locale, "formModel")}
        value={props.value.model}
        onChange={(value) => props.onChange(props.name, { model: normalizeEntryName(value) })}
      />
      <Field
        label={t(props.locale, "formContextSize")}
        value={String(props.value.max_context_size)}
        onChange={(value) => props.onChange(props.name, { max_context_size: Number(value) || 0 })}
      />
      <MultiSelectField
        label={t(props.locale, "formCapabilities")}
        value={props.value.capabilities}
        onChange={(value) => props.onChange(props.name, { capabilities: value })}
        options={capabilityOptions}
        emptyLabel={t(props.locale, "formCapabilitiesEmpty")}
        popoverClassName="field-select-popover-full"
      />
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveModel")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function McpServerForm(props: {
  locale: Locale;
  name: string;
  nameEditable: boolean;
  value: McpServerConfig;
  isTesting: boolean;
  onRunAction: (action: "test" | "auth" | "reset-auth", name: string) => Promise<void>;
  onChange: (name: string, value: McpServerConfig) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const transportOptions = MCP_TRANSPORT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label[props.locale],
  }));

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "MCP 编辑" : "MCP Editor"}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...props.value })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <SelectField
        label={t(props.locale, "formTransport")}
        value={props.value.transport}
        onChange={(next) => props.onChange(props.name, switchMcpTransport(props.value, next as McpTransport))}
        options={transportOptions}
        popoverClassName="field-select-popover-full"
      />
      {isRemoteMcpTransport(props.value.transport) ? (
        <>
          <Field
            label={t(props.locale, "formUrl")}
            value={props.value.url}
            onChange={(next) => props.onChange(props.name, { ...props.value, url: next })}
          />
          <KeyValueListField
            locale={props.locale}
            label={t(props.locale, "formHeaders")}
            value={props.value.headers}
            addLabel={t(props.locale, "addHeader")}
            keyPlaceholder={props.locale === "zh-CN" ? "Header 名称" : "Header name"}
            valuePlaceholder={props.locale === "zh-CN" ? "Header 值" : "Header value"}
            onChange={(next) => props.onChange(props.name, { ...props.value, headers: next })}
          />
        </>
      ) : (
        <>
          <Field
            label={t(props.locale, "formCommand")}
            value={props.value.command}
            onChange={(next) => props.onChange(props.name, { ...props.value, command: next })}
          />
          <TextAreaField
            label={t(props.locale, "formArgs")}
            value={formatListLines(props.value.args)}
            placeholder={t(props.locale, "formArgsPlaceholder")}
            onChange={(next) => props.onChange(props.name, { ...props.value, args: parseListLines(next) })}
          />
          <KeyValueListField
            locale={props.locale}
            label={t(props.locale, "formEnv")}
            value={props.value.env}
            addLabel={t(props.locale, "addEnv")}
            keyPlaceholder={props.locale === "zh-CN" ? "变量名称" : "Variable name"}
            valuePlaceholder={props.locale === "zh-CN" ? "变量值" : "Variable value"}
            onChange={(next) => props.onChange(props.name, { ...props.value, env: next })}
          />
        </>
      )}
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveMcpServer")}</span>
        </button>
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={() => void props.onRunAction("test", props.name)}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "mcpTesting") : t(props.locale, "mcpTest")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function McpImportDialog(props: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  onCancel: () => void;
}): JSX.Element {
  useDialogEscape(props.onCancel);

  return (
    <div
      className="mcp-import-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section className="glass-panel form-panel mcp-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-import-title">
        <div className="mcp-import-header">
          <div>
            <div className="section-title" id="mcp-import-title">{t(props.locale, "importMcpJson")}</div>
            <p className="mcp-import-hint">{t(props.locale, "mcpImportHint")}</p>
          </div>
          <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "cancel")} onClick={props.onCancel}>
            <X size={16} />
          </button>
        </div>
        <label className="field">
          <span>{t(props.locale, "pasteMcpJson")}</span>
          <textarea
            className="mcp-import-textarea"
            rows={12}
            value={props.value}
            placeholder={t(props.locale, "mcpImportPlaceholder")}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="action-button action-button-primary" type="button" onClick={props.onImport}>
            <span>{t(props.locale, "mcpImportApply")}</span>
          </button>
          <button className="action-button" type="button" onClick={props.onCancel}>
            <span>{t(props.locale, "mcpImportCancel")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function useDialogEscape(onClose: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

function ProfileForm(props: {
  locale: Locale;
  models: string[];
  name: string;
  nameEditable: boolean;
  value: Profile;
  isActive: boolean;
  isTesting: boolean;
  onChange: (name: string, value: Profile) => void;
  onSave: () => void;
  onTest: () => void;
  onActivate: () => void;
  onClone: () => void;
  onDelete: () => void;
}): JSX.Element {
  const value = props.value;
  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Profile 编辑" : "Profile Editor"}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...value, name: next })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <Field label={t(props.locale, "formLabel")} value={value.label} onChange={(next) => props.onChange(props.name, { ...value, label: next })} />
      <SelectField
        label={t(props.locale, "formDefaultModel")}
        value={value.default_model}
        onChange={(next) => props.onChange(props.name, { ...value, default_model: next })}
        options={props.models.map((model) => ({ value: model, label: model }))}
      />
      <Toggle label={t(props.locale, "formThinking")} checked={value.default_thinking} onChange={(checked) => props.onChange(props.name, { ...value, default_thinking: checked })} />
      <Toggle label={t(props.locale, "formYolo")} checked={value.default_yolo} onChange={(checked) => props.onChange(props.name, { ...value, default_yolo: checked })} />
      <Toggle label={t(props.locale, "formPlanMode")} checked={value.default_plan_mode} onChange={(checked) => props.onChange(props.name, { ...value, default_plan_mode: checked })} />
      <Toggle label={t(props.locale, "formStream")} checked={value.show_thinking_stream} onChange={(checked) => props.onChange(props.name, { ...value, show_thinking_stream: checked })} />
      <Toggle label={t(props.locale, "formMergeSkills")} checked={value.merge_all_available_skills} onChange={(checked) => props.onChange(props.name, { ...value, merge_all_available_skills: checked })} />
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveProfile")}</span>
        </button>
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={props.onTest}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "profileTesting") : t(props.locale, "profileTest")}</span>
        </button>
        <button className={props.isActive ? "action-button action-button-primary" : "action-button"} onClick={props.onActivate}>{t(props.locale, "activate")}</button>
        <button className="action-button" onClick={props.onClone}>{t(props.locale, "clone")}</button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: string;
}): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input inputMode={props.inputMode} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea
        rows={4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function KeyValueListField(props: {
  locale: Locale;
  label: string;
  value: Record<string, string>;
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  onChange: (value: Record<string, string>) => void;
}): JSX.Element {
  const [rows, setRows] = useState(() => toRecordEntries(props.value));
  const serializedValue = JSON.stringify(props.value);

  useEffect(() => {
    setRows(toRecordEntries(props.value));
  }, [serializedValue]);

  const updateRow = (rowId: string, patch: Partial<{ key: string; value: string }>): void => {
    const nextRows = rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    setRows(nextRows);
    props.onChange(fromRecordEntries(nextRows));
  };

  const removeRow = (rowId: string): void => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows.length ? nextRows : [{ id: `new-${Date.now()}`, key: "", value: "" }]);
    props.onChange(fromRecordEntries(nextRows));
  };

  const addRow = (): void => {
    setRows([...rows, { id: `new-${Date.now()}`, key: "", value: "" }]);
  };

  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="key-value-list">
        {rows.map((row) => (
          <div key={row.id} className="key-value-row">
            <input
              value={row.key}
              placeholder={props.keyPlaceholder}
              onChange={(event) => updateRow(row.id, { key: event.target.value })}
            />
            <input
              value={row.value}
              placeholder={props.valuePlaceholder}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
            />
            <button
              className="key-value-remove"
              type="button"
              aria-label={t(props.locale, "delete")}
              title={t(props.locale, "delete")}
              onClick={() => removeRow(row.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button className="action-button compact key-value-add" type="button" onClick={addRow}>
          <Plus size={14} />
          <span>{props.addLabel}</span>
        </button>
      </div>
    </div>
  );
}

function ReadOnlyField(props: { label: string; value: string }): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input value={props.value} readOnly disabled className="field-input-disabled" />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: typeof Globe; badge?: string; badgeClassName?: string }>;
  selectedIcon?: typeof Globe;
  popoverClassName?: string;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = props.options.find((option) => option.value === props.value) ?? props.options[0];
  const SelectedIcon = props.selectedIcon ?? selectedOption?.icon;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <span>{props.label}</span>
      <div className={isOpen ? "field-select-shell is-open" : "field-select-shell"}>
        <button
          className="field-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {SelectedIcon ? (
            <span className="field-select-leading icon" aria-hidden="true">
              <SelectedIcon size={15} />
            </span>
          ) : selectedOption?.badge ? (
            <span className={["field-select-leading", "badge", selectedOption.badgeClassName].filter(Boolean).join(" ")} aria-hidden="true">
              {selectedOption.badge}
            </span>
          ) : null}
          <span className="field-select-value">{selectedOption?.label ?? props.value}</span>
          <span className="field-select-icon" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>
        <div
          className={["field-select-popover", props.popoverClassName].filter(Boolean).join(" ")}
          role="listbox"
          aria-label={props.label}
        >
          {props.options.map((option) => (
            <button
              key={option.value}
              className={option.value === props.value ? "field-select-option active" : "field-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === props.value}
              onClick={() => {
                props.onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.icon ? (
                <span className="field-select-option-leading icon" aria-hidden="true">
                  <option.icon size={15} />
                </span>
              ) : option.badge ? (
                <span className={["field-select-option-leading", "badge", option.badgeClassName].filter(Boolean).join(" ")} aria-hidden="true">
                  {option.badge}
                </span>
              ) : null}
              <span className="field-select-option-copy">{option.label}</span>
              {option.value === props.value ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FontSizeSliderField(props: {
  locale: Locale;
  label: string;
  value: UiFontSize;
  options: Array<{
    value: UiFontSize;
    label: Record<Locale, string>;
    fontSize: string;
  }>;
  onChange: (value: UiFontSize) => void;
}): JSX.Element {
  const options = props.options.length ? props.options : UI_FONT_SIZE_OPTIONS;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === props.value),
  );
  const progress =
    options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 0;

  return (
    <div className="field font-size-field">
      <span>{props.label}</span>
      <div
        className="font-size-slider-shell"
        style={{ ["--font-slider-progress" as string]: `${progress}%` }}
      >
        <div className="font-size-slider-control">
          <input
            className="font-size-slider-input"
            type="range"
            min={0}
            max={options.length - 1}
            step={1}
            value={selectedIndex}
            aria-label={props.label}
            onChange={(event) => {
              const nextIndex = Number(event.target.value);
              props.onChange(options[nextIndex]?.value ?? "standard");
            }}
          />
          <div className="font-size-slider-labels" aria-hidden="true">
            {options.map((option) => (
              <span
                key={option.value}
                className={option.value === props.value ? "is-active" : undefined}
              >
                {option.label[props.locale]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiSelectField(props: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  emptyLabel: string;
  popoverClassName?: string;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedValues = props.options.filter((option) => props.value.includes(option.value));
  const summary = selectedValues.length
    ? selectedValues.map((option) => option.label).join(", ")
    : props.emptyLabel;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <span>{props.label}</span>
      <div className={isOpen ? "field-select-shell is-open" : "field-select-shell"}>
        <button
          className="field-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={selectedValues.length ? "field-select-value" : "field-select-value field-select-placeholder"}>
            {summary}
          </span>
          <span className="field-select-icon" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>
        <div
          className={["field-select-popover", props.popoverClassName].filter(Boolean).join(" ")}
          role="listbox"
          aria-label={props.label}
          aria-multiselectable="true"
        >
          {props.options.map((option) => {
            const isSelected = props.value.includes(option.value);
            return (
              <button
                key={option.value}
                className={isSelected ? "field-select-option active" : "field-select-option"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  const nextValues = isSelected
                    ? props.value.filter((value) => value !== option.value)
                    : [...props.value, option.value];
                  props.onChange(nextValues);
                }}
              >
                <span className="field-select-option-copy">{option.label}</span>
                {isSelected ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PathField(props: {
  locale: Locale;
  label: string;
  value: string;
  readOnly?: boolean;
  fileType?: "toml" | "json";
  pickerProperties?: Array<"openFile" | "openDirectory" | "createDirectory">;
  onView?: () => void;
  onChange: (value: string) => void;
}): JSX.Element {
  const pickFile = async (): Promise<void> => {
    if (props.readOnly) {
      return;
    }
    const api = getApi();
    if (!api) {
      return;
    }
    const result = await api.pickFile({
      title: props.label,
      properties: props.pickerProperties ?? ["openFile"],
      ...(props.pickerProperties?.includes("openFile") !== false
        ? { filters: [{ name: (props.fileType ?? "toml").toUpperCase(), extensions: [props.fileType ?? "toml"] }] }
        : {}),
    });
    if (!result.canceled && result.filePath) {
      props.onChange(result.filePath);
    }
  };

  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="field-row">
        <input
          value={props.value}
          readOnly={props.readOnly}
          disabled={props.readOnly}
          className={props.readOnly ? "field-input-disabled" : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <div className="field-row-actions">
          {props.onView ? (
            <button
              className="action-button compact icon-only"
              type="button"
              aria-label={t(props.locale, "view")}
              title={t(props.locale, "view")}
              onClick={props.onView}
            >
              <Eye size={16} />
            </button>
          ) : null}
          {!props.readOnly ? (
            <button
              className="action-button compact icon-only"
              type="button"
              aria-label={t(props.locale, "browse")}
              title={t(props.locale, "browse")}
              onClick={() => void pickFile()}
            >
              <FolderOpen size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function createFallbackState(): AppState {
  const panelSettings = {
    version: 1,
    config_path: "~/.kimi/config.toml",
    profiles_path: "",
    follow_config_profiles: true,
    theme: "auto" as AppearanceMode,
    ui_font_size: "standard" as UiFontSize,
    locale: "zh-CN" as Locale,
    tray_icon: false,
    display_open_mode: "remember-last" as DisplayOpenMode,
    close_behavior: "quit" as CloseBehavior,
    backup_strategy: "manual" as BackupStrategy,
    backup_frequency: "daily" as BackupFrequency,
    backup_retention_count: 10,
    backup_destination_type: "local" as BackupDestinationType,
    backup_local_path: "~/.kimi/backups",
    backup_webdav_url: "",
    backup_webdav_username: "",
    backup_webdav_password: "",
    backup_webdav_path: "",
    mcp_servers: {},
  };

  return {
    configPath: panelSettings.config_path,
    profilesPath: "~/.kimi/config.profiles.toml",
    panelSettingsPath: "~/.kimi/config.panel.toml",
    mcpConfigPath: "~/.kimi/mcp.json",
    mainConfig: {
      default_model: "",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {},
      providers: {},
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: {},
    activeProfile: "",
    panelSettings,
    mcpConfig: {
      mcpServers: {},
    },
  };
}

function ensureEnumOptions(
  options: Array<{ value: string; label: string }>,
  currentValue: string | string[],
  locale: Locale,
): Array<{ value: string; label: string }> {
  const values = Array.isArray(currentValue) ? currentValue : [currentValue];
  const merged = [...options];
  for (const value of values) {
    if (!value || merged.some((option) => option.value === value)) {
      continue;
    }
    merged.push({
      value,
      label: locale === "zh-CN" ? `未知值（${value}）` : `Unknown Value (${value})`,
    });
  }
  return merged;
}

function applyAppearanceMode(mode: AppearanceMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const resolvedMode =
    mode === "auto"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  document.documentElement.dataset.theme = resolvedMode;
}

function applyUiFontSize(size: UiFontSize): void {
  if (typeof document === "undefined") {
    return;
  }
  const fontSize =
    UI_FONT_SIZE_OPTIONS.find((option) => option.value === size)?.fontSize ?? "16px";
  document.documentElement.style.fontSize = fontSize;
  document.documentElement.dataset.uiFontSize = size;
}

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function TopbarControls(props: {
  locale: Locale;
  theme: AppearanceMode;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: AppearanceMode) => void;
}): JSX.Element {
  const [openPanel, setOpenPanel] = useState<"locale" | "theme" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPanel(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const activeLocale = LOCALE_OPTIONS.find((option) => option.value === props.locale) ?? LOCALE_OPTIONS[0];
  const activeTheme = THEME_OPTIONS.find((option) => option.value === props.theme) ?? THEME_OPTIONS[0];
  const ActiveThemeIcon = activeTheme.icon;

  return (
    <div className="toolbar-control-group" ref={rootRef}>
      <div className={openPanel === "locale" ? "toolbar-menu is-open" : "toolbar-menu"}>
        <button
          className={openPanel === "locale" ? "toolbar-icon-button active" : "toolbar-icon-button"}
          type="button"
          aria-label={t(props.locale, "locale")}
          aria-expanded={openPanel === "locale"}
          onClick={() => setOpenPanel((current) => (current === "locale" ? null : "locale"))}
        >
          <span className="toolbar-icon-badge flag">{activeLocale.shortLabel}</span>
          <span className="toolbar-icon-copy">
            <strong>{activeLocale.longLabel}</strong>
            <small>{t(props.locale, "locale")}</small>
          </span>
        </button>
        <div className="toolbar-popover" role="menu" aria-label={t(props.locale, "locale")}>
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={option.value === props.locale ? "toolbar-option active" : "toolbar-option"}
              type="button"
              onClick={() => {
                props.onLocaleChange(option.value);
                setOpenPanel(null);
              }}
            >
              <span className="toolbar-option-leading flag">{option.shortLabel}</span>
              <span className="toolbar-option-copy">
                <strong>{option.longLabel}</strong>
                <small>{option.value}</small>
              </span>
              {option.value === props.locale ? <CheckCheck size={16} /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className={openPanel === "theme" ? "toolbar-menu is-open" : "toolbar-menu"}>
        <button
          className={openPanel === "theme" ? "toolbar-icon-button active" : "toolbar-icon-button"}
          type="button"
          aria-label={t(props.locale, "theme")}
          aria-expanded={openPanel === "theme"}
          onClick={() => setOpenPanel((current) => (current === "theme" ? null : "theme"))}
        >
          <span className="toolbar-icon-badge">
            <ActiveThemeIcon size={16} />
          </span>
          <span className="toolbar-icon-copy">
            <strong>{activeTheme.label[props.locale]}</strong>
            <small>{t(props.locale, "theme")}</small>
          </span>
        </button>
        <div className="toolbar-popover" role="menu" aria-label={t(props.locale, "theme")}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                className={option.value === props.theme ? "toolbar-option active" : "toolbar-option"}
                type="button"
                onClick={() => {
                  props.onThemeChange(option.value);
                  setOpenPanel(null);
                }}
              >
                <span className="toolbar-option-leading icon">
                  <Icon size={15} />
                </span>
                <span className="toolbar-option-copy">
                  <strong>{option.label[props.locale]}</strong>
                  <small>{option.value}</small>
                </span>
                {option.value === props.theme ? <CheckCheck size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }): JSX.Element {
  return (
    <label className="toggle-row">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}

function CodePanel(props: { title: string; content: string; onCopy?: () => void; copied?: boolean }): JSX.Element {
  return (
    <div className="code-panel">
      <CodePanelHeader title={props.title} onCopy={props.onCopy} copied={props.copied} />
      <div className="code-window" role="region" aria-label={props.title}>
        <ol className="code-lines">
          {toDisplayLines(props.content).map((line, index) => (
            <li key={`${index}-${line}`} className="code-line">
              <span className="code-line-number">{index + 1}</span>
              <code>{line || " "}</code>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CodePanelHeader(props: { title: string; onCopy?: () => void; copied?: boolean }): JSX.Element {
  return (
    <div className="code-head">
      <div className="code-head-main">
        <span className="code-head-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>{props.title}</span>
      </div>
      {props.onCopy ? (
        <button
          className="code-head-copy"
          type="button"
          aria-label="Copy content"
          title={props.copied ? "Copied" : "Copy content"}
          onClick={props.onCopy}
        >
          {props.copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      ) : null}
    </div>
  );
}

function toDisplayLines(content: string): string[] {
  const normalized = content.trimEnd();
  return normalized ? normalized.split("\n") : [""];
}

function formatSkillAssets(locale: Locale, skill: SkillEntry): string {
  const labels = [
    skill.hasScripts ? "scripts" : "",
    skill.hasReferences ? "references" : "",
    skill.hasAssets ? "assets" : "",
  ].filter(Boolean);
  return labels.join(" · ") || t(locale, "overviewNone");
}

function formatSkillPathLabel(
  path: SkillsScanReport["paths"][number],
): string {
  return predictSkillLibrary(path.path).label;
}

function renderSkillPathLabel(
  path: SkillsScanReport["paths"][number],
): JSX.Element {
  const prediction = predictSkillLibrary(path.path);
  return (
    <span className="skill-path-label">
      <span className={`skill-path-icon ${prediction.className}`} aria-hidden="true">
        <prediction.icon size={14} />
      </span>
      <span className="skill-path-copy">{prediction.label}</span>
    </span>
  );
}

function predictSkillLibrary(path: string): { icon: typeof Sparkles; className: string; label: string } {
  const normalized = path.toLowerCase();
  if (normalized.includes("/.claude/")) {
    return { icon: Sparkles, className: "is-claude", label: "Claude 技能库" };
  }
  if (normalized.includes("/.codex/")) {
    return { icon: Boxes, className: "is-codex", label: "Codex 技能库" };
  }
  if (normalized.includes("/.kimi/")) {
    return { icon: MoonStar, className: "is-kimi", label: "Kimi 技能库" };
  }
  if (normalized.includes("/agents/")) {
    return { icon: PenSquare, className: "is-agents", label: "Agents 技能库" };
  }
  if (path === "(managed by CLI package)") {
    return { icon: FileText, className: "is-generic", label: "内置技能库" };
  }
  return { icon: FolderOpen, className: "is-generic", label: "自定义技能库" };
}

function shortenSkillPath(path: string): string {
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");
  const homeAliases = new Set([
    "~/.kimi/skills",
    "~/.claude/skills",
    "~/.codex/skills",
    "~/.agents/skills",
    "~/.config/agents/skills",
  ]);

  if (homeAliases.has(normalized)) {
    return normalized;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("~/")) {
    if (segments.length <= 3) {
      return normalized;
    }
    return `~/${["...", ...segments.slice(-2)].join("/")}`;
  }

  if (segments.length <= 3) {
    return normalized;
  }

  return `.../${segments.slice(-3).join("/")}`;
}

function isSkillPathLoaded(path: SkillsScanReport["paths"][number]): boolean {
  return path.group !== "builtin" && path.exists && path.selected;
}

function formatSkillPathNotice(locale: Locale, path: SkillsScanReport["paths"][number]): string {
  if (path.group === "builtin") {
    return t(locale, "skillsPathNoticeBuiltin");
  }
  if (!path.exists) {
    return t(locale, "skillsPathNoticeMissing");
  }
  if (!path.selected) {
    return t(locale, "skillsPathNoticeSkipped");
  }
  return "";
}

function AboutPage(props: {
  locale: Locale;
}): JSX.Element {
  const isZh = props.locale === "zh-CN";
  const links = [
    {
      icon: Github,
      label: isZh ? "GitHub 地址" : "GitHub",
      value: ABOUT_INFO.repositoryUrl,
    },
    {
      icon: Bug,
      label: isZh ? "提 Issue" : "Report Issues",
      value: ABOUT_INFO.issuesUrl,
    },
    {
      icon: ExternalLink,
      label: isZh ? "作者博客" : "Author Blog",
      value: ABOUT_INFO.authorBlogUrl,
    },
    {
      icon: Mail,
      label: isZh ? "联系邮箱" : "Contact Email",
      value: `mailto:${ABOUT_INFO.contactEmail}`,
      displayValue: ABOUT_INFO.contactEmail,
    },
  ];
  const history = [
    {
      version: "v1.0.4",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.4`,
      text: isZh
        ? "新增托盘语言与主题快捷切换，补齐备份恢复能力，并继续优化 Skills 工作区浏览、详情展示和 frontmatter 解析兼容性。"
        : "Added tray shortcuts for language and theme switching, introduced backup restore support, and further refined the Skills workspace, detail presentation, and frontmatter parsing compatibility.",
    },
    {
      version: "v1.0.3",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.3`,
      text: isZh
        ? "重构 Skills 工作区与详情查看体验，新增界面字体大小设置，统一 Skills 自动发现流程，并修复多个页面无法打开与内容区高度未撑满的问题。"
        : "Refined the Skills workspace and detail viewer, added interface font size settings, unified Skills auto discovery, and fixed multi-page navigation crashes plus the workspace height fill issue.",
    },
    {
      version: "v1.0.2",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.2`,
      text: isZh
        ? "补齐备份记录查看与删除流程，修复 MCP 面板配置反复写入导致的结构与缩进异常，并更新项目文档介绍。"
        : "Added backup record viewing and deletion, fixed repeated MCP panel writes causing structure and indentation issues, and refreshed the project documentation overview.",
    },
    {
      version: "v1.0.1",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.1`,
      text: isZh
        ? "集中优化设置页、首页总览和 MCP 管理交互，并更新整套透明品牌 Logo 与 macOS 图标资源。"
        : "Polished settings, overview, and MCP management flows, and refreshed the transparent brand logo and macOS icon assets.",
    },
    {
      version: "v1.0.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.0`,
      text: isZh
        ? "首个桌面版本，包含 Provider、Model、Profile 管理、配置预览与 Diff、状态栏菜单，以及修复后的 GitHub Release 发布流程。"
        : "Initial desktop release with Provider, Model, Profile management, config preview, diff, tray menu, and the fixed GitHub Release pipeline.",
    },
  ];
  const visibleHistory = history.slice(0, 3);

  return (
    <section className="glass-panel about-page">
      <div className="about-hero">
        <div className="about-logo">
          <img className="brand-logo brand-logo-light" src={logoLight} alt="Kimi Code Switch" />
          <img className="brand-logo brand-logo-dark" src={logoDark} alt="Kimi Code Switch" />
        </div>
        <div>
          <p className="about-eyebrow">{t(props.locale, "about")}</p>
          <h2>Kimi Code Switch GUI</h2>
          <p>
            {isZh
              ? "用于管理 kimi-code-cli 配置的桌面工具。"
              : "Desktop app for managing kimi-code-cli configuration."}
          </p>
          <p className="about-meta-summary">
            {isZh
              ? `作者：${ABOUT_INFO.author} · 许可证：${ABOUT_INFO.license}`
              : `Author: ${ABOUT_INFO.author} · License: ${ABOUT_INFO.license}`}
          </p>
        </div>
        <span className="about-version">v{ABOUT_INFO.version}</span>
      </div>

      <div className="about-grid">
        <section className="about-section about-section-wide">
          <div className="section-title">
            <ExternalLink size={16} />
            <span>{isZh ? "项目链接" : "Project Links"}</span>
          </div>
          <div className="about-link-list">
            {links.map(({ icon: Icon, label, value, displayValue }) => (
              <button
                key={label}
                className="about-link-item"
                type="button"
                onClick={() => void window.kimiSwitch.openExternal(value)}
              >
                <span className="about-link-icon"><Icon size={16} /></span>
                <span>{label}</span>
                <code>{displayValue ?? value}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="about-section about-section-wide">
          <div className="section-title">
            <History size={16} />
            <span>{isZh ? "版本历史" : "Version History"}</span>
          </div>
          <div className="about-history">
            {visibleHistory.map((item) => (
              <div key={item.version} className="about-history-item">
                <span className="about-history-version">
                  <strong>{item.version}</strong>
                  <button
                    className="about-history-link"
                    type="button"
                    aria-label={`${item.version} release`}
                    onClick={() => void window.kimiSwitch.openExternal(item.url)}
                  >
                    <ExternalLink size={13} />
                  </button>
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function OverviewDashboard(props: {
  state: AppState;
  locale: Locale;
  diagnostics: DiagnosticsState;
  onActivateProfile: (name: string) => void;
  onNavigate: (tab: TabId) => void;
}): JSX.Element {
  const { state, locale, diagnostics, onActivateProfile, onNavigate } = props;
  const activeProfile = state.profiles[state.activeProfile];
  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);
  const visibleProviders = providerEntries.slice(0, 3);
  const visibleModels = modelEntries.slice(0, 3);
  const visibleProfiles = profileEntries.slice(0, 4);

  const boolLabel = (v: boolean) => t(locale, v ? "overviewOn" : "overviewOff");

  function BoolPill({ value }: { value: boolean }): JSX.Element {
    return (
      <span className={value ? "status-pill on" : "status-pill off"}>
        <span className="dot" />
        {boolLabel(value)}
      </span>
    );
  }

  return (
    <section className="overview-grid">
      {/* Hero: active profile — left col spans 2 rows */}
      <section className="glass-panel overview-card overview-hero overview-hero-tall">
        <div className="overview-hero-header">
          <Zap size={15} />
          <span>{t(locale, "overviewActiveProfile")}</span>
        </div>
        {activeProfile ? (
          <>
            <div className="overview-profile-name">{state.activeProfile}</div>
            <div className="overview-kv-grid">
              <div className="overview-kv"><span>{t(locale, "overviewDefaultModel")}</span><strong>{activeProfile.default_model || "-"}</strong></div>
              <div className="overview-kv"><span>{t(locale, "overviewThinking")}</span><BoolPill value={activeProfile.default_thinking} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewYolo")}</span><BoolPill value={activeProfile.default_yolo} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewPlanMode")}</span><BoolPill value={activeProfile.default_plan_mode} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewThinkingStream")}</span><BoolPill value={activeProfile.show_thinking_stream} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewMergeSkills")}</span><BoolPill value={activeProfile.merge_all_available_skills} /></div>
            </div>
          </>
        ) : (
          <p className="overview-empty">{t(locale, "overviewNone")}</p>
        )}
      </section>

      {/* Right column: Provider + Model stacked */}
      <div className="overview-right-col">
        <section className="glass-panel overview-card">
          <div className="section-title">
            <Globe size={16} />
            <span>{t(locale, "overviewProviderList")}</span>
            <span className="overview-badge">{providerEntries.length}</span>
            {providerEntries.length > 3 ? (
              <button className="overview-more-link" type="button" onClick={() => onNavigate("providers")}>
                {t(locale, "overviewShowMore")}
              </button>
            ) : null}
          </div>
          <div className="overview-list">
            {visibleProviders.map(([name, provider]) => (
              <div key={name} className="overview-list-item">
                <span className="overview-list-name">{name}</span>
                <span className="overview-list-meta">{provider.type}</span>
              </div>
            ))}
            {providerEntries.length === 0 && <p className="overview-empty">-</p>}
          </div>
        </section>

        <section className="glass-panel overview-card">
          <div className="section-title">
            <Boxes size={16} />
            <span>{t(locale, "overviewModelList")}</span>
            <span className="overview-badge">{modelEntries.length}</span>
            {modelEntries.length > 3 ? (
              <button className="overview-more-link" type="button" onClick={() => onNavigate("models")}>
                {t(locale, "overviewShowMore")}
              </button>
            ) : null}
          </div>
          <div className="overview-list">
            {visibleModels.map(([name, model]) => (
              <div key={name} className="overview-list-item">
                <span className="overview-list-name">{name}</span>
                <span className="overview-list-meta">{model.capabilities.join(", ") || "-"}</span>
              </div>
            ))}
            {modelEntries.length === 0 && <p className="overview-empty">-</p>}
          </div>
        </section>
      </div>

      {/* Profile list — full width */}
      <section className="glass-panel overview-card overview-card-wide">
        <div className="section-title">
          <Layers3 size={16} />
          <span>{t(locale, "overviewProfileList")}</span>
          <span className="overview-badge">{profileEntries.length}</span>
          {profileEntries.length > 4 ? (
            <button className="overview-more-link" type="button" onClick={() => onNavigate("profiles")}>
              {t(locale, "overviewShowMore")}
            </button>
          ) : null}
        </div>
        <div className="overview-profile-grid">
          {visibleProfiles.map(([name, profile]) => {
            const isActive = name === state.activeProfile;
            return (
              <div key={name} className={isActive ? "overview-profile-chip active" : "overview-profile-chip"}>
                <div className="overview-profile-info">
                  <strong>{profile.label || name}</strong>
                  <span>{profile.default_model || "-"}</span>
                </div>
                {isActive ? (
                  <span className="overview-profile-active"><Check size={14} /></span>
                ) : (
                  <button className="overview-profile-activate" onClick={() => onActivateProfile(name)}>
                    {t(locale, "overviewQuickActivate")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer: paths + diagnostics */}
      <div className="overview-footer">
        <section className="glass-panel overview-card">
          <div className="section-title">
            <FileText size={16} />
            <span>{t(locale, "overviewConfigPaths")}</span>
          </div>
          <div className="overview-paths">
            <code>{state.configPath}</code>
            <code>{state.profilesPath}</code>
            <code>{state.panelSettingsPath}</code>
            <code>{state.mcpConfigPath}</code>
          </div>
        </section>
        <DiagnosticsPanel locale={locale} diagnostics={diagnostics} state={state} />
      </div>
    </section>
  );
}

function DiagnosticsPanel(props: {
  locale: Locale;
  diagnostics: DiagnosticsState;
  state: AppState;
}): JSX.Element {
  const { locale, diagnostics, state } = props;
  return (
    <section className="glass-panel diagnostics-panel">
      <div className="section-title">{t(locale, "diagnosticsTitle")}</div>
      <p className="diagnostics-subtitle">{t(locale, "diagnosticsSubtitle")}</p>
      <div className="diagnostics-grid">
        <DiagnosticItem label={t(locale, "diagPreload")} level={diagnostics.preload} locale={locale} />
        <DiagnosticItem label={t(locale, "diagLoad")} level={diagnostics.loadState} locale={locale} />
        <DiagnosticItem label={t(locale, "diagPreview")} level={diagnostics.previewState} locale={locale} />
      </div>
      <div className="diagnostics-block">
        <div className="code-head">{t(locale, "diagPaths")}</div>
        <pre>{[state.configPath, state.profilesPath, state.panelSettingsPath, state.mcpConfigPath].join("\n")}</pre>
      </div>
      <div className="diagnostics-block">
        <div className="code-head">{t(locale, "diagLastError")}</div>
        <pre>{diagnostics.lastError || "-"}</pre>
      </div>
    </section>
  );
}

function DiagnosticItem(props: {
  label: string;
  level: DiagnosticLevel;
  locale: Locale;
}): JSX.Element {
  return (
    <div className={`diagnostic-item ${props.level}`}>
      <span>{props.label}</span>
      <strong>{diagnosticLabel(props.level, props.locale)}</strong>
    </div>
  );
}

function diagnosticLabel(level: DiagnosticLevel, locale: Locale): string {
  switch (level) {
    case "ok":
      return t(locale, "diagOk");
    case "failed":
      return t(locale, "diagFailed");
    case "unavailable":
      return t(locale, "diagUnavailable");
    default:
      return t(locale, "diagPending");
  }
}
