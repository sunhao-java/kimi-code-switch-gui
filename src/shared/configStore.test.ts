import {
  DEFAULT_PROFILE_NAME,
  applyProfile,
  applyTemplate,
  batchDeleteProviders,
  batchToggleMcpServers,
  batchUpdateProviderApiKey,
  bootstrapProfiles,
  buildConfigDocument,
  buildPanelSettingsDocument,
  buildProfilesDocument,
  buildPreviewBundle,
  cloneProfile,
  cloneState,
  compareProfiles,
  copyProfileField,
  createDefaultPanelSettings,
  createLineDiff,
  deleteCustomTemplate,
  deleteModel,
  deleteProfile,
  deleteProvider,
  exportConfig,
  formatMissingModelError,
  getImportPreview,
  importConfig,
  saveCustomTemplate,
  searchConfig,
  toggleFavorite,
  validateImportData,
  loadAppState,
  loadPanelSettings,
  normalizeStatePaths,
  parsePanelSettingsDocument,
  PROVIDER_TEMPLATES,
  saveAppState,
  upsertModel,
  upsertProfile,
  upsertProvider,
} from "./configStore";
import { buildMcpConfigDocument } from "./mcpStore";
import type { AppState } from "./types";

function createState(): AppState {
  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
    mainConfig: {
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "kimi_gateway/kimi-k2.5": {
          provider: "kimi_gateway",
          model: "kimi-k2.5",
          max_context_size: 262144,
          capabilities: ["thinking"],
        },
      },
      providers: {
        kimi_gateway: {
          type: "kimi",
          base_url: "https://example.test/v1",
          api_key: "sk-test",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: bootstrapProfiles({
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "kimi_gateway/kimi-k2.5": {
          provider: "kimi_gateway",
          model: "kimi-k2.5",
          max_context_size: 262144,
          capabilities: ["thinking"],
        },
      },
      providers: {
        kimi_gateway: {
          type: "kimi",
          base_url: "https://example.test/v1",
          api_key: "sk-test",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    }),
    activeProfile: DEFAULT_PROFILE_NAME,
    panelSettings: createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
    mcpConfig: {
      mcpServers: {
        context7: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.context7.com/mcp",
          headers: {
            CONTEXT7_API_KEY: "ctx-test",
          },
          command: "",
          args: [],
          env: {},
        },
        chrome_devtools: {
          enabled: true,
          transport: "stdio",
          url: "",
          headers: {},
          command: "npx",
          args: ["chrome-devtools-mcp@latest"],
          env: {
            DEBUG: "1",
          },
        },
      },
    },
  };
}

describe("configStore", () => {
  it("bootstraps a default profile from main config", () => {
    const state = createState();
    expect(state.profiles.default.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("applies profile values into main config", () => {
    const state = createState();
    upsertProvider(state, "alt_gateway", {
      type: "openai",
      base_url: "https://alt.example/v1",
      api_key: "sk-alt",
    });
    upsertModel(state, "alt_gateway/gpt-4.1", {
      provider: "alt_gateway",
      model: "gpt-4.1",
      max_context_size: 128000,
      capabilities: ["thinking"],
    });
    upsertProfile(state, {
      name: "work",
      label: "Work",
      default_model: "alt_gateway/gpt-4.1",
      default_thinking: false,
      default_yolo: true,
      default_plan_mode: true,
      default_editor: "vim",
      theme: "light",
      show_thinking_stream: true,
      merge_all_available_skills: true,
    });

    applyProfile(state, "work");

    expect(state.mainConfig.default_model).toBe("alt_gateway/gpt-4.1");
    expect(state.mainConfig.default_yolo).toBe(true);
    expect(state.activeProfile).toBe("work");
  });

  it("blocks deleting provider that is still referenced", () => {
    const state = createState();
    expect(() => deleteProvider(state, "kimi_gateway")).toThrow(/still used by model/);
  });

  it("blocks deleting model that is still used by profile", () => {
    const state = createState();
    expect(() => deleteModel(state, "kimi_gateway/kimi-k2.5")).toThrow(/still used by profile/);
  });

  it("blocks deleting active profile", () => {
    const state = createState();
    expect(() => deleteProfile(state, "default")).toThrow(/Cannot delete the active profile/);
  });

  it("clones profiles", () => {
    const state = createState();
    cloneProfile(state, "default", "default-copy", "Default Copy");
    expect(state.profiles["default-copy"].label).toBe("Default Copy");
    expect(state.profiles["default-copy"].default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("preserves profile editor and theme from input", () => {
    const state = createState();
    upsertProfile(state, {
      name: "work",
      label: "Work",
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "vim",
      theme: "light",
      show_thinking_stream: false,
      merge_all_available_skills: false,
    });

    expect(state.profiles.work.default_editor).toBe("vim");
    expect(state.profiles.work.theme).toBe("light");
  });

  it("renders config document", () => {
    const document = buildConfigDocument(createState());
    expect(document).toContain('default_model = "kimi_gateway/kimi-k2.5"');
    expect(document).toContain("[providers.kimi_gateway]");
  });

  it("formats actionable missing model error", () => {
    const message = formatMissingModelError("kimi-k2.5", { "kimi_gateway/kimi-k2.5": {} }, {
      context: "配置Profile default",
    });
    expect(message).toContain("这里需要填写 [models] 下的模型 key");
    expect(message).toContain("可用模型 key：kimi_gateway/kimi-k2.5");
  });

  it("formats empty model hint when there are no models", () => {
    const message = formatMissingModelError("", {}, { context: "配置Profile broken" });
    expect(message).toContain("当前还没有任何模型");
  });

  it("builds preview bundle with diff", () => {
    const preview = buildPreviewBundle(createState(), {
      configDocument: "",
      profilesDocument: "",
      panelSettingsDocument: "",
    });
    expect(preview.configDocument).toContain("default_model");
    expect(preview.configDiff).toContain("+ default_model");
    expect(preview.mcpDocument).toContain('"mcpServers"');
    expect(preview.mcpDiff).toContain('+   "mcpServers": {');
  });

  it("creates simple line diff", () => {
    expect(createLineDiff("alpha\nbeta\n", "alpha\ngamma\n")).toContain("- beta");
    expect(createLineDiff("alpha\nbeta\n", "alpha\ngamma\n")).toContain("+ gamma");
  });

  it("clones state deeply", () => {
    const state = createState();
    const cloned = cloneState(state);
    cloned.mainConfig.default_model = "changed";
    expect(state.mainConfig.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("loads app state from in-memory files", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(
        createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      ),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
      "/tmp/mcp.json": buildMcpConfigDocument(createState().mcpConfig),
    });

    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    });

    expect(loaded.activeProfile).toBe("default");
    expect(loaded.mainConfig.providers.kimi_gateway.type).toBe("kimi");
    expect(loaded.mcpConfig.mcpServers.context7.url).toBe("https://mcp.context7.com/mcp");
    expect(loaded.mcpConfig.mcpServers.chrome_devtools.command).toBe("npx");
  });

  it("loads panel settings with defaults", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'locale = "en-US"\ntheme = "dark"\nui_font_size = "large"\nconfig_path = "/tmp/custom.toml"\ntray_icon = true\ndisplay_open_mode = "active-display"\nlast_display_id = 2\nskills_project_root = "/workspace/demo"\nskills_extra_dirs = ["/tmp/skills-a", "/tmp/skills-b"]\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.locale).toBe("en-US");
    expect(loaded.theme).toBe("dark");
    expect(loaded.ui_font_size).toBe("large");
    expect(loaded.config_path).toBe("/tmp/custom.toml");
    expect(loaded.display_open_mode).toBe("active-display");
    expect(loaded.close_behavior).toBe("keep-in-tray");
    expect(loaded.terminal_app).toBe("system-terminal");
    expect(loaded.backup_local_path).toBe("~/.kimi/.panel/backups");
    expect(loaded.backup_frequency).toBe("daily");
    expect(loaded.backup_retention_count).toBe(10);
    expect(loaded.backup_strategy).toBe("manual");
    expect(loaded.backup_destination_type).toBe("local");
    expect(loaded.shortcuts["window.toggle"].accelerator).toBe("CommandOrControl+Shift+K");
    expect(loaded.shortcuts["app.save"].scope).toBe("window");
    expect(loaded.last_display_id).toBe(2);
  });

  it("loads supported non-English panel locales", async () => {
    for (const locale of ["zh-TW", "ja-JP", "de-DE", "es-ES"] as const) {
      const files = createMemoryFs({
        "/tmp/config.panel.toml": `locale = "${locale}"\n`,
      });
      const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
      expect(loaded.locale).toBe(locale);
    }
  });

  it("clamps invalid backup settings to safe defaults", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'config_path = "/tmp/custom.toml"\nui_font_size = "huge"\nbackup_frequency = "monthly"\nbackup_retention_count = 0\nbackup_enabled = true\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.ui_font_size).toBe("standard");
    expect(loaded.backup_local_path).toBe("~/.kimi/.panel/backups");
    expect(loaded.backup_frequency).toBe("daily");
    expect(loaded.backup_retention_count).toBe(1);
    expect(loaded.backup_strategy).toBe("scheduled");
  });

  it("falls back to system terminal for invalid terminal app values", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'terminal_app = "warp"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.terminal_app).toBe("system-terminal");
  });

  it("loads explicit webdav backup settings", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'backup_destination_type = "webdav"\nbackup_strategy = "on-change"\nbackup_webdav_url = "https://dav.example.com/root"\nbackup_webdav_username = "alice"\nbackup_webdav_password = "secret"\nbackup_webdav_path = "kimi/backups"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.backup_destination_type).toBe("webdav");
    expect(loaded.backup_strategy).toBe("on-change");
    expect(loaded.backup_webdav_url).toBe("https://dav.example.com/root");
    expect(loaded.backup_webdav_username).toBe("alice");
    expect(loaded.backup_webdav_password).toBe("secret");
    expect(loaded.backup_webdav_path).toBe("kimi/backups");
  });

  it("round-trips panel MCP enabled flags without creating nested extra blocks", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": `version = 1
config_path = "/tmp/config.toml"

[mcp_servers.context7]
enabled = false
transport = "streamable-http"
url = "https://mcp.context7.com/mcp"

  [mcp_servers.context7.headers]
  CONTEXT7_API_KEY = "ctx-test"

  [mcp_servers.context7.extra]
  oauth_audience = "ctx"
`,
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.mcp_servers.context7.enabled).toBe(false);
    expect(loaded.mcp_servers.context7.extra).toEqual({ oauth_audience: "ctx" });
    const document = buildPanelSettingsDocument(loaded);
    expect(document).toContain("[mcp_servers.context7]");
    expect(document).toContain("enabled = false");
    expect(document).toContain("[mcp_servers.context7.extra]");
    expect(document).not.toContain("[mcp_servers.context7.extra.extra]");
  });

  it("writes panel MCP nested tables without leading indentation", () => {
    const state = createState();
    state.panelSettings.mcp_servers = {
      context7: {
        enabled: true,
        transport: "streamable-http",
        url: "https://mcp.context7.com/mcp",
        headers: { CONTEXT7_API_KEY: "ctx-test" },
        command: "",
        args: [],
        env: {},
      },
    };
    const document = buildPanelSettingsDocument(state.panelSettings);
    expect(document).toContain("[mcp_servers.context7.headers]");
    expect(document).toContain('CONTEXT7_API_KEY = "ctx-test"');
    expect(document).toContain('[shortcuts."window.toggle"]');
    expect(document).not.toContain("  [mcp_servers.context7.headers]");
  });

  it("parses shortcut tables from panel settings documents", () => {
    const panelSettings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml");
    panelSettings.shortcuts["window.toggle"].accelerator = "Command+Shift+H";
    panelSettings.shortcuts["window.toggle"].enabled = true;
    const parsed = parsePanelSettingsDocument(buildPanelSettingsDocument(panelSettings), panelSettings);
    expect(parsed.shortcuts["window.toggle"].accelerator).toBe("Command+Shift+H");
    expect(parsed.shortcuts["window.toggle"].enabled).toBe(true);
  });

  it("round-trips sidebar collapsed preference in panel settings", () => {
    const panelSettings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml");
    panelSettings.sidebar_collapsed = true;
    const document = buildPanelSettingsDocument(panelSettings);
    const parsed = parsePanelSettingsDocument(document);
    expect(document).toContain("sidebar_collapsed = true");
    expect(parsed.sidebar_collapsed).toBe(true);
  });

  it("forces quit behavior when tray icon is disabled", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'tray_icon = false\nclose_behavior = "keep-in-tray"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.tray_icon).toBe(false);
    expect(loaded.close_behavior).toBe("quit");
  });

  it("falls back to remember-last display mode for invalid panel setting", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'display_open_mode = "nearest"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.display_open_mode).toBe("remember-last");
  });

  it("saves app state into four files", async () => {
    const state = createState();
    const files = createMemoryFs({});
    await saveAppState(files, state);
    expect(files.store["/tmp/config.toml"]).toContain("default_model");
    expect(files.store["/tmp/config.profiles.toml"]).toContain("active_profile");
    expect(files.store["/tmp/config.panel.toml"]).toContain("follow_config_profiles");
    expect(files.store["/tmp/mcp.json"]).toContain('"mcpServers"');
  });

  it("rejects saving when config and profiles paths match", async () => {
    const state = createState();
    state.profilesPath = state.configPath;
    await expect(saveAppState(createMemoryFs({}), state)).rejects.toThrow(/must be different/);
  });

  it("falls back to bootstrap profile when profiles file is missing", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(
        createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      ),
    });
    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
    });
    expect(loaded.profiles.default).toBeDefined();
  });

  it("migrates legacy panel settings when the new panel settings file is absent", async () => {
    const files = createMemoryFs({
      "~/.kimi/config.toml": 'default_model = "kimi/k2"\n',
      "~/.kimi/config.profiles.toml": 'version = 1\nactive_profile = "default"\n',
      "~/.kimi/config.panel.toml": 'locale = "en-US"\ntheme = "dark"\n',
    });
    const loaded = await loadAppState(files);
    expect(loaded.panelSettingsPath).toBe("~/.kimi/.panel/config.panel.toml");
    expect(loaded.panelSettings.locale).toBe("en-US");
    expect(loaded.panelSettings.theme).toBe("dark");
    expect(files.ensured).toContain("~/.kimi/.panel");
    expect(files.store["~/.kimi/.panel/config.panel.toml"]).toContain('locale = "en-US"');
  });

  it("throws when panel settings file read fails for reasons other than missing content", async () => {
    const files = createMemoryFs({});
    files.readText = async () => { throw new Error("EACCES"); };
    await expect(loadPanelSettings(files, "/tmp/config.panel.toml")).rejects.toThrow(/Failed to read panel settings/);
  });

  it("throws when config TOML is invalid instead of treating it as empty", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": "default_model = ",
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
      "/tmp/mcp.json": buildMcpConfigDocument(createState().mcpConfig),
    });
    await expect(loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    })).rejects.toThrow(/Invalid main config TOML/);
  });

  it("throws when MCP config is invalid instead of silently dropping servers", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
      "/tmp/mcp.json": "{invalid-json}",
    });
    await expect(loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    })).rejects.toThrow(/Invalid MCP config/);
  });

  it("falls back to first profile when active profile is invalid", async () => {
    const state = createState();
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(state),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
      "/tmp/config.profiles.toml":
        'version = 1\nactive_profile = "missing"\n\n[profiles.default]\nlabel = "Default"\ndefault_model = "kimi_gateway/kimi-k2.5"\ndefault_thinking = true\ndefault_yolo = false\ndefault_plan_mode = false\ndefault_editor = ""\ntheme = "dark"\nshow_thinking_stream = false\nmerge_all_available_skills = false\n',
    });
    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
    });
    expect(loaded.activeProfile).toBe("default");
  });

  it("normalizes empty paths before save", () => {
    const state = createState();
    state.profilesPath = "";
    state.panelSettingsPath = "";
    const normalized = normalizeStatePaths(state);
    expect(normalized.profilesPath).toBe("/tmp/config.profiles.toml");
    expect(normalized.panelSettingsPath).toBe("~/.kimi/.panel/config.panel.toml");
    expect(normalized.mcpConfigPath).toBe("/tmp/mcp.json");
  });

  it("saves with derived profile path when explicit path is blank", async () => {
    const state = createState();
    state.profilesPath = "";
    const files = createMemoryFs({});
    await saveAppState(files, state);
    expect(files.store["/tmp/config.profiles.toml"]).toContain("active_profile");
  });

  it("rejects unknown model provider on upsert", () => {
    const state = createState();
    expect(() =>
      upsertModel(state, "missing/gpt", { provider: "missing", model: "gpt", max_context_size: 1, capabilities: [] }),
    ).toThrow(/Provider not found/);
  });

  it("rejects duplicate and missing profile clone requests", () => {
    const state = createState();
    expect(() => cloneProfile(state, "missing", "target", "Target")).toThrow(/Profile not found/);
    expect(() => cloneProfile(state, "default", "default", "Default")).toThrow(/already exists/);
  });

  describe("PROVIDER_TEMPLATES", () => {
    it("has at least one template", () => {
      expect(PROVIDER_TEMPLATES.length).toBeGreaterThanOrEqual(1);
    });

    it("every template has required fields", () => {
      for (const template of PROVIDER_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.type).toBeTruthy();
        expect(template.base_url).toBeTruthy();
        expect(template.default_models.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("every template has unique id", () => {
      const ids = PROVIDER_TEMPLATES.map((tpl) => tpl.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every default model has valid capabilities", () => {
      for (const template of PROVIDER_TEMPLATES) {
        for (const model of template.default_models) {
          expect(model.model).toBeTruthy();
          expect(model.max_context_size).toBeGreaterThan(0);
          expect(model.capabilities.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe("applyTemplate", () => {
    it("creates provider and all default models from template", () => {
      const state = createState();
      const template = PROVIDER_TEMPLATES.find((tpl) => tpl.id === "openai")!;
      applyTemplate(state, "openai", "my-openai", "sk-test-key");
      expect(state.mainConfig.providers["my-openai"]).toEqual({
        type: template.type,
        base_url: template.base_url,
        api_key: "sk-test-key",
      });
      for (const modelDef of template.default_models) {
        const modelKey = `my-openai/${modelDef.model}`;
        expect(state.mainConfig.models[modelKey]).toBeDefined();
        expect(state.mainConfig.models[modelKey].provider).toBe("my-openai");
        expect(state.mainConfig.models[modelKey].model).toBe(modelDef.model);
        expect(state.mainConfig.models[modelKey].max_context_size).toBe(modelDef.max_context_size);
        expect(state.mainConfig.models[modelKey].capabilities).toEqual(modelDef.capabilities);
      }
    });

    it("throws for unknown template id", () => {
      const state = createState();
      expect(() => applyTemplate(state, "nonexistent", "prov", "key")).toThrow(/Template not found/);
    });

    it("throws when provider name already exists", () => {
      const state = createState();
      expect(() => applyTemplate(state, "openai", "kimi_gateway", "key")).toThrow(/Provider already exists/);
    });
  });

  describe("compareProfiles", () => {
    it("reports identical profiles as all same", () => {
      const state = createState();
      const profile = state.profiles.default;
      const diff = compareProfiles(profile, profile);
      expect(diff.differences.every((d) => d.isSame)).toBe(true);
    });

    it("reports all differences when profiles differ completely", () => {
      const state = createState();
      const a = state.profiles.default;
      const b: typeof a = {
        ...a,
        name: "other",
        label: "Other",
        default_model: "kimi_gateway/kimi-k2.5",
        default_thinking: false,
        default_yolo: true,
        default_plan_mode: true,
        default_editor: "vim",
        theme: "light",
        show_thinking_stream: true,
        merge_all_available_skills: true,
      };
      const diff = compareProfiles(a, b);
      expect(diff.differences.filter((d) => !d.isSame).length).toBeGreaterThan(0);
    });

    it("reports partial differences correctly", () => {
      const state = createState();
      const a = state.profiles.default;
      const b = { ...a, label: "Changed", default_thinking: false, theme: "light" };
      const diff = compareProfiles(a, b);
      const changed = diff.differences.filter((d) => !d.isSame);
      expect(changed.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("copyProfileField", () => {
    it("copies a field from source to target profile", () => {
      const state = createState();
      upsertProfile(state, {
        name: "source",
        label: "Source",
        default_model: "kimi_gateway/kimi-k2.5",
        default_thinking: false,
        default_yolo: true,
        default_plan_mode: false,
        default_editor: "",
        theme: "light",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      });
      copyProfileField(state, "default", "source", "theme");
      expect(state.profiles.source.theme).toBe("dark");
    });

    it("throws when source profile is missing", () => {
      const state = createState();
      expect(() => copyProfileField(state, "missing", "default", "theme")).toThrow(/Profile not found: missing/);
    });

    it("throws when target profile is missing", () => {
      const state = createState();
      expect(() => copyProfileField(state, "default", "missing", "theme")).toThrow(/Profile not found: missing/);
    });
  });

  describe("batchUpdateProviderApiKey", () => {
    it("updates api_key for multiple providers", () => {
      const state = createState();
      upsertProvider(state, "second", { type: "openai", base_url: "https://second.test/v1", api_key: "old" });
      batchUpdateProviderApiKey(state, ["kimi_gateway", "second"], "new-key");
      expect(state.mainConfig.providers.kimi_gateway.api_key).toBe("new-key");
      expect(state.mainConfig.providers.second.api_key).toBe("new-key");
    });

    it("is a no-op for empty names", () => {
      const state = createState();
      const before = state.mainConfig.providers.kimi_gateway.api_key;
      batchUpdateProviderApiKey(state, [], "irrelevant");
      expect(state.mainConfig.providers.kimi_gateway.api_key).toBe(before);
    });

    it("skips non-existent provider names without error", () => {
      const state = createState();
      batchUpdateProviderApiKey(state, ["missing"], "key");
      expect(state.mainConfig.providers.kimi_gateway.api_key).toBe("sk-test");
    });
  });

  describe("batchToggleMcpServers", () => {
    it("disables multiple servers", () => {
      const state = createState();
      batchToggleMcpServers(state, ["context7", "chrome_devtools"], false);
      expect(state.mcpConfig.mcpServers.context7.enabled).toBe(false);
      expect(state.mcpConfig.mcpServers.chrome_devtools.enabled).toBe(false);
    });

    it("enables servers", () => {
      const state = createState();
      state.mcpConfig.mcpServers.context7.enabled = false;
      batchToggleMcpServers(state, ["context7"], true);
      expect(state.mcpConfig.mcpServers.context7.enabled).toBe(true);
    });
  });

  describe("batchDeleteProviders", () => {
    it("deletes providers and their dependent models", () => {
      const state = createState();
      upsertProvider(state, "extra", { type: "openai", base_url: "https://extra.test/v1", api_key: "sk-extra" });
      upsertModel(state, "extra/gpt", { provider: "extra", model: "gpt", max_context_size: 128000, capabilities: [] });
      batchDeleteProviders(state, ["extra"]);
      expect(state.mainConfig.providers.extra).toBeUndefined();
      expect(state.mainConfig.models["extra/gpt"]).toBeUndefined();
    });

    it("is a no-op for empty names", () => {
      const state = createState();
      batchDeleteProviders(state, []);
      expect(state.mainConfig.providers.kimi_gateway).toBeDefined();
    });
  });
});

function createMemoryFs(initial: Record<string, string>) {
  const store = { ...initial };
  const ensured: string[] = [];
  return {
    store,
    ensured,
    async readText(path: string): Promise<string | null> {
      return store[path] ?? null;
    },
    async writeText(path: string, content: string): Promise<void> {
      store[path] = content;
    },
    async ensureDir(path: string): Promise<void> {
      ensured.push(path);
    },
  };
}

describe("exportConfig", () => {
  it("redacts API keys in exported providers", () => {
    const state = createState();
    const bundle = exportConfig(state);
    expect(bundle.version).toBe(1);
    expect(bundle.source).toBe("kimi-code-switch-gui");
    expect(bundle.exportedAt).toBeTruthy();
    expect(bundle.providers.kimi_gateway.api_key).toBe("[REDACTED]");
    expect(bundle.providers.kimi_gateway.type).toBe("kimi");
  });

  it("includes models, profiles, and mcpServers", () => {
    const state = createState();
    const bundle = exportConfig(state);
    expect(bundle.models["kimi_gateway/kimi-k2.5"]).toBeTruthy();
    expect(bundle.profiles.default).toBeTruthy();
    expect(bundle.mcpServers.context7).toBeTruthy();
  });
});

describe("validateImportData", () => {
  it("rejects non-object data", () => {
    const result = validateImportData("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects data without version", () => {
    const result = validateImportData({ providers: {} });
    expect(result.valid).toBe(false);
  });

  it("rejects data without any data fields", () => {
    const result = validateImportData({ version: 1 });
    expect(result.valid).toBe(false);
  });

  it("accepts valid data with providers", () => {
    const result = validateImportData({ version: 1, providers: {} });
    expect(result.valid).toBe(true);
  });
});

describe("getImportPreview", () => {
  it("classifies existing items as conflicts", () => {
    const state = createState();
    const data = exportConfig(state);
    const preview = getImportPreview(state, data);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    expect(preview.conflicts.some((c) => c.name === "kimi_gateway" && c.type === "provider")).toBe(true);
  });

  it("classifies new items correctly", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { new_prov: { type: "openai", base_url: "https://x", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const preview = getImportPreview(state, data);
    expect(preview.newItems.length).toBe(1);
    expect(preview.conflicts.length).toBe(0);
  });
});

describe("importConfig", () => {
  it("skip strategy does not overwrite existing", () => {
    const state = createState();
    const data = exportConfig(state);
    const next = importConfig(state, data, "skip");
    expect(next.mainConfig.providers.kimi_gateway.type).toBe("kimi");
  });

  it("overwrite strategy replaces existing", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { kimi_gateway: { type: "anthropic", base_url: "https://r", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const next = importConfig(state, data, "overwrite");
    expect(next.mainConfig.providers.kimi_gateway.type).toBe("anthropic");
  });

  it("rename strategy appends -imported", () => {
    const state = createState();
    const data = exportConfig(state);
    const next = importConfig(state, data, "rename");
    expect(next.mainConfig.providers["kimi_gateway-imported"]).toBeTruthy();
    expect(next.mainConfig.providers.kimi_gateway).toBeTruthy();
  });

  it("adds new items regardless of strategy", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { brand_new: { type: "openai", base_url: "https://n", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const next = importConfig(state, data, "skip");
    expect(next.mainConfig.providers.brand_new).toBeTruthy();
  });

  it("does not mutate original state", () => {
    const state = createState();
    const origCount = Object.keys(state.mainConfig.providers).length;
    const data = { version: 1, exportedAt: "", source: "t", providers: { extra: { type: "openai", base_url: "https://e", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    importConfig(state, data, "skip");
    expect(Object.keys(state.mainConfig.providers).length).toBe(origCount);
  });
});

describe("saveCustomTemplate", () => {
  it("adds template to panelSettings.customTemplates", () => {
    const state = createState();
    const template = { id: "my-tpl", name: "My Template", description: "desc", type: "openai_legacy" as const, base_url: "http://localhost", default_models: [] };
    saveCustomTemplate(state, template);
    expect(state.panelSettings.customTemplates).toHaveLength(1);
    expect(state.panelSettings.customTemplates![0].id).toBe("my-tpl");
  });

  it("overwrites template with same id", () => {
    const state = createState();
    const template1 = { id: "tpl-1", name: "V1", description: "", type: "openai_legacy" as const, base_url: "http://a", default_models: [] };
    const template2 = { id: "tpl-1", name: "V2", description: "", type: "openai_legacy" as const, base_url: "http://b", default_models: [] };
    saveCustomTemplate(state, template1);
    saveCustomTemplate(state, template2);
    expect(state.panelSettings.customTemplates).toHaveLength(1);
    expect(state.panelSettings.customTemplates![0].name).toBe("V2");
  });

  it("initializes customTemplates if undefined", () => {
    const state = createState();
    state.panelSettings.customTemplates = undefined;
    const template = { id: "x", name: "X", description: "", type: "gemini" as const, base_url: "", default_models: [] };
    saveCustomTemplate(state, template);
    expect(state.panelSettings.customTemplates).toHaveLength(1);
  });
});

describe("deleteCustomTemplate", () => {
  it("removes template by id", () => {
    const state = createState();
    const template = { id: "del-me", name: "Del", description: "", type: "openai_legacy" as const, base_url: "", default_models: [] };
    saveCustomTemplate(state, template);
    deleteCustomTemplate(state, "del-me");
    expect(state.panelSettings.customTemplates).toHaveLength(0);
  });

  it("is no-op for non-existent id", () => {
    const state = createState();
    saveCustomTemplate(state, { id: "keep", name: "Keep", description: "", type: "openai_legacy" as const, base_url: "", default_models: [] });
    deleteCustomTemplate(state, "no-such-id");
    expect(state.panelSettings.customTemplates).toHaveLength(1);
  });

  it("is no-op when customTemplates is undefined", () => {
    const state = createState();
    state.panelSettings.customTemplates = undefined;
    deleteCustomTemplate(state, "any");
    expect(state.panelSettings.customTemplates).toBeUndefined();
  });
});

describe("toggleFavorite", () => {
  it("adds name to favorites", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    expect(state.panelSettings.favorites?.providers).toContain("kimi_gateway");
  });

  it("removes existing favorite", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    toggleFavorite(state, "provider", "kimi_gateway");
    expect(state.panelSettings.favorites?.providers).not.toContain("kimi_gateway");
  });

  it("initializes favorites if undefined", () => {
    const state = createState();
    state.panelSettings.favorites = undefined;
    toggleFavorite(state, "profile", "default");
    expect(state.panelSettings.favorites?.profiles).toContain("default");
  });

  it("handles provider and profile independently", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    toggleFavorite(state, "profile", "default");
    expect(state.panelSettings.favorites?.providers).toContain("kimi_gateway");
    expect(state.panelSettings.favorites?.profiles).toContain("default");
  });
});

describe("searchConfig", () => {
  it("finds providers by name", () => {
    const state = createState();
    const results = searchConfig(state, "kimi");
    expect(results.some((r) => r.type === "provider" && r.name === "kimi_gateway")).toBe(true);
  });

  it("finds models by ID", () => {
    const state = createState();
    const results = searchConfig(state, "k2.5");
    expect(results.some((r) => r.type === "model" && r.name === "kimi_gateway/kimi-k2.5")).toBe(true);
  });

  it("finds profiles by name", () => {
    const state = createState();
    const results = searchConfig(state, "default");
    expect(results.some((r) => r.type === "profile")).toBe(true);
  });

  it("finds MCP servers by name", () => {
    const state = createState();
    const results = searchConfig(state, "context7");
    expect(results.some((r) => r.type === "mcp" && r.name === "context7")).toBe(true);
  });

  it("returns empty for empty query", () => {
    const state = createState();
    expect(searchConfig(state, "")).toEqual([]);
    expect(searchConfig(state, "   ")).toEqual([]);
  });

  it("is case-insensitive", () => {
    const state = createState();
    const upper = searchConfig(state, "KIMI");
    const lower = searchConfig(state, "kimi");
    expect(upper.length).toBe(lower.length);
  });

  it("returns empty for no match", () => {
    const state = createState();
    expect(searchConfig(state, "zzz_nonexistent")).toEqual([]);
  });
});
