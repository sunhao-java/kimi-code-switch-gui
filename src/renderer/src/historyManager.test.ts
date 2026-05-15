import type { AppState } from "@shared/types";
import { clearHistory, getHistory, pushChangeSnapshot, restoreHistoryEntry } from "./historyManager";

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

describe("historyManager", () => {
  beforeEach(() => {
    clearHistory();
  });

  it("stores readable document diffs for a saved change", () => {
    const previous = createState();
    const next = createState();
    next.panelSettings.locale = "en-US";

    pushChangeSnapshot(previous, next, "save");

    const [entry] = getHistory(next);
    expect(entry?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "panel",
          title: "config.panel.toml",
          changeCount: expect.any(Number),
        }),
      ]),
    );
    expect(entry?.details.find((detail) => detail.id === "panel")?.diff).toContain('locale = "en-US"');
  });

  it("restores the selected entry and keeps only older history entries", () => {
    const first = createState();
    const second = createState();
    second.panelSettings.locale = "en-US";
    const third = createState();
    third.panelSettings.locale = "ja-JP";

    pushChangeSnapshot(first, second, "first");
    const firstEntryId = getHistory()[0]!.id;
    pushChangeSnapshot(second, third, "second");

    const restored = restoreHistoryEntry(firstEntryId);

    expect(restored?.panelSettings.locale).toBe("zh-CN");
    expect(getHistory()).toHaveLength(0);
  });
});
