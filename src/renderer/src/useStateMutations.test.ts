import type { AppState } from "@shared/types";
import type { DiagnosticsState } from "./overviewDashboard";
import { clearHistory, getHistory } from "./historyManager";
import { useStateMutations } from "./useStateMutations";

vi.mock("./tabComponents", () => ({
  applyAppearanceMode: vi.fn(),
  applyAppearanceTheme: vi.fn(),
  applyUiFontSize: vi.fn(),
}));

beforeEach(() => {
  clearHistory();
});

function createState(): AppState {
  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
    mainConfig: {
      default_model: "provider-a/model-a",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "provider-a/model-a": {
          provider: "provider-a",
          model: "model-a",
          max_context_size: 1,
          capabilities: [],
        },
      },
      providers: {
        "provider-a": {
          type: "kimi",
          base_url: "https://a.test",
          api_key: "sk-a",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: {
      default: {
        name: "default",
        label: "Default",
        default_model: "provider-a/model-a",
        default_thinking: true,
        default_yolo: false,
        default_plan_mode: false,
        default_editor: "",
        theme: "dark",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
    },
    activeProfile: "default",
    panelSettings: {
      version: 1,
      config_path: "/tmp/config.toml",
      profiles_path: "",
      follow_config_profiles: true,
      theme: "dark",
      appearance_theme: "aurora",
      ui_font_size: "standard",
      locale: "zh-CN",
      tray_icon: false,
      sidebar_collapsed: false,
      display_open_mode: "remember-last",
      close_behavior: "quit",
      terminal_app: "system-terminal",
      backup_strategy: "manual",
      backup_frequency: "daily",
      backup_retention_count: 10,
      backup_destination_type: "local",
      backup_local_path: "/tmp/backups",
      backup_webdav_url: "",
      backup_webdav_username: "",
      backup_webdav_password: "",
      backup_webdav_path: "",
      shortcuts: {} as AppState["panelSettings"]["shortcuts"],
      mcp_servers: {},
    },
    mcpConfig: {
      mcpServers: {},
    },
  };
}

function createMockContext(overrides: Partial<{
  state: AppState;
  savedState: AppState | null;
  locale: AppState["panelSettings"]["locale"];
}> = {}) {
  const setStateValues: AppState[] = [];
  const setErrorValues: string[] = [];
  const setNoticeValues: string[] = [];
  const diagnosticsUpdates: DiagnosticsState[] = [];

  const setState = vi.fn((updater: AppState | ((prev: AppState) => AppState)) => {
    const next = typeof updater === "function" ? updater(overrides.state ?? createState()) : updater;
    setStateValues.push(next);
  });

  const setError = vi.fn((updater: string | ((prev: string) => string)) => {
    const next = typeof updater === "function" ? updater("") : updater;
    setErrorValues.push(next);
  });

  const setNotice = vi.fn((updater: string | ((prev: string) => string)) => {
    const next = typeof updater === "function" ? updater("") : updater;
    setNoticeValues.push(next);
  });

  const setDiagnostics = vi.fn((updater: DiagnosticsState | ((prev: DiagnosticsState) => DiagnosticsState)) => {
    const base: DiagnosticsState = { preload: "ok", loadState: "ok", previewState: "ok", lastError: "" };
    const next = typeof updater === "function" ? updater(base) : updater;
    diagnosticsUpdates.push(next);
  });

  return {
    state: overrides.state ?? createState(),
    savedState: overrides.savedState ?? null,
    locale: overrides.locale ?? "zh-CN",
    setState,
    setError,
    setNotice,
    setDiagnostics,
    refreshPreview: vi.fn().mockResolvedValue(undefined),
    persistState: vi.fn().mockResolvedValue(undefined),
    persistImmediateState: vi.fn().mockResolvedValue(undefined),
    setStateValues,
    setErrorValues,
    setNoticeValues,
    diagnosticsUpdates,
  };
}

describe("updateState", () => {
  it("applies updater, sets state, refreshes preview, and persists", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState((draft) => {
      draft.mainConfig.default_thinking = false;
    });

    expect(ctx.setState).toHaveBeenCalledTimes(1);
    const nextState = ctx.setStateValues[0];
    expect(nextState.mainConfig.default_thinking).toBe(false);

    expect(ctx.refreshPreview).toHaveBeenCalledTimes(1);
    expect(ctx.persistState).toHaveBeenCalledTimes(1);
    expect(ctx.persistState).toHaveBeenCalledWith(nextState);

    expect(ctx.setError).toHaveBeenCalledWith("");
    expect(ctx.setNotice).toHaveBeenCalledWith("");
  });

  it("skips persistState when persist=false", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState(
      (draft) => {
        draft.mainConfig.default_thinking = false;
      },
      { persist: false },
    );

    expect(ctx.setState).toHaveBeenCalledTimes(1);
    expect(ctx.refreshPreview).toHaveBeenCalledTimes(1);
    expect(ctx.persistState).not.toHaveBeenCalled();
  });

  it("persists when persist option is not specified (default behavior)", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState((draft) => {
      draft.activeProfile = "work";
    });

    expect(ctx.persistState).toHaveBeenCalledTimes(1);
  });

  it("records persisted changes in history", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState((draft) => {
      draft.mainConfig.default_thinking = false;
    }, { historySummary: "toggle thinking" });

    const [entry] = getHistory(ctx.setStateValues[0]);
    expect(entry?.summary).toBe("toggle thinking");
    expect(entry?.details.length).toBeGreaterThan(0);
  });

  it("does not record draft changes unless explicitly requested", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState(
      (draft) => {
        draft.mainConfig.default_thinking = false;
      },
      { persist: false },
    );

    expect(getHistory()).toHaveLength(0);
  });

  it("records explicit draft history for quick operations like clone", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState(
      (draft) => {
        draft.mainConfig.providers["provider-copy"] = {
          ...draft.mainConfig.providers["provider-a"]!,
        };
      },
      { persist: false, recordHistory: true, historySummary: "clone" },
    );

    expect(getHistory(ctx.setStateValues[0])[0]?.summary).toBe("clone");
  });

  it("can skip history for persisted restore operations", () => {
    const ctx = createMockContext();
    const { updateState } = useStateMutations(ctx);

    updateState(
      (draft) => {
        draft.mainConfig.default_thinking = false;
      },
      { persist: true, recordHistory: false },
    );

    expect(ctx.persistState).toHaveBeenCalledTimes(1);
    expect(getHistory()).toHaveLength(0);
  });

  it("catches updater errors and sets error message", () => {
    const ctx = createMockContext({ locale: "en-US" });
    const { updateState } = useStateMutations(ctx);

    updateState(() => {
      throw new Error("test error");
    });

    expect(ctx.setState).not.toHaveBeenCalled();
    expect(ctx.setError).toHaveBeenCalled();
    expect(ctx.setErrorValues.length).toBeGreaterThan(0);
    // The error is translated; for en-US "test error" should map to itself or a known translation
    expect(ctx.setErrorValues[0]).toBeTruthy();

    expect(ctx.setDiagnostics).toHaveBeenCalledTimes(1);
    expect(ctx.diagnosticsUpdates[0].lastError).toBe("test error");

    expect(ctx.setNotice).toHaveBeenCalledWith("");
  });

  it("catches non-Error exceptions and converts to string", () => {
    const ctx = createMockContext({ locale: "en-US" });
    const { updateState } = useStateMutations(ctx);

    updateState(() => {
      throw "string error";
    });

    expect(ctx.setDiagnostics).toHaveBeenCalledTimes(1);
    expect(ctx.diagnosticsUpdates[0].lastError).toBe("string error");
  });

  it("does nothing when state is falsy", () => {
    const ctx = createMockContext();
    // Override state to be falsy
    const hook = useStateMutations({ ...ctx, state: null as unknown as AppState });

    hook.updateState(() => {});

    expect(ctx.setState).not.toHaveBeenCalled();
    expect(ctx.refreshPreview).not.toHaveBeenCalled();
  });
});

describe("updateImmediateState", () => {
  it("applies updater to both visible and persisted drafts and persists immediately", () => {
    const savedState = createState();
    savedState.mainConfig.default_thinking = false;
    const ctx = createMockContext({ savedState });
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState((draft) => {
      draft.activeProfile = "work";
    });

    expect(ctx.persistImmediateState).toHaveBeenCalledTimes(1);
    // First arg is visible draft, second is persisted draft
    const [visibleDraft, persistedDraft] = ctx.persistImmediateState.mock.calls[0];
    expect(visibleDraft.activeProfile).toBe("work");
    expect(persistedDraft.activeProfile).toBe("work");
  });

  it("uses state as base for persisted draft when savedState is null", () => {
    const ctx = createMockContext({ savedState: null });
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState((draft) => {
      draft.activeProfile = "work";
    });

    expect(ctx.persistImmediateState).toHaveBeenCalledTimes(1);
    const [visibleDraft, persistedDraft] = ctx.persistImmediateState.mock.calls[0];
    expect(visibleDraft.activeProfile).toBe("work");
    expect(persistedDraft.activeProfile).toBe("work");
  });

  it("does not record immediate changes unless explicitly requested", () => {
    const ctx = createMockContext();
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState((draft) => {
      draft.panelSettings.sidebar_collapsed = true;
    });

    expect(ctx.persistImmediateState).toHaveBeenCalledTimes(1);
    expect(getHistory()).toHaveLength(0);
  });

  it("records explicitly requested immediate history", () => {
    const ctx = createMockContext();
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState(
      (draft) => {
        draft.panelSettings.favorites = { providers: ["provider-a"] };
      },
      { recordHistory: true, historySummary: "favorite provider" },
    );

    const [entry] = getHistory(ctx.persistImmediateState.mock.calls[0][0]);
    expect(entry?.summary).toBe("favorite provider");
  });

  it("uses latest state refs for immediate updates after a synchronous restore", () => {
    const restoredState = createState();
    const staleState = createState();
    staleState.mainConfig.providers["draft-provider"] = {
      type: "kimi",
      base_url: "https://draft.test",
      api_key: "",
    };
    const ctx = createMockContext({ state: staleState, savedState: staleState });
    const { updateImmediateState } = useStateMutations({
      ...ctx,
      stateRef: { current: restoredState },
      savedStateRef: { current: restoredState },
    });

    updateImmediateState((draft) => {
      draft.panelSettings.uiState = {
        ...(draft.panelSettings.uiState ?? {}),
        activeTab: "providers",
      };
    });

    const [visibleDraft, persistedDraft] = ctx.persistImmediateState.mock.calls[0];
    expect(visibleDraft.mainConfig.providers["draft-provider"]).toBeUndefined();
    expect(persistedDraft.mainConfig.providers["draft-provider"]).toBeUndefined();
    expect(visibleDraft.panelSettings.uiState?.activeTab).toBe("providers");
    expect(persistedDraft.panelSettings.uiState?.activeTab).toBe("providers");
  });

  it("catches updater errors and sets error message", () => {
    const ctx = createMockContext({ locale: "en-US" });
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState(() => {
      throw new Error("immediate error");
    });

    expect(ctx.persistImmediateState).not.toHaveBeenCalled();
    expect(ctx.setError).toHaveBeenCalled();
    expect(ctx.setDiagnostics).toHaveBeenCalledTimes(1);
    expect(ctx.diagnosticsUpdates[0].lastError).toBe("immediate error");
    expect(ctx.setNotice).toHaveBeenCalledWith("");
  });

  it("catches non-Error exceptions and converts to string", () => {
    const ctx = createMockContext({ locale: "en-US" });
    const { updateImmediateState } = useStateMutations(ctx);

    updateImmediateState(() => {
      throw 42;
    });

    expect(ctx.setDiagnostics).toHaveBeenCalledTimes(1);
    expect(ctx.diagnosticsUpdates[0].lastError).toBe("42");
  });

  it("does nothing when state is falsy", () => {
    const ctx = createMockContext();
    const hook = useStateMutations({ ...ctx, state: null as unknown as AppState });

    hook.updateImmediateState(() => {});

    expect(ctx.persistImmediateState).not.toHaveBeenCalled();
  });
});
