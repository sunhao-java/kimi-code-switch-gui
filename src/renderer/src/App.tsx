import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Bug,
  CheckCheck,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCog,
  Globe,
  Eye,
  EyeOff,
  Github,
  History,
  Info,
  Languages,
  Layers3,
  Mail,
  MonitorCog,
  MoonStar,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Star,
  SunMedium,
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
import type {
  AppState,
  Locale,
  PreviewBundle,
  Profile,
  AppearanceMode,
  DisplayOpenMode,
  CloseBehavior,
  McpServerConfig,
  McpTransport,
} from "@shared/types";

import { t, translateError } from "./i18n";
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

type TabId = "overview" | "profiles" | "providers" | "models" | "mcp" | "preview" | "settings" | "about";
type DiagnosticLevel = "ok" | "failed" | "pending" | "unavailable";
type PreviewFileId = "config" | "profiles" | "panel" | "mcp";

interface DiagnosticsState {
  preload: DiagnosticLevel;
  loadState: DiagnosticLevel;
  previewState: DiagnosticLevel;
  lastError: string;
}

const TAB_ITEMS: Array<{ id: TabId; icon: typeof Layers3; labelKey: string }> = [
  { id: "overview", icon: Sparkles, labelKey: "overview" },
  { id: "profiles", icon: Layers3, labelKey: "profiles" },
  { id: "providers", icon: Globe, labelKey: "providers" },
  { id: "models", icon: Boxes, labelKey: "models" },
  { id: "mcp", icon: Zap, labelKey: "mcp" },
  { id: "preview", icon: FileCog, labelKey: "preview" },
  { id: "settings", icon: Settings2, labelKey: "settings" },
];

const ABOUT_TAB: { id: TabId; icon: typeof Info; labelKey: string } = {
  id: "about",
  icon: Info,
  labelKey: "about",
};

const ABOUT_INFO = {
  version: "1.0.0",
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
  { value: "zh-CN", shortLabel: "中", longLabel: "中文" },
  { value: "en-US", shortLabel: "EN", longLabel: "English" },
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

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [savedState, setSavedState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedMcpServer, setSelectedMcpServer] = useState("");
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<PreviewFileId>("config");
  const [preview, setPreview] = useState<PreviewBundle>(emptyPreview);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    preload: "pending",
    loadState: "pending",
    previewState: "pending",
    lastError: "",
  });
  const unsavedResolutionRef = useRef(false);

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
      setSelectedProvider(Object.keys(normalized.mainConfig.providers)[0] ?? "");
      setSelectedModel(Object.keys(normalized.mainConfig.models)[0] ?? "");
      setSelectedProfile(normalized.activeProfile);
      setSelectedMcpServer(Object.keys(normalized.mcpConfig.mcpServers)[0] ?? "");
      const nextPreview = await api.previewState(normalized);
      setPreview(nextPreview);
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

  const restoreSavedState = (nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
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

  const updateState = (updater: (draft: AppState) => void, options: { persist?: boolean } = {}): void => {
    const draft = cloneState(state);
    try {
      updater(draft);
      const normalized = normalizeStatePaths(draft);
      setState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
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
  const settingsDirty = savedState
    ? !isEqualValue(
        {
          configPath: state.configPath,
          profilesPath: state.profilesPath,
          panelSettingsPath: state.panelSettingsPath,
          panelSettings: state.panelSettings,
        },
        {
          configPath: savedState.configPath,
          profilesPath: savedState.profilesPath,
          panelSettingsPath: savedState.panelSettingsPath,
          panelSettings: savedState.panelSettings,
        },
      )
    : false;

  const resolveUnsavedChanges = async (): Promise<void> => {
    if (!hasUnsavedChanges || !savedState || unsavedResolutionRef.current) {
      return;
    }
    unsavedResolutionRef.current = true;
    try {
      const shouldSave = window.confirm(t(locale, "unsavedChangesConfirm"));
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

  return (
    <div className="shell">
      <div className="window-titlebar drag-region" aria-hidden="true">
        <div className="window-titlebar-safe" />
      </div>
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
              {id === "settings" && settingsDirty ? (
                <span className="nav-dirty-badge" title={t(locale, "editedBadge")} aria-label={t(locale, "editedBadge")}>
                  <Star size={14} fill="currentColor" />
                </span>
              ) : null}
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
            <SummaryCard label={t(locale, "summaryMcp")} value={String(mcpEntries.length)} />
            <SummaryCard label={t(locale, "summaryActive")} value={state.activeProfile || "-"} accent />
          </div>
          <div className="toolbar">
            <TopbarControls
              locale={locale}
              theme={state.panelSettings.theme}
              onLocaleChange={(value) =>
                updateState((draft) => {
                  draft.panelSettings.locale = value;
                }, { persist: false })
              }
              onThemeChange={(value) =>
                updateState((draft) => {
                  draft.panelSettings.theme = value;
                }, { persist: false })
              }
            />
          </div>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {!error && notice ? <div className="banner success">{notice}</div> : null}

        {activeTab === "overview" ? (
          <OverviewDashboard
            state={state}
            locale={locale}
            preview={preview}
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
            onAdd={() =>
              updateState((draft) => {
                upsertProvider(draft, `provider_${Date.now()}`, {
                  type: "kimi",
                  base_url: "https://api.example.com/v1",
                  api_key: "",
                });
                setSelectedProvider(Object.keys(draft.mainConfig.providers).at(-1) ?? "");
              }, { persist: false })
            }
          >
            {selectedProviderData ? (
              <ProviderForm
                locale={locale}
                name={selectedProvider || providerEntries[0]?.[0] || ""}
                value={selectedProviderData}
                onChange={(name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedProvider || providerEntries[0]?.[0] || name;
                    const nextProviders = { ...draft.mainConfig.providers };
                    delete nextProviders[currentName];
                    nextProviders[name] = { ...selectedProviderData, ...patch };
                    draft.mainConfig.providers = nextProviders;
                    for (const model of Object.values(draft.mainConfig.models)) {
                      if (model.provider === currentName) {
                        model.provider = name;
                      }
                    }
                    setSelectedProvider(name);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() =>
                  updateState((draft) => {
                    deleteProvider(draft, selectedProvider || providerEntries[0]?.[0] || "");
                    setSelectedProvider(Object.keys(draft.mainConfig.providers)[0] ?? "");
                  }, { persist: false })
                }
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
                const copyName = createCopyName(name, draft.mainConfig.models);
                draft.mainConfig.models[copyName] = {
                  ...model,
                  capabilities: [...model.capabilities],
                };
                setSelectedModel(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newModel")}
            onAdd={() =>
              updateState((draft) => {
                const providerName = Object.keys(draft.mainConfig.providers)[0];
                if (!providerName) {
                  throw new Error("Please create a provider first.");
                }
                upsertModel(draft, `${providerName}/new-model`, {
                  provider: providerName,
                  model: "new-model",
                  max_context_size: 128000,
                  capabilities: [],
                });
                setSelectedModel(Object.keys(draft.mainConfig.models).at(-1) ?? "");
              }, { persist: false })
            }
          >
            {selectedModelData ? (
              <ModelForm
                locale={locale}
                providers={Object.keys(state.mainConfig.providers)}
                name={selectedModel || modelEntries[0]?.[0] || ""}
                value={selectedModelData}
                onChange={(name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedModel || modelEntries[0]?.[0] || name;
                    const nextModels = { ...draft.mainConfig.models };
                    delete nextModels[currentName];
                    nextModels[name] = { ...selectedModelData, ...patch };
                    draft.mainConfig.models = nextModels;
                    for (const profile of Object.values(draft.profiles)) {
                      if (profile.default_model === currentName) {
                        profile.default_model = name;
                      }
                    }
                    if (draft.mainConfig.default_model === currentName) {
                      draft.mainConfig.default_model = name;
                    }
                    setSelectedModel(name);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() =>
                  updateState((draft) => {
                    deleteModel(draft, selectedModel || modelEntries[0]?.[0] || "");
                    setSelectedModel(Object.keys(draft.mainConfig.models)[0] ?? "");
                  }, { persist: false })
                }
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
            onAdd={() =>
              updateState((draft) => {
                const firstModel = Object.keys(draft.mainConfig.models)[0];
                if (!firstModel) {
                  throw new Error("Please create a model first.");
                }
                upsertProfile(draft, {
                  name: `profile_${Date.now()}`,
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
                setSelectedProfile(Object.keys(draft.profiles).at(-1) ?? "");
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
                name={selectedProfile || profileEntries[0]?.[0] || ""}
                value={selectedProfileData}
                isActive={(selectedProfile || profileEntries[0]?.[0] || "") === state.activeProfile}
                onChange={(name, nextProfile) =>
                  updateState((draft) => {
                    const currentName = selectedProfile || profileEntries[0]?.[0] || name;
                    const nextProfiles = { ...draft.profiles };
                    delete nextProfiles[currentName];
                    nextProfiles[name] = { ...nextProfile, name };
                    if (draft.activeProfile === currentName) {
                      draft.activeProfile = name;
                    }
                    draft.profiles = nextProfiles;
                    setSelectedProfile(name);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onActivate={() =>
                  updateState((draft) => {
                    applyProfile(draft, selectedProfile || profileEntries[0]?.[0] || "");
                  })
                }
                onClone={() =>
                  updateState((draft) => {
                    const source = selectedProfile || profileEntries[0]?.[0] || "";
                    cloneProfile(draft, source, `${source}-copy`, `${selectedProfileData.label} Copy`);
                    setSelectedProfile(`${source}-copy`);
                  }, { persist: false })
                }
                onDelete={() =>
                  updateState((draft) => {
                    deleteProfile(draft, selectedProfile || profileEntries[0]?.[0] || "");
                    setSelectedProfile(Object.keys(draft.profiles)[0] ?? "");
                  }, { persist: false })
                }
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
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const server = draft.mcpConfig.mcpServers[name];
                if (!server) return;
                const copyName = createCopyName(name, draft.mcpConfig.mcpServers);
                draft.mcpConfig.mcpServers[copyName] = { ...server };
                setSelectedMcpServer(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newMcpServer")}
            onAdd={() =>
              updateState((draft) => {
                const name = `mcp_${Date.now()}`;
                draft.mcpConfig.mcpServers[name] = createDefaultMcpServer();
                setSelectedMcpServer(name);
              }, { persist: false })
            }
          >
            {selectedMcpServerData ? (
              <McpServerForm
                locale={locale}
                name={selectedMcpServer || mcpEntries[0]?.[0] || ""}
                value={selectedMcpServerData}
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
                    await persistState(state);
                    await runAction(serverName);
                    setError("");
                    setNotice(getMcpActionNotice(locale, action));
                  } catch (commandError) {
                    const message = commandError instanceof Error ? commandError.message : String(commandError);
                    setNotice("");
                    setError(translateError(locale, message));
                  }
                }}
                onChange={(name, nextServer) =>
                  updateState((draft) => {
                    const currentName = selectedMcpServer || mcpEntries[0]?.[0] || name;
                    const nextServers = { ...draft.mcpConfig.mcpServers };
                    delete nextServers[currentName];
                    nextServers[name] = nextServer;
                    draft.mcpConfig.mcpServers = nextServers;
                    setSelectedMcpServer(name);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() =>
                  updateState((draft) => {
                    const currentName = selectedMcpServer || mcpEntries[0]?.[0] || "";
                    delete draft.mcpConfig.mcpServers[currentName];
                    setSelectedMcpServer(Object.keys(draft.mcpConfig.mcpServers)[0] ?? "");
                  }, { persist: false })
                }
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "preview" ? (
          <section className="preview-grid">
            <PreviewWorkspace
              locale={locale}
              preview={preview}
              selectedFile={selectedPreviewFile}
              onSelectFile={setSelectedPreviewFile}
            />
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="glass-panel form-panel settings-grid">
            <div className="section-title">{t(locale, "settings")}</div>
            <PathField
              locale={locale}
              label={t(locale, "configPath")}
              value={state.configPath}
              onChange={(value) =>
                updateState((draft) => {
                  draft.configPath = value;
                  draft.panelSettings.config_path = value;
                }, { persist: false })
              }
            />
            <PathField
              locale={locale}
              label={t(locale, "profilesPath")}
              value={state.profilesPath}
              onChange={(value) =>
                updateState((draft) => {
                  draft.profilesPath = value;
                  draft.panelSettings.profiles_path = value;
                  draft.panelSettings.follow_config_profiles = false;
                }, { persist: false })
              }
            />
            <PathField
              locale={locale}
              label={t(locale, "panelSettingsPath")}
              value={state.panelSettingsPath}
              onChange={(value) =>
                updateState((draft) => {
                  draft.panelSettingsPath = value;
                }, { persist: false })
              }
            />
            <ReadOnlyField label={t(locale, "mcpConfigPathLabel")} value={state.mcpConfigPath} />
            <label className="toggle-row">
              <span>{t(locale, "followConfigProfiles")}</span>
              <input
                type="checkbox"
                checked={state.panelSettings.follow_config_profiles}
                onChange={(event) =>
                  updateState((draft) => {
                    draft.panelSettings.follow_config_profiles = event.target.checked;
                  }, { persist: false })
                }
              />
            </label>
            <SelectField
              label={t(locale, "theme")}
              value={state.panelSettings.theme}
              onChange={(value) =>
                updateState((draft) => {
                  draft.panelSettings.theme = value as AppearanceMode;
                }, { persist: false })
              }
              options={[
                { value: "auto", label: locale === "zh-CN" ? "自动" : "Auto" },
                { value: "dark", label: locale === "zh-CN" ? "暗色" : "Dark" },
                { value: "light", label: locale === "zh-CN" ? "明亮" : "Light" },
              ]}
            />
            <SelectField
              label={t(locale, "displayOpenMode")}
              value={state.panelSettings.display_open_mode}
              onChange={(value) =>
                updateState((draft) => {
                  draft.panelSettings.display_open_mode = value as DisplayOpenMode;
                }, { persist: false })
              }
              options={DISPLAY_OPEN_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label[locale],
              }))}
            />
            <label className="toggle-row">
              <span>{t(locale, "trayIcon")}</span>
              <input
                type="checkbox"
                checked={state.panelSettings.tray_icon}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  updateState((draft) => {
                    draft.panelSettings.tray_icon = enabled;
                    draft.panelSettings.close_behavior = enabled ? "keep-in-tray" : "quit";
                  }, { persist: false });
                }}
              />
            </label>
            {state.panelSettings.tray_icon ? (
              <SelectField
                label={t(locale, "closeBehavior")}
                value={state.panelSettings.close_behavior}
                onChange={(value) =>
                  updateState((draft) => {
                    draft.panelSettings.close_behavior = value as CloseBehavior;
                  }, { persist: false })
                }
                options={CLOSE_BEHAVIOR_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label[locale],
                }))}
              />
            ) : null}
            <div className="button-row">
              <button className="action-button action-button-primary" onClick={() => void onSave()}>
                <Save size={16} />
                <span>{t(locale, "save")}</span>
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "about" ? (
          <AboutPage locale={locale} />
        ) : null}
      </main>
    </div>
  );
}

function SummaryCard(props: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className={props.accent ? "summary-card accent" : "summary-card"}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SplitLayout(props: {
  listTitle: string;
  listItems: string[];
  dirtyItems?: Set<string>;
  dirtyLabel?: string;
  selectedItem: string;
  highlightedItem?: string;
  onSelect: (item: string) => void;
  copyLabel: string;
  onCopy: (item: string) => void;
  addLabel: string;
  onAdd: () => void;
  renderItemAction?: (item: string) => JSX.Element | null;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section className="split-layout">
      <div className="glass-panel list-panel">
        <div className="list-header">
          <div className="section-title">{props.listTitle}</div>
          <button className="action-button compact" onClick={props.onAdd}>
            {props.addLabel}
          </button>
        </div>
        <div className="list-scroll">
          {props.listItems.map((item) => (
            <div
              key={item}
              className={[
                "list-row",
                item === props.selectedItem ? "active" : "",
                item === props.highlightedItem ? "current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                className="list-item"
                onClick={() => {
                  if (item === props.selectedItem) return;
                  props.onSelect(item);
                }}
              >
                {item}
              </button>
              {props.dirtyItems?.has(item) ? (
                <span className="list-dirty-badge" title={props.dirtyLabel} aria-label={props.dirtyLabel}>
                  <Star size={14} fill="currentColor" />
                </span>
              ) : null}
              <div className="list-row-actions">
                <button
                  className="list-copy-button"
                  type="button"
                  aria-label={`${props.copyLabel} ${item}`}
                  title={props.copyLabel}
                  onClick={() => props.onCopy(item)}
                >
                  <Copy size={15} />
                </button>
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
      <Field label={t(props.locale, "formName")} value={props.name} onChange={(value) => props.onChange(value, {})} />
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
          aria-label={props.visible ? "Hide API Key" : "Show API Key"}
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
      <Field label={t(props.locale, "formName")} value={props.name} onChange={(value) => props.onChange(value, {})} />
      <SelectField
        label={t(props.locale, "formProvider")}
        value={props.value.provider}
        onChange={(value) => props.onChange(props.name, { provider: value })}
        options={props.providers.map((provider) => ({ value: provider, label: provider }))}
      />
      <Field label={t(props.locale, "formModel")} value={props.value.model} onChange={(value) => props.onChange(props.name, { model: value })} />
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
  value: McpServerConfig;
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
      <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...props.value })} />
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
          <TextAreaField
            label={t(props.locale, "formEnv")}
            value={formatRecordLines(props.value.env)}
            placeholder={t(props.locale, "formEnvPlaceholder")}
            onChange={(next) => props.onChange(props.name, { ...props.value, env: parseRecordLines(next) })}
          />
        </>
      )}
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveMcpServer")}</span>
        </button>
        <button className="action-button" onClick={() => void props.onRunAction("test", props.name)}>
          {t(props.locale, "mcpTest")}
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function ProfileForm(props: {
  locale: Locale;
  models: string[];
  name: string;
  value: Profile;
  isActive: boolean;
  onChange: (name: string, value: Profile) => void;
  onSave: () => void;
  onActivate: () => void;
  onClone: () => void;
  onDelete: () => void;
}): JSX.Element {
  const value = props.value;
  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Profile 编辑" : "Profile Editor"}</div>
      <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...value, name: next })} />
      <Field label={t(props.locale, "formLabel")} value={value.label} onChange={(next) => props.onChange(props.name, { ...value, label: next })} />
      <SelectField
        label={t(props.locale, "formDefaultModel")}
        value={value.default_model}
        onChange={(next) => props.onChange(props.name, { ...value, default_model: next })}
        options={props.models.map((model) => ({ value: model, label: model }))}
      />
      <Field label={t(props.locale, "formEditor")} value={value.default_editor} onChange={(next) => props.onChange(props.name, { ...value, default_editor: next })} />
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
        <button className={props.isActive ? "action-button action-button-primary" : "action-button"} onClick={props.onActivate}>{t(props.locale, "activate")}</button>
        <button className="action-button" onClick={props.onClone}>{t(props.locale, "clone")}</button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
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
      <input value={props.value} readOnly />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  popoverClassName?: string;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = props.options.find((option) => option.value === props.value) ?? props.options[0];

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
              <span className="field-select-option-copy">{option.label}</span>
              {option.value === props.value ? <Check size={16} /> : null}
            </button>
          ))}
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
  onChange: (value: string) => void;
}): JSX.Element {
  const pickFile = async (): Promise<void> => {
    const api = getApi();
    if (!api) {
      return;
    }
    const result = await api.pickFile({
      title: props.label,
      filters: [{ name: "TOML", extensions: ["toml"] }],
    });
    if (!result.canceled && result.filePath) {
      props.onChange(result.filePath);
    }
  };
  return (
    <div className="field-row">
      <Field label={props.label} value={props.value} onChange={props.onChange} />
      <button className="action-button compact" onClick={() => void pickFile()}>
        {t(props.locale, "browse")}
      </button>
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
    locale: "zh-CN" as Locale,
    tray_icon: false,
    display_open_mode: "remember-last" as DisplayOpenMode,
    close_behavior: "quit" as CloseBehavior,
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
          <span className="toolbar-icon-badge">
            <Languages size={16} />
          </span>
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
              <span className="toolbar-option-leading">{option.shortLabel}</span>
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

function PreviewWorkspace(props: {
  locale: Locale;
  preview: PreviewBundle;
  selectedFile: PreviewFileId;
  onSelectFile: (file: PreviewFileId) => void;
}): JSX.Element {
  const previewItems: Array<{
    id: PreviewFileId;
    title: string;
    format: "TOML" | "JSON";
    document: string;
    diff: string;
  }> = [
    {
      id: "config",
      title: t(props.locale, "previewConfig"),
      format: "TOML",
      document: props.preview.configDocument,
      diff: props.preview.configDiff,
    },
    {
      id: "profiles",
      title: t(props.locale, "previewProfiles"),
      format: "TOML",
      document: props.preview.profilesDocument,
      diff: props.preview.profilesDiff,
    },
    {
      id: "panel",
      title: t(props.locale, "previewPanel"),
      format: "TOML",
      document: props.preview.panelSettingsDocument,
      diff: props.preview.panelDiff,
    },
    {
      id: "mcp",
      title: t(props.locale, "previewMcp"),
      format: "JSON",
      document: props.preview.mcpDocument,
      diff: props.preview.mcpDiff,
    },
  ];
  const selectedItem = previewItems.find((item) => item.id === props.selectedFile) ?? previewItems[0];

  return (
    <section className="glass-panel preview-workspace">
      <div className="preview-tabs" role="tablist" aria-label={t(props.locale, "preview")}>
        {previewItems.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === selectedItem.id}
            className={item.id === selectedItem.id ? "preview-tab active" : "preview-tab"}
            onClick={() => props.onSelectFile(item.id)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <PreviewCard
        title={selectedItem.title}
        document={selectedItem.document}
        diff={selectedItem.diff}
        locale={props.locale}
        format={selectedItem.format}
      />
    </section>
  );
}

function PreviewCard(props: { title: string; document: string; diff: string; locale: Locale; format: "TOML" | "JSON" }): JSX.Element {
  return (
    <section className="preview-card">
      <div className="section-title">{props.title}</div>
      <div className="preview-columns">
        <CodePanel title={props.format} content={props.document} />
        <DiffPanel title={t(props.locale, "diff")} content={props.diff} />
      </div>
    </section>
  );
}

function CodePanel(props: { title: string; content: string }): JSX.Element {
  return (
    <div className="code-panel">
      <CodePanelHeader title={props.title} />
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

function DiffPanel(props: { title: string; content: string }): JSX.Element {
  return (
    <div className="code-panel">
      <CodePanelHeader title={props.title} />
      <div className="code-window diff-window" role="region" aria-label={props.title}>
        <ol className="code-lines diff-lines">
          {toDisplayLines(props.content).map((line, index) => (
            <li key={`${index}-${line}`} className={`code-line diff-line ${getDiffLineClass(line)}`}>
              <span className="code-line-number">{index + 1}</span>
              <code>{line || " "}</code>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CodePanelHeader(props: { title: string }): JSX.Element {
  return (
    <div className="code-head">
      <span className="code-head-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{props.title}</span>
    </div>
  );
}

function toDisplayLines(content: string): string[] {
  const normalized = content.trimEnd();
  return normalized ? normalized.split("\n") : [""];
}

function getDiffLineClass(line: string): string {
  if (line.startsWith("@@")) {
    return "diff-line-hunk";
  }
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ")) {
    return "diff-line-meta";
  }
  if (line.startsWith("+")) {
    return "diff-line-added";
  }
  if (line.startsWith("-")) {
    return "diff-line-removed";
  }
  return "diff-line-context";
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
      version: "v1.0.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.0`,
      text: isZh
        ? "首个桌面版本，包含 Provider、Model、Profile 管理、配置预览与 Diff、状态栏菜单，以及修复后的 GitHub Release 发布流程。"
        : "Initial desktop release with Provider, Model, Profile management, config preview, diff, tray menu, and the fixed GitHub Release pipeline.",
    },
  ];

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
            {history.map((item) => (
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
  preview: PreviewBundle;
  diagnostics: DiagnosticsState;
  onActivateProfile: (name: string) => void;
  onNavigate: (tab: TabId) => void;
}): JSX.Element {
  const { state, locale, preview, diagnostics, onActivateProfile, onNavigate } = props;
  const activeProfile = state.profiles[state.activeProfile];
  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);

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
        <section className="glass-panel overview-card overview-card-clickable" onClick={() => onNavigate("providers")} role="button" tabIndex={0}>
          <div className="section-title">
            <Globe size={16} />
            <span>{t(locale, "overviewProviderList")}</span>
            <span className="overview-badge">{providerEntries.length}</span>
          </div>
          <div className="overview-list">
            {providerEntries.map(([name, provider]) => (
              <div key={name} className="overview-list-item">
                <span className="overview-list-name">{name}</span>
                <span className="overview-list-meta">{provider.type}</span>
              </div>
            ))}
            {providerEntries.length === 0 && <p className="overview-empty">-</p>}
          </div>
        </section>

        <section className="glass-panel overview-card overview-card-clickable" onClick={() => onNavigate("models")} role="button" tabIndex={0}>
          <div className="section-title">
            <Boxes size={16} />
            <span>{t(locale, "overviewModelList")}</span>
            <span className="overview-badge">{modelEntries.length}</span>
          </div>
          <div className="overview-list">
            {modelEntries.map(([name, model]) => (
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
        </div>
        <div className="overview-profile-grid">
          {profileEntries.map(([name, profile]) => {
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
            <FileCog size={16} />
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
