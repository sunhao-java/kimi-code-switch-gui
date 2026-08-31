import { act, renderHook } from "@testing-library/react";
import type { AppState, FileSnapshotBundle } from "@shared/types";
import { createDefaultShortcuts } from "@shared/shortcutStore";

vi.mock("./backupAuto", () => ({
  initBackupBaseline: vi.fn(async () => undefined),
  maybeBackupAfterSave: vi.fn(async () => undefined),
  maybeRunScheduledBackup: vi.fn(() => undefined),
}));

import { useAppPersistence } from "./useAppPersistence";
import { initBackupBaseline } from "./backupAuto";

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
      shortcuts: createDefaultShortcuts(),
      mcp_servers: {},
    },
    mcpConfig: {
      mcpServers: {},
    },
  };
}

function createSnapshot(label: string): FileSnapshotBundle {
  return {
    capturedAt: label,
    files: {
      config: { id: "config", path: "/tmp/config.toml", exists: true, size: 1, mtimeMs: 1, sha256: `${label}-config` },
      panel: { id: "panel", path: "/tmp/config.panel.toml", exists: true, size: 1, mtimeMs: 1, sha256: `${label}-panel` },
      mcp: { id: "mcp", path: "/tmp/mcp.json", exists: true, size: 1, mtimeMs: 1, sha256: `${label}-mcp` },
    },
  };
}

type PersistenceHookProps = Parameters<typeof useAppPersistence>[0];

function createProps(overrides: Partial<PersistenceHookProps> = {}): PersistenceHookProps {
  const state = createState();
  return {
    state,
    savedState: state,
    locale: "zh-CN",
    setState: vi.fn(),
    setSavedState: vi.fn(),
    setPreview: vi.fn(),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setDiagnostics: vi.fn(),
    fileSnapshot: null,
    setFileSnapshot: vi.fn(),
    setDoctorReport: vi.fn(),
    confirmExternalOverwrite: vi.fn(),
    refreshPreview: vi.fn(),
    refreshSkills: vi.fn(),
    currentSelections: { provider: "", model: "", profile: "", mcpServer: "" },
    setSelectedProvider: vi.fn(),
    setSelectedModel: vi.fn(),
    setSelectedProfile: vi.fn(),
    setSelectedMcpServer: vi.fn(),
    ...overrides,
  };
}

describe("useAppPersistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("establishes the snapshot baseline before returning but defers heavier startup work", async () => {
    const state = createState();
    const baselineSnapshot = createSnapshot("baseline");
    const captureSnapshot = vi.fn().mockResolvedValue(baselineSnapshot);
    const runDoctor = vi.fn().mockResolvedValue({
      ok: true,
      generatedAt: "",
      issues: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    });
    const loadStateApi = vi.fn().mockResolvedValue(state);
    const previewState = vi.fn().mockResolvedValue({ config: "preview" });
    const refreshSkills = vi.fn(() => new Promise<void>(() => undefined));
    vi.stubGlobal("kimiSwitch", {
      loadState: loadStateApi,
      previewState,
      captureSnapshot,
      runDoctor,
    });
    const setState = vi.fn();
    const setSavedState = vi.fn();
    const setPreview = vi.fn();
    const setDiagnostics = vi.fn();
    const setFileSnapshot = vi.fn();

    const { result } = renderHook(() => useAppPersistence({
      state,
      savedState: null,
      locale: "zh-CN",
      setState,
      setSavedState,
      setPreview,
      setError: vi.fn(),
      setNotice: vi.fn(),
      setDiagnostics,
      fileSnapshot: null,
      setFileSnapshot,
      setDoctorReport: vi.fn(),
      confirmExternalOverwrite: vi.fn(),
      refreshPreview: vi.fn(),
      refreshSkills,
      currentSelections: { provider: "", model: "", profile: "", mcpServer: "" },
      setSelectedProvider: vi.fn(),
      setSelectedModel: vi.fn(),
      setSelectedProfile: vi.fn(),
      setSelectedMcpServer: vi.fn(),
    }));

    await act(async () => {
      await result.current.loadState();
    });

    expect(loadStateApi).toHaveBeenCalled();
    expect(previewState).toHaveBeenCalledWith(expect.objectContaining({
      configPath: "~/.kimi-code-switch-gui/.env/default/config.toml",
    }));
    expect(setPreview).toHaveBeenCalledWith({ config: "preview" });
    // 快照基线在 loadState 返回前同步建立（关闭外部变更检测被绕过的窗口）。
    expect(captureSnapshot).toHaveBeenCalled();
    expect(setFileSnapshot).toHaveBeenCalledWith(baselineSnapshot);
    // 较重的后加载任务在后台执行：refreshSkills 永不 resolve，其后的备份基线
    // 不会被触达，证明这些任务不阻塞首屏 loadState 的返回。
    expect(initBackupBaseline).not.toHaveBeenCalled();
  });

  it("uses the latest snapshot ref when saving after another internal write", async () => {
    const state = createState();
    const staleSnapshot = createSnapshot("stale");
    const latestSnapshot = createSnapshot("latest");
    const saveStateSafe = vi.fn().mockResolvedValue({
      ok: true,
      snapshot: latestSnapshot,
      doctor: { ok: true, generatedAt: "", issues: [], errorCount: 0, warningCount: 0, infoCount: 0 },
    });
    const previewState = vi.fn().mockResolvedValue({});
    vi.stubGlobal("kimiSwitch", {
      saveStateSafe,
      previewState,
    });

    const { result } = renderHook(() => useAppPersistence({
      state,
      savedState: state,
      locale: "zh-CN",
      setState: vi.fn(),
      setSavedState: vi.fn(),
      setPreview: vi.fn(),
      setError: vi.fn(),
      setNotice: vi.fn(),
      setDiagnostics: vi.fn(),
      fileSnapshot: staleSnapshot,
      fileSnapshotRef: { current: latestSnapshot },
      setFileSnapshot: vi.fn(),
      setDoctorReport: vi.fn(),
      confirmExternalOverwrite: vi.fn(),
      refreshPreview: vi.fn(),
      refreshSkills: vi.fn(),
      currentSelections: { provider: "", model: "", profile: "", mcpServer: "" },
      setSelectedProvider: vi.fn(),
      setSelectedModel: vi.fn(),
      setSelectedProfile: vi.fn(),
      setSelectedMcpServer: vi.fn(),
    }));

    await act(async () => {
      await result.current.persistState(state);
    });

    expect(saveStateSafe).toHaveBeenCalledWith(expect.any(Object), {
      expectedSnapshot: latestSnapshot,
    });
  });

  it("coalesces consecutive persistence requests into the latest state", async () => {
    vi.useFakeTimers();
    const first = createState();
    const latest = createState();
    latest.activeProfile = "latest";
    latest.panelSettings.active_profile = "latest";
    latest.mainConfig.default_thinking = false;
    const saveStateSafe = vi.fn().mockResolvedValue({ ok: true });
    const previewState = vi.fn().mockResolvedValue({});
    vi.stubGlobal("kimiSwitch", { saveStateSafe, previewState });

    const { result } = renderHook(() => useAppPersistence({
      state: latest,
      savedState: first,
      locale: "zh-CN",
      setState: vi.fn(),
      setSavedState: vi.fn(),
      setPreview: vi.fn(),
      setError: vi.fn(),
      setNotice: vi.fn(),
      setDiagnostics: vi.fn(),
      fileSnapshot: null,
      setFileSnapshot: vi.fn(),
      setDoctorReport: vi.fn(),
      confirmExternalOverwrite: vi.fn(),
      refreshPreview: vi.fn(),
      refreshSkills: vi.fn(),
      currentSelections: { provider: "", model: "", profile: "", mcpServer: "" },
      setSelectedProvider: vi.fn(),
      setSelectedModel: vi.fn(),
      setSelectedProfile: vi.fn(),
      setSelectedMcpServer: vi.fn(),
    }));

    let firstRequest: Promise<void>;
    let latestRequest: Promise<void>;
    act(() => {
      firstRequest = result.current.persistState(first);
      latestRequest = result.current.persistState(latest);
    });
    expect(saveStateSafe).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.all([firstRequest, latestRequest]);
    });
    expect(saveStateSafe).toHaveBeenCalledTimes(1);
    expect(saveStateSafe.mock.calls[0]?.[0].mainConfig.default_thinking).toBe(false);
  });

  it("keeps the debounced save pending across re-renders that change callback identities", async () => {
    vi.useFakeTimers();
    const first = createState();
    const saveStateSafe = vi.fn().mockResolvedValue({ ok: true });
    const previewState = vi.fn().mockResolvedValue({});
    vi.stubGlobal("kimiSwitch", { saveStateSafe, previewState });

    const { result, rerender } = renderHook(
      (props: PersistenceHookProps) => useAppPersistence(props),
      { initialProps: createProps({ state: first }) },
    );

    act(() => {
      void result.current.persistState(first);
    });
    // App 状态更新触发重渲染，ctx 里的回调身份全部变化——debounce 不能被冲掉。
    rerender(createProps());
    rerender(createProps());
    expect(saveStateSafe).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(saveStateSafe).toHaveBeenCalledTimes(1);
  });

  it("does not resolve waiters registered during an in-flight save until their own save completes", async () => {
    vi.useFakeTimers();
    const first = createState();
    const latest = createState();
    latest.mainConfig.default_thinking = false;
    let resolveFirstSave!: () => void;
    const saveStateSafe = vi.fn()
      .mockImplementationOnce(() => new Promise<{ ok: true }>((resolve) => {
        resolveFirstSave = () => resolve({ ok: true });
      }))
      .mockResolvedValue({ ok: true });
    const previewState = vi.fn().mockResolvedValue({});
    vi.stubGlobal("kimiSwitch", { saveStateSafe, previewState });

    const { result } = renderHook(() => useAppPersistence(createProps()));

    let firstRequest!: Promise<void>;
    act(() => {
      firstRequest = result.current.persistState(first);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // 第一轮保存已在途（挂起在 resolveFirstSave 上）。
    expect(saveStateSafe).toHaveBeenCalledTimes(1);

    let secondDone = false;
    let secondRequest!: Promise<void>;
    act(() => {
      secondRequest = result.current.persistState(latest).then(() => {
        secondDone = true;
      });
    });
    await act(async () => {
      resolveFirstSave();
      await firstRequest;
    });
    // 第一轮完成只放行第一轮的 waiter；在途期间注册的 waiter 属于下一轮。
    expect(secondDone).toBe(false);
    expect(saveStateSafe).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(150);
      await secondRequest;
    });
    expect(secondDone).toBe(true);
    expect(saveStateSafe).toHaveBeenCalledTimes(2);
    expect(saveStateSafe.mock.calls[1]?.[0].mainConfig.default_thinking).toBe(false);
  });

  it("waits for an in-flight debounced save before starting an immediate save", async () => {
    vi.useFakeTimers();
    const first = createState();
    const immediate = createState();
    let resolveFirstSave!: () => void;
    const saveStateSafe = vi.fn()
      .mockImplementationOnce(() => new Promise<{ ok: true }>((resolve) => {
        resolveFirstSave = () => resolve({ ok: true });
      }))
      .mockResolvedValue({ ok: true });
    const previewState = vi.fn().mockResolvedValue({});
    vi.stubGlobal("kimiSwitch", { saveStateSafe, previewState });

    const { result } = renderHook(() => useAppPersistence(createProps()));

    act(() => {
      void result.current.persistState(first);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(saveStateSafe).toHaveBeenCalledTimes(1);

    let immediateDone = false;
    let immediateRequest!: Promise<void>;
    await act(async () => {
      immediateRequest = result.current.persistImmediateState(immediate).then(() => {
        immediateDone = true;
      });
      // 排空微任务：若 flush 不等待在途保存，第二个 saveStateSafe 会在此处并发发出。
      await Promise.resolve();
    });
    // 防抖保存在途时，立即保存必须排队等待，不能并发发起第二个 saveStateSafe。
    expect(saveStateSafe).toHaveBeenCalledTimes(1);
    expect(immediateDone).toBe(false);

    await act(async () => {
      resolveFirstSave();
      await immediateRequest;
    });
    expect(immediateDone).toBe(true);
    expect(saveStateSafe).toHaveBeenCalledTimes(2);
  });
});
