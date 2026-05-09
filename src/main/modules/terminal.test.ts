import { describe, expect, it, vi } from "vitest";

import { bootstrapProfiles, createDefaultPanelSettings } from "@shared/configStore";
import type { AppState } from "@shared/types";
import {
  buildAppleScriptLines,
  buildKimiShellCommand,
  getTerminalConfigPath,
  getTerminalWorkingDirectory,
  openKimiInTerminal,
} from "./terminal";

describe("terminal module", () => {
  const createState = (): AppState => {
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
          max_context_size: 128000,
          capabilities: [],
        },
        "ark/kimi-k2.6": {
          provider: "ark",
          model: "kimi-k2.6",
          max_context_size: 128000,
          capabilities: [],
        },
      },
      providers: {
        kimi_gateway: {
          type: "kimi",
          base_url: "https://api.moonshot.cn/v1",
          api_key: "test",
        },
        ark: {
          type: "openai_responses",
          base_url: "https://ark.example.com",
          api_key: "test",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    };
    return {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
      mainConfig,
      profiles: {
        ...bootstrapProfiles(mainConfig),
        ark: {
          name: "ark",
          label: "Ark",
          default_model: "ark/kimi-k2.6",
          default_thinking: false,
          default_yolo: true,
          default_plan_mode: true,
          default_editor: "",
          theme: "light",
          show_thinking_stream: true,
          merge_all_available_skills: true,
        },
      },
      activeProfile: "default",
      panelSettings: createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      mcpConfig: { mcpServers: {} },
    };
  };

  it("builds a shell command that exports PATH and runs kimi", () => {
    const command = buildKimiShellCommand(
      "/opt/homebrew/bin:/usr/local/bin",
      "/Users/test/.kimi",
      "/Users/test/.kimi/config.toml",
    );

    expect(command).toBe(
      "export PATH='/opt/homebrew/bin:/usr/local/bin'; cd '/Users/test/.kimi'; kimi --config-file '/Users/test/.kimi/config.toml'",
    );
  });

  it("builds Terminal.app AppleScript", () => {
    expect(buildAppleScriptLines("system-terminal", "cd '/tmp'; kimi")).toEqual([
      "set previousClipboard to the clipboard",
      `set the clipboard to "cd '/tmp'; kimi"`,
      'tell application "Terminal"',
      "activate",
      "if (count of windows) = 0 then",
      `do script "cd '/tmp'; kimi"`,
      "else",
      'tell application "System Events" to keystroke "t" using command down',
      "delay 0.35",
      'tell application "System Events" to keystroke "v" using command down',
      'tell application "System Events" to key code 36',
      "end if",
      "end tell",
      "delay 0.2",
      "set the clipboard to previousClipboard",
    ]);
  });

  it("builds iTerm2 AppleScript", () => {
    expect(buildAppleScriptLines("iterm2", "cd '/tmp'; kimi")).toEqual([
      "set previousClipboard to the clipboard",
      `set the clipboard to "cd '/tmp'; kimi"`,
      'tell application "iTerm"',
      "activate",
      "if (count of windows) = 0 then",
      "create window with default profile",
      "else",
      "tell current window",
      "create tab with default profile",
      "end tell",
      "end if",
      "end tell",
      "delay 0.35",
      'tell application "System Events" to keystroke "v" using command down',
      'tell application "System Events" to key code 36',
      "delay 0.2",
      "set the clipboard to previousClipboard",
    ]);
  });

  it("derives the working directory from the config path", () => {
    expect(getTerminalWorkingDirectory({ config_path: "~/.kimi/config.toml" })).toContain("/.kimi");
  });

  it("resolves the config path passed to kimi", () => {
    expect(getTerminalConfigPath({ config_path: "~/.kimi/custom-config.toml" })).toContain("/.kimi/custom-config.toml");
  });

  it("fails clearly when the configured terminal app is missing", async () => {
    const execFileRunner = vi.fn().mockRejectedValueOnce(new Error("not installed"));

    await expect(openKimiInTerminal(
      { config_path: "~/.kimi/config.toml", terminal_app: "iterm2" },
      { execFileRunner, getEnv: () => ({ PATH: "/usr/bin" }), platform: "darwin" },
    )).rejects.toThrow("Configured terminal app is not installed: iTerm2");
  });

  it("launches the configured terminal app through osascript", async () => {
    const execFileRunner = vi.fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    await expect(openKimiInTerminal(
      { config_path: "~/.kimi/config.toml", terminal_app: "system-terminal" },
      { execFileRunner, getEnv: () => ({ PATH: "/usr/bin:/opt/homebrew/bin" }), platform: "darwin" },
    )).resolves.toEqual({ ok: true });

    expect(execFileRunner).toHaveBeenNthCalledWith(
      1,
      "open",
      ["-Ra", "Terminal"],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(execFileRunner).toHaveBeenNthCalledWith(
      2,
      "osascript",
      expect.arrayContaining(["-e", 'tell application "Terminal"']),
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it("passes the configured config path to kimi when launching", async () => {
    const execFileRunner = vi.fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    await openKimiInTerminal(
      { config_path: "~/workspace/kimi/custom.toml", terminal_app: "system-terminal" },
      { execFileRunner, getEnv: () => ({ PATH: "/usr/bin:/opt/homebrew/bin" }), platform: "darwin" },
    );

    const secondCallArgs = execFileRunner.mock.calls[1]?.[1] as string[];
    expect(secondCallArgs.join(" ")).toContain("kimi --config-file ");
    expect(secondCallArgs.join(" ")).toContain("custom.toml");
  });

  it("writes a profile-specific temporary config before launching", async () => {
    const execFileRunner = vi.fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const writes: Array<{ path: string; content: string }> = [];

    await openKimiInTerminal(
      {
        settings: { ...createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"), terminal_app: "system-terminal" },
        state: createState(),
        profileName: "ark",
      },
      {
        execFileRunner,
        getEnv: () => ({ PATH: "/usr/bin:/opt/homebrew/bin" }),
        platform: "darwin",
        ensureDir: vi.fn(),
        writeText: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toContain("tmp/terminal/config-ark.toml");
    expect(writes[0].content).toContain('default_model = "ark/kimi-k2.6"');
    expect(writes[0].content).toContain("default_yolo = true");

    const secondCallArgs = execFileRunner.mock.calls[1]?.[1] as string[];
    expect(secondCallArgs.join(" ")).toContain("config-ark.toml");
  });
});
