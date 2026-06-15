// 在终端打开 kimi（移植自 main/modules/terminal.ts）。仅 macOS。
// AppleScript 字符串构建为纯逻辑；open/osascript 走 Rust exec_command，脚本写入走 write_executable。
import { invoke } from "@tauri-apps/api/core";

import {
  applyProfile,
  cloneState,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PANEL_DIRECTORY,
  getActiveKimiCodeEnvironment,
} from "@shared/configStore";
import type { OpenKimiTerminalRequest, PanelSettings, TerminalApp } from "@shared/types";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(program: string, args: string[]): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { program, args, timeoutMs: null });
}

function resolveHome(p: string): string {
  return p;
}

function dirname(p: string): string {
  const i = p.replace(/\/+$/, "").lastIndexOf("/");
  return i <= 0 ? p : p.slice(0, i);
}

const TERMINAL_APP_NAMES: Record<TerminalApp, string> = { "system-terminal": "Terminal", iterm2: "iTerm" };
const TERMINAL_APP_LABELS: Record<TerminalApp, string> = { "system-terminal": "Terminal.app", iterm2: "iTerm2" };

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function quotePathForShell(value: string): string {
  if (value === "~") {
    return "$HOME";
  }
  if (value.startsWith("~/")) {
    return `$HOME/${quoteForShell(value.slice(2))}`;
  }
  return quoteForShell(value);
}
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function buildKimiShellCommand(workingDirectory: string, homePath: string, args: string[] = []): string {
  // PATH 由 Rust exec 注入，这里不再 export PATH。
  const kimiArgs = args.length ? ` ${args.map(quoteForShell).join(" ")}` : "";
  return `export KIMI_CODE_HOME=${quotePathForShell(homePath)}; cd ${quotePathForShell(workingDirectory)}; kimi${kimiArgs}`;
}

function buildAppleScriptLines(app: TerminalApp, shellCommand: string, scriptPath?: string): string[] {
  const escaped = escapeForAppleScript(shellCommand);
  if (app === "system-terminal") {
    return ['tell application "Terminal"', "activate", `do script "${escaped}"`, "end tell"];
  }
  const textToWrite = scriptPath ? `source ${escapeForAppleScript(scriptPath)}` : escaped;
  return [
    'tell application "iTerm"', "activate",
    "if (count of windows) = 0 then", "create window with default profile",
    "else", "tell current window", "create tab with default profile", "end tell", "end if",
    "tell current session of current window", `write text "${textToWrite}"`, "end tell", "end tell",
  ];
}

function appleScriptArgs(lines: string[]): string[] {
  return lines.flatMap((line) => ["-e", line]);
}

function buildProfileKimiArgs(request: OpenKimiTerminalRequest, profileName: string): string[] {
  if (!request.state) throw new Error("Profile launch requires the current app state.");
  if (!request.state.profiles[profileName]) throw new Error(`Profile not found: ${profileName}`);
  const draft = cloneState(request.state);
  applyProfile(draft, profileName);
  const args: string[] = [];
  if (draft.mainConfig.default_model.trim()) {
    args.push("-m", draft.mainConfig.default_model.trim());
  }
  if (draft.mainConfig.default_yolo) {
    args.push("--yolo");
  }
  if (draft.mainConfig.default_plan_mode) {
    args.push("--plan");
  }
  return args;
}

export async function openKimiInTerminal(
  request: Pick<PanelSettings, "config_path" | "terminal_app"> | OpenKimiTerminalRequest,
): Promise<{ ok: true }> {
  const settings = "settings" in request ? request.settings : request;
  const targetProfileName = "settings" in request ? request.profileName?.trim() : "";
  const appName = TERMINAL_APP_NAMES[settings.terminal_app];
  const appLabel = TERMINAL_APP_LABELS[settings.terminal_app];

  const probe = await exec("open", ["-Ra", appName]);
  if (probe.code !== 0) throw new Error(`Configured terminal app is not installed: ${appLabel}`);

  const activeEnvironment = getActiveKimiCodeEnvironment(settings);
  const workingDirectory = activeEnvironment.homePath.trim() || dirname(resolveHome(settings.config_path.trim() || DEFAULT_CONFIG_PATH));
  const kimiArgs = targetProfileName ? buildProfileKimiArgs(request as OpenKimiTerminalRequest, targetProfileName) : [];
  const shellCommand = buildKimiShellCommand(workingDirectory, workingDirectory, kimiArgs);

  let scriptPath: string | undefined;
  if (settings.terminal_app === "iterm2") {
    scriptPath = `${DEFAULT_PANEL_DIRECTORY}/tmp/terminal/kimi-launch.sh`;
    await invoke("write_executable", { path: scriptPath, content: `#!/bin/sh\n${shellCommand}\n` });
  }

  const lines = buildAppleScriptLines(settings.terminal_app, shellCommand, scriptPath);
  const r = await exec("osascript", appleScriptArgs(lines));
  if (r.code !== 0) throw new Error(`Failed to launch terminal app: ${r.stderr}`);
  return { ok: true };
}

export async function openSessionTerminal(sessionId: string, terminalApp: TerminalApp): Promise<{ ok: true }> {
  const cmd = `kimi -r ${sessionId}`;
  const escaped = escapeForAppleScript(cmd);
  const lines = terminalApp === "iterm2"
    ? ['tell application "iTerm"', "activate", "tell current window", "create tab with default profile",
       "tell current session", `write text "${escaped}"`, "end tell", "end tell", "end tell"]
    : ['tell application "Terminal"', "activate", `do script "${escaped}"`, "end tell"];
  const r = await exec("osascript", appleScriptArgs(lines));
  if (r.code !== 0) throw new Error(r.stderr || "failed to open session terminal");
  return { ok: true };
}
