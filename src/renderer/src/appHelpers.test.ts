import type { AppState, Locale } from "@shared/types";
import {
  collectDirtyKeys,
  createUniqueName,
  getApi,
  getMcpAction,
  getMcpActionNotice,
  getResourceLabel,
  isEqualValue,
  isDraftEntry,
  renameModelInState,
  renameProviderInState,
  updateModelReferences,
} from "./appHelpers";

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
        "provider-a/model-b": {
          provider: "provider-a",
          model: "model-b",
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
        default_model: "provider-a/model-a",
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
        default_model: "provider-a/model-b",
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

describe("getApi", () => {
  it("returns window.kimiSwitch when it exists", () => {
    const mockApi = { loadState: vi.fn() } as unknown as typeof window.kimiSwitch;
    vi.stubGlobal("kimiSwitch", mockApi);
    Object.defineProperty(window, "kimiSwitch", { value: mockApi, writable: true, configurable: true });

    expect(getApi()).toBe(mockApi);

    vi.unstubAllGlobals();
  });

  it("returns undefined when window.kimiSwitch is not set", () => {
    Object.defineProperty(window, "kimiSwitch", { value: undefined, writable: true, configurable: true });

    expect(getApi()).toBeUndefined();
  });
});

describe("getMcpAction", () => {
  it("returns testMcpServer function for action 'test'", () => {
    const fn = vi.fn();
    const api = { testMcpServer: fn } as unknown as ReturnType<typeof getApi>;
    expect(getMcpAction(api, "test")).toBe(fn);
  });

  it("returns authMcpServer function for action 'auth'", () => {
    const fn = vi.fn();
    const api = { authMcpServer: fn } as unknown as ReturnType<typeof getApi>;
    expect(getMcpAction(api, "auth")).toBe(fn);
  });

  it("returns resetMcpServerAuth function for action 'reset-auth'", () => {
    const fn = vi.fn();
    const api = { resetMcpServerAuth: fn } as unknown as ReturnType<typeof getApi>;
    expect(getMcpAction(api, "reset-auth")).toBe(fn);
  });

  it("returns null when api is undefined", () => {
    expect(getMcpAction(undefined, "test")).toBeNull();
    expect(getMcpAction(undefined, "auth")).toBeNull();
    expect(getMcpAction(undefined, "reset-auth")).toBeNull();
  });

  it("returns null when api does not have the required function", () => {
    const api = {} as unknown as ReturnType<typeof getApi>;
    expect(getMcpAction(api, "test")).toBeNull();
    expect(getMcpAction(api, "auth")).toBeNull();
    expect(getMcpAction(api, "reset-auth")).toBeNull();
  });
});

describe("getMcpActionNotice", () => {
  it("returns test success message for zh-CN", () => {
    expect(getMcpActionNotice("zh-CN", "test")).toBe("MCP 测试已完成。");
  });

  it("returns auth started message for en-US", () => {
    expect(getMcpActionNotice("en-US", "auth")).toBe("MCP authorization started.");
  });

  it("returns reset success message for ja-JP", () => {
    expect(getMcpActionNotice("ja-JP", "reset-auth")).toBe("MCP 認可をリセットしました。");
  });

  it("returns test message for de-DE", () => {
    expect(getMcpActionNotice("de-DE", "test")).toBe("MCP-Test abgeschlossen.");
  });

  it("returns auth message for es-ES", () => {
    expect(getMcpActionNotice("es-ES", "auth")).toBe("Autorización MCP iniciada.");
  });
});

describe("isEqualValue", () => {
  it("returns true for equal primitives", () => {
    expect(isEqualValue(1, 1)).toBe(true);
    expect(isEqualValue("a", "a")).toBe(true);
    expect(isEqualValue(true, true)).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(isEqualValue(1, 2)).toBe(false);
    expect(isEqualValue("a", "b")).toBe(false);
    expect(isEqualValue(true, false)).toBe(false);
  });

  it("returns true for deeply equal objects", () => {
    expect(isEqualValue({ a: 1, b: [2] }, { a: 1, b: [2] })).toBe(true);
  });

  it("returns false for objects with different structure", () => {
    expect(isEqualValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(isEqualValue({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("returns true for null === null", () => {
    expect(isEqualValue(null, null)).toBe(true);
  });

  it("returns true for undefined coerced to null (both undefined)", () => {
    // JSON.stringify(undefined) returns undefined which gets coerced
    expect(isEqualValue(undefined, undefined)).toBe(true);
  });

  it("returns true for equal arrays", () => {
    expect(isEqualValue([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("returns false for arrays with different lengths", () => {
    expect(isEqualValue([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe("collectDirtyKeys", () => {
  it("returns keys for newly added entries", () => {
    const current = { a: 1, b: 2 };
    const saved = { a: 1 };
    const dirty = collectDirtyKeys(current, saved);
    expect(dirty).toEqual(new Set(["b"]));
  });

  it("returns keys for deleted entries", () => {
    const current = { a: 1 };
    const saved = { a: 1, b: 2 };
    const dirty = collectDirtyKeys(current, saved);
    expect(dirty).toEqual(new Set(["b"]));
  });

  it("returns keys for modified entries", () => {
    const current = { a: 1, b: 3 };
    const saved = { a: 1, b: 2 };
    const dirty = collectDirtyKeys(current, saved);
    expect(dirty).toEqual(new Set(["b"]));
  });

  it("returns empty set when nothing changed", () => {
    const current = { a: 1, b: 2 };
    const saved = { a: 1, b: 2 };
    const dirty = collectDirtyKeys(current, saved);
    expect(dirty.size).toBe(0);
  });

  it("returns all keys when both records are completely different", () => {
    const current = { a: 1 };
    const saved = { b: 2 };
    const dirty = collectDirtyKeys(current, saved);
    expect(dirty).toEqual(new Set(["a", "b"]));
  });

  it("returns empty set for two empty records", () => {
    const dirty = collectDirtyKeys({}, {});
    expect(dirty.size).toBe(0);
  });

  it("treats missing values as null when comparing", () => {
    const current = { a: undefined as unknown };
    const saved = { };
    const dirty = collectDirtyKeys(current as Record<string, unknown>, saved as Record<string, unknown>);
    // current["a"] is undefined which becomes null via ??, saved["a"] is undefined which becomes null via ??
    // JSON.stringify(null) === JSON.stringify(null), so they are equal
    expect(dirty.size).toBe(0);
  });
});

describe("isDraftEntry", () => {
  it("returns true for a name not in saved entries", () => {
    expect(isDraftEntry({ a: 1 }, "b")).toBe(true);
  });

  it("returns false for a name present in saved entries", () => {
    expect(isDraftEntry({ a: 1 }, "a")).toBe(false);
  });

  it("returns false for an empty name", () => {
    expect(isDraftEntry({ a: 1 }, "")).toBe(false);
  });

  it("returns false for a falsy name", () => {
    expect(isDraftEntry({ a: 1 }, "")).toBe(false);
  });

  it("returns true when savedEntries is undefined", () => {
    expect(isDraftEntry(undefined, "anything")).toBe(true);
  });

  it("returns true when savedEntries is undefined and name is non-empty", () => {
    expect(isDraftEntry(undefined, "new-entry")).toBe(true);
  });
});

describe("createUniqueName", () => {
  it("returns normalized base name when it is unique", () => {
    expect(createUniqueName("foo", ["bar", "baz"])).toBe("foo");
  });

  it("appends -2 when base name already exists", () => {
    expect(createUniqueName("foo", ["foo", "bar"])).toBe("foo-2");
  });

  it("increments suffix until a unique name is found", () => {
    expect(createUniqueName("foo", ["foo", "foo-2", "foo-3"])).toBe("foo-4");
  });

  it("trims whitespace from base name", () => {
    expect(createUniqueName("  foo  ", ["bar"])).toBe("foo");
  });

  it("returns 'item' as fallback when base name normalizes to empty", () => {
    expect(createUniqueName("   ", ["bar"])).toBe("item");
  });

  it("returns 'item-2' when 'item' already exists and base is empty", () => {
    expect(createUniqueName("   ", ["item"])).toBe("item-2");
  });

  it("handles base name with whitespace trimming collision", () => {
    expect(createUniqueName(" foo ", ["foo"])).toBe("foo-2");
  });
});

describe("updateModelReferences", () => {
  it("updates default_model in mainConfig and profiles when name changes", () => {
    const state = createState();
    updateModelReferences(state, "provider-a/model-a", "provider-a/model-x");

    expect(state.mainConfig.default_model).toBe("provider-a/model-x");
    expect(state.profiles.default.default_model).toBe("provider-a/model-x");
  });

  it("does nothing when currentName === nextName", () => {
    const state = createState();
    const originalMain = state.mainConfig.default_model;
    const originalProfile = state.profiles.default.default_model;

    updateModelReferences(state, "provider-a/model-a", "provider-a/model-a");

    expect(state.mainConfig.default_model).toBe(originalMain);
    expect(state.profiles.default.default_model).toBe(originalProfile);
  });

  it("only updates profiles that reference the old model name", () => {
    const state = createState();
    updateModelReferences(state, "provider-a/model-a", "provider-a/model-x");

    // work profile uses provider-a/model-b, should not be changed
    expect(state.profiles.work.default_model).toBe("provider-a/model-b");
    // default profile uses provider-a/model-a, should be changed
    expect(state.profiles.default.default_model).toBe("provider-a/model-x");
  });
});

describe("renameModelInState", () => {
  it("renames a model and updates references", () => {
    const state = createState();
    const result = renameModelInState(state, "provider-a/model-a", {
      provider: "provider-a",
      model: "model-x",
      max_context_size: 2,
      capabilities: ["thinking"],
    });

    expect(result).toBe("provider-a/model-x");
    expect(state.mainConfig.models["provider-a/model-x"]).toBeDefined();
    expect(state.mainConfig.models["provider-a/model-a"]).toBeUndefined();
    expect(state.mainConfig.default_model).toBe("provider-a/model-x");
  });

  it("throws when renaming to a name that already exists", () => {
    const state = createState();
    expect(() =>
      renameModelInState(state, "provider-a/model-a", {
        provider: "provider-a",
        model: "model-b",
        max_context_size: 1,
        capabilities: [],
      }),
    ).toThrow("Model already exists: provider-a/model-b");
  });

  it("allows renaming to the same name (no-op on references)", () => {
    const state = createState();
    const result = renameModelInState(state, "provider-a/model-a", {
      provider: "provider-a",
      model: "model-a",
      max_context_size: 1,
      capabilities: [],
    });

    expect(result).toBe("provider-a/model-a");
    expect(state.mainConfig.default_model).toBe("provider-a/model-a");
  });
});

describe("renameProviderInState", () => {
  it("renames provider and cascades to dependent models", () => {
    const state = createState();
    const result = renameProviderInState(state, "provider-a", "provider-c", {
      type: "kimi",
      base_url: "https://c.test",
      api_key: "sk-c",
    });

    expect(result).toBe("provider-c");
    expect(state.mainConfig.providers["provider-c"]).toBeDefined();
    expect(state.mainConfig.providers["provider-a"]).toBeUndefined();

    // Models should be renamed: provider-a/model-a -> provider-c/model-a
    expect(state.mainConfig.models["provider-c/model-a"]).toBeDefined();
    expect(state.mainConfig.models["provider-c/model-b"]).toBeDefined();
    expect(state.mainConfig.models["provider-a/model-a"]).toBeUndefined();
    expect(state.mainConfig.models["provider-a/model-b"]).toBeUndefined();

    // References should be updated
    expect(state.mainConfig.default_model).toBe("provider-c/model-a");
    expect(state.profiles.default.default_model).toBe("provider-c/model-a");
  });

  it("allows renaming to same name", () => {
    const state = createState();
    const result = renameProviderInState(state, "provider-a", "provider-a", {
      type: "kimi",
      base_url: "https://a.test",
      api_key: "sk-a",
    });

    expect(result).toBe("provider-a");
    expect(state.mainConfig.providers["provider-a"]).toBeDefined();
  });

  it("throws when renaming to an existing provider name", () => {
    const state = createState();
    expect(() =>
      renameProviderInState(state, "provider-a", "provider-b", {
        type: "kimi",
        base_url: "https://b.test",
        api_key: "sk-b",
      }),
    ).toThrow("Provider already exists: provider-b");
  });

  it("throws when dependent models collide with existing non-dependent models", () => {
    const state = createState();
    // Add a model with provider-b that would collide
    state.mainConfig.models["provider-b/model-a"] = {
      provider: "provider-b",
      model: "model-a",
      max_context_size: 1,
      capabilities: [],
    };

    expect(() =>
      renameProviderInState(state, "provider-a", "provider-b", {
        type: "kimi",
        base_url: "https://b.test",
        api_key: "sk-b",
      }),
    ).toThrow("Provider already exists: provider-b");
  });
});

describe("getResourceLabel", () => {
  const locales: Locale[] = ["zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE", "es-ES"];
  const resources = ["provider", "model", "profile", "mcp"] as const;

  const expected: Record<Locale, Record<string, string>> = {
    "zh-CN": { provider: "提供方", model: "模型", profile: "Profile", mcp: "MCP" },
    "zh-TW": { provider: "提供者", model: "模型", profile: "Profile", mcp: "MCP" },
    "en-US": { provider: "provider", model: "model", profile: "profile", mcp: "MCP" },
    "ja-JP": { provider: "プロバイダー", model: "モデル", profile: "Profile", mcp: "MCP" },
    "de-DE": { provider: "Provider", model: "Modell", profile: "Profil", mcp: "MCP" },
    "es-ES": { provider: "proveedor", model: "modelo", profile: "perfil", mcp: "MCP" },
  };

  for (const locale of locales) {
    for (const resource of resources) {
      it(`returns "${expected[locale][resource]}" for locale="${locale}" resource="${resource}"`, () => {
        expect(getResourceLabel(locale, resource)).toBe(expected[locale][resource]);
      });
    }
  }
});
