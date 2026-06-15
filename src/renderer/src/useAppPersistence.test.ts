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

describe("useAppPersistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads state and preview without waiting for deferred startup work", async () => {
    const state = createState();
    let resolveSnapshot: ((value: FileSnapshotBundle) => void) | undefined;
    const captureSnapshot = vi.fn(() => new Promise<FileSnapshotBundle>((resolve) => {
      resolveSnapshot = resolve;
    }));
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
    expect(captureSnapshot).toHaveBeenCalled();
    expect(runDoctor).toHaveBeenCalled();
    expect(refreshSkills).not.toHaveBeenCalled();
    expect(initBackupBaseline).not.toHaveBeenCalled();
    expect(setFileSnapshot).not.toHaveBeenCalled();

    resolveSnapshot?.(createSnapshot("deferred"));
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
});
