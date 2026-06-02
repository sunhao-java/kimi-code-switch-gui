import {
  bootstrapProfiles,
  createDefaultPanelSettings,
} from "./configStore";
import {
  buildConfigDoctorReport,
  buildManagedDocuments,
  buildRedactedPreviewBundle,
  detectUnknownFields,
  redactAppStateSecrets,
  redactDocumentText,
} from "./configSafety";
import { createDefaultMcpConfig } from "./mcpStore";
import { createDefaultShortcuts } from "./shortcutStore";
import type { AppState } from "./types";

function createState(): AppState {
  const mainConfig = {
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
        base_url: "https://api.example.test/v1?token=provider-token&mode=prod",
        api_key: "sk-provider",
      },
    },
    loop_control: {},
    background: {},
    notifications: {},
    services: {},
    mcp: {},
  };

  const panelSettings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml");
  panelSettings.shortcuts = createDefaultShortcuts();

  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
    mainConfig,
    profiles: bootstrapProfiles(mainConfig),
    activeProfile: "default",
    panelSettings,
    mcpConfig: createDefaultMcpConfig(),
  };
}

describe("configSafety", () => {
  it("builds managed documents from app state", () => {
    const documents = buildManagedDocuments(createState());

    expect(documents.config).toContain('default_model = "kimi_gateway/kimi-k2.5"');
    expect(documents.profiles).toContain("active_profile");
    expect(documents.panel).toContain("backup_strategy");
    expect(documents.mcp).toContain('"mcpServers"');
  });

  it("redacts provider API keys and URL secrets from preview output", () => {
    const preview = buildRedactedPreviewBundle(createState());

    expect(preview.configDocument).toContain('api_key = "[REDACTED]"');
    expect(preview.configDocument).not.toContain("sk-provider");
    expect(preview.configDocument).toContain("token=%5BREDACTED%5D");
    expect(preview.configDocument).toContain("mode=prod");
    expect(preview.redaction.maskedPaths).toContain("mainConfig.providers.kimi_gateway.api_key");
  });

  it("redacts WebDAV password fields from state and panel preview", () => {
    const state = createState();
    state.panelSettings.backup_destination_type = "webdav";
    state.panelSettings.backup_webdav_url = "https://dav.example.com/root";
    state.panelSettings.backup_webdav_username = "alice";
    state.panelSettings.backup_webdav_password = "super-secret";

    const redactedState = redactAppStateSecrets(state);
    const preview = buildRedactedPreviewBundle(state);

    expect(redactedState.state.panelSettings.backup_webdav_password).toBe("[REDACTED]");
    expect(preview.panelSettingsDocument).toContain('backup_webdav_password = "[REDACTED]"');
    expect(preview.panelSettingsDocument).not.toContain("super-secret");
  });

  it("redacts MCP header, env, extra, and raw document secrets", () => {
    const state = createState();
    state.mcpConfig.mcpServers.gateway = {
      enabled: true,
      transport: "streamable-http",
      url: "https://user:pass@example.test/mcp?access_token=mcp-token&view=compact",
      headers: {
        Authorization: "Bearer secret-token",
        "X-Trace": "trace-id",
      },
      command: "",
      args: [],
      env: {},
      extra: {
        nested: {
          secret: "hidden",
          keep: "visible",
        },
      },
    };
    state.mcpConfig.mcpServers.local = {
      enabled: true,
      transport: "stdio",
      url: "",
      headers: {},
      command: "npx",
      args: ["example-mcp"],
      env: {
        API_KEY: "mcp-api-key",
        DEBUG: "1",
      },
      extra: {
        nested: {
          secret: "hidden",
          keep: "visible",
        },
      },
    };

    const preview = buildRedactedPreviewBundle(state);
    const rawDocument = redactDocumentText(`{
  "Authorization": "Bearer raw-token",
  "Cookie": "session=raw-cookie",
  "url": "https://alice:secret@example.test/mcp?api_key=raw-key&view=wide"
}`);

    expect(preview.mcpDocument).not.toContain("secret-token");
    expect(preview.mcpDocument).not.toContain("mcp-api-key");
    expect(preview.mcpDocument).not.toContain("hidden");
    expect(preview.mcpDocument).toContain('"Authorization": "[REDACTED]"');
    expect(preview.mcpDocument).toContain('"API_KEY": "[REDACTED]"');
    expect(preview.mcpDocument).toContain('"secret": "[REDACTED]"');
    expect(preview.mcpDocument).toContain("view=compact");
    expect(preview.mcpDocument).toContain("access_token=%5BREDACTED%5D");
    expect(rawDocument.text).toContain('"Authorization": "[REDACTED]"');
    expect(rawDocument.text).toContain('"Cookie": "[REDACTED]"');
    expect(rawDocument.text).toContain("api_key=%5BREDACTED%5D");
    expect(rawDocument.summary.maskedCount).toBeGreaterThanOrEqual(3);
  });

  it("reports missing references in doctor output", () => {
    const state = createState();
    state.mainConfig.default_model = "missing/default";
    state.mainConfig.models["broken/model"] = {
      provider: "missing-provider",
      model: "broken-model",
      max_context_size: 1024,
      capabilities: [],
    };
    state.profiles.default.default_model = "missing/profile-model";
    state.activeProfile = "missing-profile";

    const report = buildConfigDoctorReport(state);
    const fieldPaths = report.issues.map((issue) => issue.fieldPath);

    expect(report.ok).toBe(false);
    expect(fieldPaths).toContain("mainConfig.default_model");
    expect(fieldPaths).toContain("mainConfig.models.broken/model.provider");
    expect(fieldPaths).toContain("profiles.default.default_model");
    expect(fieldPaths).toContain("activeProfile");
  });

  it("surfaces shortcut conflicts as doctor warnings", () => {
    const state = createState();
    state.panelSettings.shortcuts["tab.overview"] = {
      ...state.panelSettings.shortcuts["tab.overview"],
      accelerator: "CommandOrControl+S",
    };

    const report = buildConfigDoctorReport(state);
    const conflictIssue = report.issues.find((issue) => issue.scope === "shortcuts");

    expect(conflictIssue?.severity).toBe("warning");
    expect(conflictIssue?.message).toContain("commandorcontrol+s");
  });

  it("validates WebDAV readiness and protocol requirements", () => {
    const state = createState();
    state.panelSettings.backup_destination_type = "webdav";
    state.panelSettings.backup_webdav_url = "http://dav.example.com/root";
    state.panelSettings.backup_webdav_username = "";
    state.panelSettings.backup_webdav_password = "";
    state.panelSettings.backup_webdav_path = "kimi\\backups";

    const report = buildConfigDoctorReport(state);
    const issueIds = report.issues.map((issue) => issue.id);

    expect(issueIds).toContain("webdav.username.missing");
    expect(issueIds).toContain("webdav.password.missing");
    expect(issueIds).toContain("webdav.url.protocol");
    expect(issueIds).toContain("webdav.path.invalid");
  });

  describe("detectUnknownFields (config drift)", () => {
    it("returns no drift when every field is known", () => {
      const drift = detectUnknownFields({
        config: {
          default_model: "kimi_gateway/kimi-k2.5",
          theme: "dark",
          models: { "kimi_gateway/kimi-k2.5": { provider: "kimi_gateway", model: "kimi-k2.5", max_context_size: 1024, capabilities: [] } },
          providers: { kimi_gateway: { type: "kimi", base_url: "https://api.example.test", api_key: "sk-x" } },
          loop_control: { anything: { goes: true } },
        },
        profiles: {
          active_profile: "default",
          profiles: { default: { name: "default", label: "Default", default_model: "kimi_gateway/kimi-k2.5", theme: "dark" } },
        },
        mcp: { mcpServers: { gateway: { enabled: true, transport: "stdio", command: "npx", args: [] } } },
      });

      expect(drift).toEqual([]);
    });

    it("detects unknown top-level fields per file", () => {
      const drift = detectUnknownFields({
        config: {
          default_model: "a",
          future_feature_flag: true,
          another_new_top_key: "x",
        },
      });

      const keys = drift.map((entry) => entry.key);
      expect(keys).toContain("future_feature_flag");
      expect(keys).toContain("another_new_top_key");
      expect(keys).not.toContain("default_model");
      expect(drift.every((entry) => entry.file === "config")).toBe(true);
      expect(drift.every((entry) => entry.path === "(root)")).toBe(true);
    });

    it("detects unknown nested fields inside known maps", () => {
      const drift = detectUnknownFields({
        config: {
          providers: {
            kimi_gateway: { type: "kimi", base_url: "https://x", api_key: "sk", region: "us-east" },
          },
          models: {
            "kimi_gateway/k2": { provider: "kimi_gateway", model: "k2", max_context_size: 1, capabilities: [], beta_flag: true },
          },
        },
      });

      const providerDrift = drift.find((entry) => entry.key === "region");
      const modelDrift = drift.find((entry) => entry.key === "beta_flag");
      expect(providerDrift?.path).toBe("providers.kimi_gateway");
      expect(modelDrift?.path).toBe("models.kimi_gateway/k2");
    });

    it("detects unknown profile fields under the profiles map", () => {
      const drift = detectUnknownFields({
        profiles: {
          active_profile: "default",
          profiles: {
            default: { name: "default", label: "Default", default_model: "m", experimental_voice: true },
          },
        },
      });

      const entry = drift.find((item) => item.key === "experimental_voice");
      expect(entry?.file).toBe("profiles");
      expect(entry?.path).toBe("profiles.default");
    });

    it("treats free-form record fields and MCP server bodies as open (no false positives)", () => {
      const drift = detectUnknownFields({
        config: {
          background: { whatever: { deeply: { nested: 1 } } },
          notifications: { brand_new_channel: true },
        },
        mcp: {
          mcpServers: {
            gateway: { enabled: true, transport: "stdio", command: "x", args: [], unknown_server_opt: 1 },
          },
        },
      });

      expect(drift).toEqual([]);
    });

    it("aggregates drift across multiple files", () => {
      const drift = detectUnknownFields({
        config: { surprise_key: 1 },
        profiles: { active_profile: "default", profiles: {}, stray_profiles_key: true },
      });

      const files = new Set(drift.map((entry) => entry.file));
      expect(files.has("config")).toBe(true);
      expect(files.has("profiles")).toBe(true);
    });

    it("ignores null, undefined, and non-object raw documents", () => {
      const drift = detectUnknownFields({
        config: null,
        profiles: undefined,
        mcp: "not-an-object" as unknown,
      });

      expect(drift).toEqual([]);
    });

    it("surfaces drift through buildConfigDoctorReport when raw docs are provided", () => {
      const state = createState();
      const report = buildConfigDoctorReport(state, {
        config: { default_model: "kimi_gateway/kimi-k2.5", unknown_cli_field: true },
      });

      expect(report.drift?.some((entry) => entry.key === "unknown_cli_field")).toBe(true);
    });

    it("keeps drift empty and backward compatible when raw docs are omitted", () => {
      const report = buildConfigDoctorReport(createState());
      expect(report.drift).toEqual([]);
    });
  });
});
