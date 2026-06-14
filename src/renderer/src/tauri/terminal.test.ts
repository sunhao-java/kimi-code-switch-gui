import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState, PanelSettings, TerminalApp } from "@shared/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { openKimiInTerminal, openSessionTerminal } from "./terminal";

const mockedInvoke = vi.mocked(invoke);

function exec(code: number, stdout = "", stderr = ""): { code: number; stdout: string; stderr: string } {
  return { code, stdout, stderr };
}

function settings(terminalApp: TerminalApp, configPath = "~/.kimi/config.toml"): Pick<PanelSettings, "config_path" | "terminal_app"> {
  return { terminal_app: terminalApp, config_path: configPath };
}

function appState(): AppState {
  return {
    configTarget: "kimi-code",
    configPath: "~/.kimi-code/config.toml",
    profilesPath: "",
    panelSettingsPath: "~/.kimi-code/.panel/config.panel.toml",
    mcpConfigPath: "~/.kimi-code/mcp.json",
    mainConfig: {
      default_model: "base/model",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "alt/model": { model: "raw-model", provider: "provider", context_size: 1000, max_tokens: 1000 },
      },
      providers: {
        provider: { type: "openai_legacy", base_url: "https://example.com/v1", api_key: "key" },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: {
      work: {
        name: "work",
        label: "Work",
        default_model: "alt/model",
        default_thinking: true,
        default_yolo: true,
        default_plan_mode: true,
        default_editor: "",
        theme: "dark",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
    },
    activeProfile: "work",
    panelSettings: {
      version: 1,
      config_path: "~/.kimi-code/config.toml",
      profiles: {},
      active_profile: "work",
      profiles_path: "",
      follow_config_profiles: true,
      theme: "dark",
      appearance_theme: "aurora",
      ui_font_size: "medium",
      locale: "zh-CN",
      tray_icon: false,
      sidebar_collapsed: false,
      display_open_mode: "default",
      close_behavior: "quit",
      terminal_app: "system-terminal",
      backup_strategy: "manual",
      backup_frequency: "daily",
      backup_retention_count: 10,
      backup_destination_type: "local",
      backup_local_path: "",
      backup_webdav_url: "",
      backup_webdav_username: "",
      backup_webdav_password: "",
      backup_webdav_path: "",
      shortcuts: {},
      mcp_servers: {},
    },
    mcpConfig: { mcpServers: {} },
  };
}

/** Returns the osascript invocation's -e lines joined for substring assertions. */
function osascriptLines(): string {
  const call = mockedInvoke.mock.calls.find(
    (c) => c[0] === "exec_command" && (c[1] as { program: string }).program === "osascript",
  );
  if (!call) throw new Error("no osascript exec");
  return ((call[1] as { args: string[] }).args).join("\n");
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("openKimiInTerminal (no profile)", () => {
  it("probes the app, then launches Terminal.app via 'do script' with the kimi command", async () => {
    mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = (args ?? {}) as { program?: string };
      if (cmd === "exec_command" && a.program === "open") return exec(0) as never;
      if (cmd === "exec_command" && a.program === "osascript") return exec(0) as never;
      return undefined as never;
    });

    await expect(openKimiInTerminal(settings("system-terminal"))).resolves.toEqual({ ok: true });

    // app availability probe
    expect(mockedInvoke).toHaveBeenCalledWith("exec_command", expect.objectContaining({
      program: "open",
      args: ["-Ra", "Terminal"],
    }));
    const script = osascriptLines();
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain("do script");
    expect(script).toContain("kimi");
    expect(script).not.toContain("--config-file");
    expect(script).toContain("cd $HOME/");
    // working directory is the config file's parent dir
    expect(script).toContain("cd ");
  });

  it("throws a friendly error when the terminal app is not installed", async () => {
    mockedInvoke.mockResolvedValue(exec(1) as unknown as never); // open -Ra fails
    await expect(openKimiInTerminal(settings("iterm2"))).rejects.toThrow(/not installed: iTerm2/);
  });

  it("writes an executable launch script and uses iTerm tabs for iterm2", async () => {
    mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = (args ?? {}) as { program?: string };
      if (cmd === "exec_command" && a.program === "open") return exec(0) as never;
      if (cmd === "write_executable") return undefined as never;
      if (cmd === "exec_command" && a.program === "osascript") return exec(0) as never;
      return undefined as never;
    });

    await openKimiInTerminal(settings("iterm2"));

    const writeCall = mockedInvoke.mock.calls.find((c) => c[0] === "write_executable")![1] as {
      path: string;
      content: string;
    };
    expect(writeCall.path).toContain("kimi-launch.sh");
    expect(writeCall.content.startsWith("#!/bin/sh")).toBe(true);
    expect(writeCall.content).toContain("kimi");
    expect(writeCall.content).not.toContain("--config-file");
    expect(writeCall.content).toContain("cd $HOME/");

    const script = osascriptLines();
    expect(script).toContain('tell application "iTerm"');
    expect(script).toContain("create tab with default profile");
    expect(script).toContain("source"); // sources the launch script
  });

  it("throws when osascript launch fails", async () => {
    mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = (args ?? {}) as { program?: string };
      if (cmd === "exec_command" && a.program === "open") return exec(0) as never;
      return exec(1, "", "applescript error") as never;
    });
    await expect(openKimiInTerminal(settings("system-terminal"))).rejects.toThrow(/Failed to launch terminal/);
  });

  it("maps profile launch to supported Kimi Code CLI flags", async () => {
    mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = (args ?? {}) as { program?: string };
      if (cmd === "exec_command" && a.program === "open") return exec(0) as never;
      if (cmd === "exec_command" && a.program === "osascript") return exec(0) as never;
      return undefined as never;
    });

    const state = appState();
    await openKimiInTerminal({
      settings: state.panelSettings,
      state,
      profileName: "work",
    });

    const script = osascriptLines();
    expect(script).toContain("kimi");
    expect(script).toContain("-m");
    expect(script).toContain("alt/model");
    expect(script).toContain("--yolo");
    expect(script).toContain("--plan");
    expect(script).not.toContain("--config-file");
  });
});

describe("openSessionTerminal", () => {
  it("runs 'kimi -r <session>' in Terminal.app", async () => {
    mockedInvoke.mockResolvedValue(exec(0) as unknown as never);
    await expect(openSessionTerminal("sess-123", "system-terminal")).resolves.toEqual({ ok: true });
    const script = osascriptLines();
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain("kimi -r sess-123");
  });

  it("runs the session command in an iTerm tab", async () => {
    mockedInvoke.mockResolvedValue(exec(0) as unknown as never);
    await openSessionTerminal("sess-9", "iterm2");
    const script = osascriptLines();
    expect(script).toContain('tell application "iTerm"');
    expect(script).toContain("create tab with default profile");
    expect(script).toContain("kimi -r sess-9");
  });

  it("throws when the session terminal fails to open", async () => {
    mockedInvoke.mockResolvedValue(exec(1, "", "nope") as unknown as never);
    await expect(openSessionTerminal("s", "system-terminal")).rejects.toThrow(/nope/);
  });
});
