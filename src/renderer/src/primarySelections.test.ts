import {
  applyPrimarySelections,
  getDefaultPrimarySelections,
  getRetainedPrimarySelections,
} from "./primarySelections";
import type { AppState } from "@shared/types";

function createState(): AppState {
  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
    mainConfig: {
      default_model: "model-a",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "model-a": {
          provider: "provider-a",
          model: "kimi-a",
          max_context_size: 1,
          capabilities: [],
        },
        "model-b": {
          provider: "provider-b",
          model: "kimi-b",
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
        "provider-b": {
          type: "openai",
          base_url: "https://b.test",
          api_key: "sk-b",
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
        default_model: "model-a",
        default_thinking: true,
        default_yolo: false,
        default_plan_mode: false,
        default_editor: "",
        theme: "dark",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
      work: {
        name: "work",
        label: "Work",
        default_model: "model-b",
        default_thinking: false,
        default_yolo: false,
        default_plan_mode: false,
        default_editor: "",
        theme: "light",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
    },
    activeProfile: "work",
    panelSettings: {
      version: 1,
      config_path: "/tmp/config.toml",
      profiles_path: "",
      follow_config_profiles: true,
      theme: "auto",
      ui_font_size: "standard",
      locale: "zh-CN",
      tray_icon: false,
      display_open_mode: "remember-last",
      close_behavior: "quit",
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
      mcpServers: {
        serverA: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.a.test",
          headers: {},
          command: "",
          args: [],
          env: {},
        },
      },
    },
  };
}

describe("primarySelections", () => {
  it("returns default selections from first available items and active profile", () => {
    const state = createState();

    expect(getDefaultPrimarySelections(state)).toEqual({
      provider: "provider-a",
      model: "model-a",
      profile: "work",
      mcpServer: "serverA",
    });
  });

  it("retains current selections when they still exist", () => {
    const state = createState();

    expect(getRetainedPrimarySelections(state, {
      provider: "provider-b",
      model: "model-b",
      profile: "default",
      mcpServer: "serverA",
    })).toEqual({
      provider: "provider-b",
      model: "model-b",
      profile: "default",
      mcpServer: "serverA",
    });
  });

  it("falls back to available defaults when current selections disappear", () => {
    const state = createState();

    expect(getRetainedPrimarySelections(state, {
      provider: "missing-provider",
      model: "missing-model",
      profile: "missing-profile",
      mcpServer: "missing-server",
    })).toEqual({
      provider: "provider-a",
      model: "model-a",
      profile: "work",
      mcpServer: "serverA",
    });
  });

  it("applies selections through setters", () => {
    const calls: string[] = [];
    applyPrimarySelections(
      {
        provider: "provider-b",
        model: "model-b",
        profile: "default",
        mcpServer: "serverA",
      },
      {
        setSelectedProvider: (value) => void calls.push(`provider:${String(value)}`),
        setSelectedModel: (value) => void calls.push(`model:${String(value)}`),
        setSelectedProfile: (value) => void calls.push(`profile:${String(value)}`),
        setSelectedMcpServer: (value) => void calls.push(`mcp:${String(value)}`),
      },
    );

    expect(calls).toEqual([
      "provider:provider-b",
      "model:model-b",
      "profile:default",
      "mcp:serverA",
    ]);
  });
});
