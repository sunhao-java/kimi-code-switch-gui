// 在终端打开 kimi（移植自 main/modules/terminal.ts）。仅 macOS。
// AppleScript 字符串构建为纯逻辑；open/osascript 走 Rust exec_command，脚本写入走 write_executable。
import { invoke } from "@tauri-apps/api/core";

import {
  applyProfile,
  buildConfigDocument,
  cloneState,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PANEL_DIRECTORY,
} from "@shared/configStore";
import type { OpenKimiTerminalRequest, PanelSettings, TerminalApp } from "@shared/types";

import { tauriFileAccess } from "./fileAccess";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(program: string, args: string[]): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { program, args, timeoutMs: null });
}

function resolveHome(p: string): string {
  // 仅用于拼接展示路径；真实解析在 Rust 端。这里把 ~/ 留给 Rust。
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
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function sanitizeProfileFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-") || "profile";
}

function buildKimiShellCommand(workingDirectory: string, configPath: string): string {
  // PATH 由 Rust exec 注入，这里不再 export PATH。
  return `cd ${quoteForShell(workingDirectory)}; kimi --config-file ${quoteForShell(configPath)}`;
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

async function writeProfileConfig(request: OpenKimiTerminalRequest, profileName: string): Promise<string> {
  if (!request.state) throw new Error("Profile launch requires the current app state.");
  if (!request.state.profiles[profileName]) throw new Error(`Profile not found: ${profileName}`);
  const draft = cloneState(request.state);
  applyProfile(draft, profileName);
  const doc = buildConfigDocument(draft);
  const tempDir = `${DEFAULT_PANEL_DIRECTORY}/tmp/terminal`;
  const configPath = `${tempDir}/config-${sanitizeProfileFileSegment(profileName)}.toml`;
  await tauriFileAccess.ensureDir(tempDir);
  await tauriFileAccess.writeText(configPath, doc);
  return configPath;
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

  const configPathRaw = settings.config_path.trim() || DEFAULT_CONFIG_PATH;
  const workingDirectory = dirname(resolveHome(configPathRaw));
  const configPath = targetProfileName
    ? await writeProfileConfig(request as OpenKimiTerminalRequest, targetProfileName)
    : configPathRaw;
  const shellCommand = buildKimiShellCommand(workingDirectory, configPath);

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
