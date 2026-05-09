import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  applyProfile,
  buildConfigDocument,
  cloneState,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PANEL_DIRECTORY,
} from "@shared/configStore";
import type { OpenKimiTerminalRequest, PanelSettings, TerminalApp } from "@shared/types";
import { getCliEnv } from "./cli";
import { fileAccess, resolveHome } from "./fileAccess";

const execFileAsync = promisify(execFile);

export type ExecFileRunner = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

const TERMINAL_APP_NAMES: Record<TerminalApp, string> = {
  "system-terminal": "Terminal",
  iterm2: "iTerm",
};

const TERMINAL_APP_LABELS: Record<TerminalApp, string> = {
  "system-terminal": "Terminal.app",
  iterm2: "iTerm2",
};

function defaultExecFileRunner(
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean },
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(file, args, options);
}

export function getTerminalAppName(app: TerminalApp): string {
  return TERMINAL_APP_NAMES[app];
}

export function getTerminalAppLabel(app: TerminalApp): string {
  return TERMINAL_APP_LABELS[app];
}

export function getTerminalWorkingDirectory(settings: Pick<PanelSettings, "config_path">): string {
  const configPath = settings.config_path.trim() || DEFAULT_CONFIG_PATH;
  return dirname(resolveHome(configPath));
}

export function getTerminalConfigPath(settings: Pick<PanelSettings, "config_path">): string {
  return resolveHome(settings.config_path.trim() || DEFAULT_CONFIG_PATH);
}

function sanitizeProfileFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-") || "profile";
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildKimiShellCommand(
  envPath: string,
  workingDirectory: string,
  configPath: string,
): string {
  return `export PATH=${quoteForShell(envPath)}; cd ${quoteForShell(workingDirectory)}; kimi --config-file ${quoteForShell(configPath)}`;
}

export function buildAppleScriptLines(app: TerminalApp, shellCommand: string): string[] {
  const escapedCommand = escapeForAppleScript(shellCommand);
  if (app === "system-terminal") {
    return [
      "set previousClipboard to the clipboard",
      `set the clipboard to "${escapedCommand}"`,
      'tell application "Terminal"',
      "activate",
      "if (count of windows) = 0 then",
      `do script "${escapedCommand}"`,
      "else",
      'tell application "System Events" to keystroke "t" using command down',
      "delay 0.35",
      'tell application "System Events" to keystroke "v" using command down',
      'tell application "System Events" to key code 36',
      "end if",
      "end tell",
      "delay 0.2",
      "set the clipboard to previousClipboard",
    ];
  }
  return [
    "set previousClipboard to the clipboard",
    `set the clipboard to "${escapedCommand}"`,
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
  ];
}

function buildAppleScriptArgs(lines: string[]): string[] {
  return lines.flatMap((line) => ["-e", line]);
}

function formatExecError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function openKimiInTerminal(
  request: Pick<PanelSettings, "config_path" | "terminal_app"> | OpenKimiTerminalRequest,
  options?: {
    execFileRunner?: ExecFileRunner;
    getEnv?: () => NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    writeText?: (path: string, content: string) => Promise<void>;
    ensureDir?: (path: string) => Promise<void>;
  },
): Promise<{ ok: true }> {
  if ((options?.platform ?? process.platform) !== "darwin") {
    throw new Error("Open in terminal is only supported on macOS.");
  }

  const settings = "settings" in request ? request.settings : request;
  const targetProfileName = "settings" in request ? request.profileName?.trim() : "";
  const appName = getTerminalAppName(settings.terminal_app);
  const appLabel = getTerminalAppLabel(settings.terminal_app);
  const execRunner = options?.execFileRunner ?? defaultExecFileRunner;
  const env = options?.getEnv?.() ?? getCliEnv();

  try {
    await execRunner("open", ["-Ra", appName], { env, windowsHide: true });
  } catch {
    throw new Error(`Configured terminal app is not installed: ${appLabel}`);
  }

  const workingDirectory = getTerminalWorkingDirectory(settings);
  const configPath = targetProfileName
    ? await writeProfileConfigForTerminal(request as OpenKimiTerminalRequest, targetProfileName, options)
    : getTerminalConfigPath(settings);
  const shellCommand = buildKimiShellCommand(env.PATH ?? "", workingDirectory, configPath);
  const appleScript = buildAppleScriptLines(settings.terminal_app, shellCommand);

  try {
    await execRunner("osascript", buildAppleScriptArgs(appleScript), { env, windowsHide: true });
  } catch (error) {
    throw new Error(`Failed to launch terminal app: ${formatExecError(error)}`);
  }

  return { ok: true };
}

async function writeProfileConfigForTerminal(
  request: OpenKimiTerminalRequest,
  profileName: string,
  options?: {
    writeText?: (path: string, content: string) => Promise<void>;
    ensureDir?: (path: string) => Promise<void>;
  },
): Promise<string> {
  if (!request.state) {
    throw new Error("Profile launch requires the current app state.");
  }
  if (!request.state.profiles[profileName]) {
    throw new Error(`Profile not found: ${profileName}`);
  }

  const draft = cloneState(request.state);
  applyProfile(draft, profileName);
  const configDocument = buildConfigDocument(draft);
  const tempDirectory = join(DEFAULT_PANEL_DIRECTORY, "tmp", "terminal");
  const configPath = join(tempDirectory, `config-${sanitizeProfileFileSegment(profileName)}.toml`);
  await (options?.ensureDir ?? fileAccess.ensureDir)(tempDirectory);
  await (options?.writeText ?? fileAccess.writeText)(configPath, configDocument);
  return resolveHome(configPath);
}
