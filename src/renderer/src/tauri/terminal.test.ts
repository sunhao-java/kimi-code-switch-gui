import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelSettings, TerminalApp } from "@shared/types";

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
    expect(script).toContain("kimi --config-file");
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
    expect(writeCall.content).toContain("kimi --config-file");

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
