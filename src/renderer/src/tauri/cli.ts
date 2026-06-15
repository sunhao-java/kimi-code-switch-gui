// CLI / MCP / 连通性测试前端适配（移植自 main/modules/cli.ts）。
// 进程执行走 Rust exec_command，网络走 Rust http_request（绕过 CORS）。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";
import type { AppState, ConfigTarget, KimiCodeInstallSource, McpServerConfig, ModelConfig, ProfileConnectivityTestResult, ProviderConfig } from "@shared/types";
import * as officialAccounts from "./officialAccounts";
import { recordStartupTiming, startupTimingNow } from "../startupTiming";

const KIMI_CODE_HOMEBREW_URL = "https://formulae.brew.sh/api/formula/kimi-code.json";
const KIMI_CODE_GITHUB_LATEST_URL = "https://api.github.com/repos/MoonshotAI/kimi-code/releases/latest";
const KIMI_CODE_INSTALL_SCRIPT_SH = "https://code.kimi.com/kimi-code/install.sh";
const KIMI_CODE_INSTALL_SCRIPT_URL = "https://code.kimi.com/kimi-code/install.ps1";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const LATEST_VERSION_TIMEOUT_MS = 3500;

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
  headers?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpToolListResult {
  ok: true;
  tools: McpToolInfo[];
  raw: string;
  stderr?: string;
}

export interface McpToolCallResult {
  ok: true;
  toolName: string;
  result: unknown;
  raw: string;
  stderr?: string;
}

interface McpStdioRpcRequest {
  id?: number;
  method: string;
  params?: unknown;
}

interface McpStdioSessionResponse {
  responses: unknown[];
  stderr: string;
}

function exec(program: string, args: string[], timeoutMs?: number): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { program, args, timeoutMs: timeoutMs ?? null });
}

function http(method: string, url: string, headers?: Record<string, string>, body?: string): Promise<HttpResponse> {
  return invoke<HttpResponse>("http_request", { method, url, headers: headers ?? null, body: body ?? null });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

function mcpStdioSession(
  program: string,
  args: string[],
  env: Record<string, string>,
  requests: McpStdioRpcRequest[],
  timeoutMs = 30000,
): Promise<McpStdioSessionResponse> {
  return invoke<McpStdioSessionResponse>("run_mcp_stdio_session", {
    program,
    args,
    env,
    requests,
    timeoutMs,
  });
}

function extractSemver(value: string | undefined): string {
  const match = value?.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : normalizeReleaseVersion(value ?? "");
}

export function classifyKimiTargetFromSignals(signals: {
  executablePath?: string;
  resolvedPath?: string;
  versionOutput?: string;
  candidates?: string[];
}): { target: ConfigTarget; status: KimiTargetDetectionStatus; reason: string; installSource: KimiCodeInstallSource } {
  const joinedPaths = [
    signals.executablePath,
    signals.resolvedPath,
    ...(signals.candidates ?? []),
  ].filter(Boolean).join("\n").toLowerCase();
  const output = (signals.versionOutput ?? "").toLowerCase();

  // Homebrew 路径判定优先：/opt/homebrew/ 或 /usr/local/Homebrew/ 或 Linuxbrew
  if (/\/(opt\/homebrew|usr\/local\/homebrew|home\/linuxbrew)/i.test(joinedPaths)) {
    return { target: "kimi-code", status: "detected", reason: "homebrew-path-detected", installSource: "homebrew" };
  }

  if (joinedPaths.includes(".kimi-code/bin")) {
    return { target: "kimi-code", status: "detected", reason: "official-script-path-detected", installSource: "official-script" };
  }

  if (joinedPaths.includes("@moonshot-ai/kimi-code") || joinedPaths.includes("/node_modules/") || joinedPaths.includes("\\node_modules\\")) {
    const installSource: KimiCodeInstallSource = joinedPaths.includes("pnpm") ? "pnpm" : "npm";
    return { target: "kimi-code", status: "detected", reason: "node-package-path-detected", installSource };
  }

  // 路径或输出中包含 kimi-code 特征
  if (joinedPaths.includes("kimi-code") || /kimi[-\s]?code|@moonshot-ai\/kimi-code/.test(output)) {
    return { target: "kimi-code", status: "detected", reason: "matched-kimi-code-signal", installSource: "unknown" };
  }

  return { target: "kimi-code", status: "not-installed", reason: "kimi-code-not-found", installSource: "unknown" };
}

export interface CliVersionResult {
  version: string;
  installed: boolean;
  latestVersion?: string;
  hasUpdate?: boolean;
  target?: ConfigTarget;
  packageName?: string;
  installCommand?: string;
  updateCommand?: string;
  installSource?: KimiCodeInstallSource;
}

export type KimiTargetDetectionStatus = "detected" | "not-installed";

export interface KimiTargetDetectionResult {
  target: ConfigTarget;
  installed: boolean;
  status: KimiTargetDetectionStatus;
  version: string;
  executablePath: string;
  resolvedPath: string;
  candidates: string[];
  reason: string;
  installSource: KimiCodeInstallSource;
}

export interface KimiOAuthLoginEvent {
  kind: "start" | "device-code" | "user-code" | "expires-in" | "output" | "success" | "error" | "complete" | "failed" | "account-required";
  target: ConfigTarget;
  stream?: "stdout" | "stderr";
  line?: string;
  url?: string;
  user_code?: string;
  expires_in?: number;
  message?: string;
}

// GUI 期望的 Kimi Code 版本范围：低于 MIN 判定为过旧（功能可能不兼容）。
// EXPECTED 是当前 GUI 主要对照测试过的版本，仅作展示参考。
export const MIN_CLI_VERSION = "1.0.0";
export const EXPECTED_CLI_VERSION = "0.14.0";

export type CliCompatStatus = "compatible" | "outdated" | "unknown";

// 基于检测到的 CLI 版本产出兼容性状态：
// - 未安装 / 无法解析版本号 → unknown
// - 低于 MIN_CLI_VERSION → outdated
// - 否则 → compatible
export function evaluateCliCompatibility(result: Pick<CliVersionResult, "version" | "installed">): CliCompatStatus {
  if (!result.installed) return "unknown";
  const version = normalizeReleaseVersion(result.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) return "unknown";
  return compareReleaseVersions(version, MIN_CLI_VERSION) < 0 ? "outdated" : "compatible";
}

function currentPlatform(): "windows" | "macos" | "linux" | "unknown" {
  const platform = typeof navigator !== "undefined"
    ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent)
    : "";
  const value = platform.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("linux")) return "linux";
  return "unknown";
}

function versionResultBase(target: ConfigTarget): Pick<CliVersionResult, "target" | "packageName" | "installCommand" | "updateCommand"> {
  const isWindows = currentPlatform() === "windows";
  const installCommand = isWindows
    ? `irm ${KIMI_CODE_INSTALL_SCRIPT_URL} | iex`
    : "brew install kimi-code";
  return {
    target,
    packageName: "Kimi Code",
    installCommand,
    updateCommand: isWindows ? installCommand : "brew upgrade kimi-code",
  };
}

function withInstallSource(result: CliVersionResult, installSource: KimiCodeInstallSource): CliVersionResult {
  return { ...result, installSource };
}

async function detectActiveKimiTargetOnWindows(): Promise<KimiTargetDetectionResult> {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$commands = @(Get-Command kimi -All)",
    "if (-not $commands -or $commands.Count -eq 0) { exit 127 }",
    "$paths = @($commands | ForEach-Object { $_.Source })",
    "$primary = $paths[0]",
    "$version = (& $primary --version) 2>&1 | Out-String",
    "[Console]::Out.Write(($paths -join \"`n\") + \"`n---KIMI_VERSION---`n\" + $version)",
  ].join("; ");
  try {
    const r = await exec("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], 5000);
    if (r.code !== 0) throw new Error(r.stderr || r.stdout);
    const [pathsText, versionOutput = ""] = r.stdout.split("\n---KIMI_VERSION---\n");
    const candidates = pathsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const executablePath = candidates[0] ?? "";
    const classified = classifyKimiTargetFromSignals({ executablePath, resolvedPath: executablePath, versionOutput, candidates });
    return {
      target: "kimi-code",
      installed: classified.status === "detected",
      status: classified.status,
      version: extractSemver(versionOutput),
      executablePath,
      resolvedPath: executablePath,
      candidates,
      reason: classified.reason,
      installSource: classified.installSource,
    };
  } catch {
    return {
      target: "kimi-code",
      installed: false,
      status: "not-installed",
      version: "",
      executablePath: "",
      resolvedPath: "",
      candidates: [],
      reason: "kimi-command-not-found",
      installSource: "unknown",
    };
  }
}

async function detectActiveKimiTargetOnPosix(): Promise<KimiTargetDetectionResult> {
  const script = [
    "set -u",
    "p=\"$(command -v kimi 2>/dev/null || true)\"",
    "[ -n \"$p\" ] || exit 127",
    "resolved=\"$p\"",
    "if command -v python3 >/dev/null 2>&1; then resolved=\"$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' \"$p\" 2>/dev/null || printf '%s' \"$p\")\"; fi",
    "candidates=\"$(command -v -a kimi 2>/dev/null || which -a kimi 2>/dev/null || printf '%s\\n' \"$p\")\"",
    "version=\"$($p --version 2>&1 || true)\"",
    "printf '%s\\n---KIMI_RESOLVED---\\n%s\\n---KIMI_CANDIDATES---\\n%s\\n---KIMI_VERSION---\\n%s\\n' \"$p\" \"$resolved\" \"$candidates\" \"$version\"",
  ].join("; ");
  try {
    const r = await exec("sh", ["-lc", script], 5000);
    if (r.code !== 0) throw new Error(r.stderr || r.stdout);
    const [executablePath = "", rest = ""] = r.stdout.split("\n---KIMI_RESOLVED---\n");
    const [resolvedPath = "", restAfterResolved = ""] = rest.split("\n---KIMI_CANDIDATES---\n");
    const [candidatesText = "", versionOutput = ""] = restAfterResolved.split("\n---KIMI_VERSION---\n");
    const candidates = candidatesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const classified = classifyKimiTargetFromSignals({ executablePath, resolvedPath, versionOutput, candidates });
    return {
      target: "kimi-code",
      installed: classified.status === "detected",
      status: classified.status,
      version: extractSemver(versionOutput),
      executablePath: executablePath.trim(),
      resolvedPath: resolvedPath.trim(),
      candidates,
      reason: classified.reason,
      installSource: classified.installSource,
    };
  } catch {
    return {
      target: "kimi-code",
      installed: false,
      status: "not-installed",
      version: "",
      executablePath: "",
      resolvedPath: "",
      candidates: [],
      reason: "kimi-command-not-found",
      installSource: "unknown",
    };
  }
}

export async function detectActiveKimiTarget(): Promise<KimiTargetDetectionResult> {
  const startedAt = startupTimingNow();
  try {
    return currentPlatform() === "windows"
      ? await detectActiveKimiTargetOnWindows()
      : await detectActiveKimiTargetOnPosix();
  } finally {
    recordStartupTiming("cli.detectActiveKimiTarget", startedAt);
  }
}

async function detectKimiCodeHomebrewVersion(): Promise<CliVersionResult> {
  const startedAt = startupTimingNow();
  const base = versionResultBase("kimi-code");
  try {
    const r = await exec("brew", ["list", "--versions", "kimi-code"], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    const version = extractSemver(r.stdout);
    if (!version) throw new Error("kimi-code Homebrew version not found");
    return withInstallSource({ ...base, version, installed: true }, "homebrew");
  } catch {
    return withInstallSource({ ...base, version: "", installed: false }, "unknown");
  } finally {
    recordStartupTiming("cli.detectKimiCodeHomebrewVersion", startedAt);
  }
}

async function detectKimiCodeScriptVersion(): Promise<CliVersionResult> {
  const startedAt = startupTimingNow();
  const installCommand = `curl -fsSL ${KIMI_CODE_INSTALL_SCRIPT_SH} | bash`;
  const base = {
    ...versionResultBase("kimi-code"),
    installCommand,
    updateCommand: installCommand,
  };
  try {
    const script = 'p="${KIMI_INSTALL_DIR:-$HOME/.kimi-code}/bin/kimi"; [ -x "$p" ] && "$p" --version';
    const r = await exec("sh", ["-lc", script], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    const version = extractSemver(`${r.stdout}\n${r.stderr}`);
    if (!version) throw new Error("kimi-code script install version not found");
    return withInstallSource({ ...base, version, installed: true }, "official-script");
  } catch {
    return withInstallSource({ ...versionResultBase("kimi-code"), version: "", installed: false }, "unknown");
  } finally {
    recordStartupTiming("cli.detectKimiCodeScriptVersion", startedAt);
  }
}

function parseNpmPackageVersion(stdout: string, packageName: string): string {
  try {
    const payload = JSON.parse(stdout) as { dependencies?: Record<string, { version?: string }> };
    return extractSemver(payload.dependencies?.[packageName]?.version);
  } catch {
    return "";
  }
}

async function detectKimiCodeWindowsVersion(): Promise<CliVersionResult> {
  const base = versionResultBase("kimi-code");

  try {
    const script = "$d = if ($env:KIMI_INSTALL_DIR) { $env:KIMI_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.kimi-code' }; $p = Join-Path (Join-Path $d 'bin') 'kimi.exe'; if (Test-Path -LiteralPath $p -PathType Leaf) { & $p --version } else { exit 1 }";
    const r = await exec("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    const version = extractSemver(`${r.stdout}\n${r.stderr}`);
    if (!version) throw new Error("kimi-code Windows install version not found");
    return { ...base, version, installed: true };
  } catch {
    // Continue with npm and identifiable PATH fallbacks.
  }

  try {
    const r = await exec("npm", ["list", "-g", "@moonshot-ai/kimi-code", "--depth=0", "--json"], 5000);
    const version = parseNpmPackageVersion(r.stdout, "@moonshot-ai/kimi-code");
    if (r.code === 0 && version) {
      return withInstallSource({ ...base, version, installed: true }, "npm");
    }
  } catch {
    // Ignore npm lookup failures; official script installs do not require Node.js.
  }

  try {
    const r = await exec("kimi", ["--version"], 3000);
    const output = `${r.stdout}\n${r.stderr}`;
    if (r.code !== 0 || !/kimi[-\s]?code|@moonshot-ai\/kimi-code/i.test(output)) {
      throw new Error("kimi command is not identifiable as Kimi Code");
    }
    return withInstallSource({ ...base, version: extractSemver(output) || output.trim(), installed: true }, "unknown");
  } catch {
    return withInstallSource({ ...base, version: "", installed: false }, "unknown");
  }
}

async function detectKimiCodeVersion(): Promise<CliVersionResult> {
  const startedAt = startupTimingNow();
  if (currentPlatform() === "windows") {
    try {
      return await detectKimiCodeWindowsVersion();
    } finally {
      recordStartupTiming("cli.detectKimiCodeVersion", startedAt);
    }
  }
  try {
    const homebrew = await detectKimiCodeHomebrewVersion();
    if (homebrew.installed) return homebrew;
    const scriptInstall = await detectKimiCodeScriptVersion();
    if (scriptInstall.installed) return scriptInstall;
    const base = versionResultBase("kimi-code");
    try {
      const target = await detectActiveKimiTarget();
      if (!target.installed) throw new Error("kimi-code command not found");
      return withInstallSource({ ...base, version: target.version, installed: true }, target.installSource);
    } catch {
      return withInstallSource({ ...base, version: "", installed: false }, "unknown");
    }
  } finally {
    recordStartupTiming("cli.detectKimiCodeVersion", startedAt);
  }
}

async function getKimiCodeLatestVersion(): Promise<string | null> {
  const platform = currentPlatform();
  const url = platform === "windows" ? KIMI_CODE_GITHUB_LATEST_URL : KIMI_CODE_HOMEBREW_URL;
  const resp = await http("GET", url, { Accept: "application/json", "User-Agent": "kimi-code-switch-gui" });
  if (!resp.ok) return null;
  const payload = JSON.parse(resp.body) as { versions?: { stable?: string }; tag_name?: string };
  const rawVersion = platform === "windows"
    ? payload.tag_name
    : payload.versions?.stable;
  return extractSemver(rawVersion) || null;
}

async function attachLatestVersion(result: CliVersionResult, timeoutMs = LATEST_VERSION_TIMEOUT_MS): Promise<CliVersionResult> {
  const startedAt = startupTimingNow();
  try {
    const latestVersion = await withTimeout(
      getKimiCodeLatestVersion(),
      timeoutMs,
      `Kimi Code latest version request timed out after ${timeoutMs}ms`,
    );
    if (!latestVersion) return result;
    return {
      ...result,
      latestVersion,
      hasUpdate: result.version ? compareReleaseVersions(latestVersion, result.version) > 0 : false,
    };
  } catch {
    return result;
  } finally {
    recordStartupTiming("cli.attachLatestVersion", startedAt);
  }
}

export async function getCliVersion(options: { checkLatest?: boolean; latestTimeoutMs?: number } = {}): Promise<CliVersionResult> {
  return getTargetCliVersion("kimi-code", options);
}

export async function getTargetCliVersion(
  target: ConfigTarget = "kimi-code",
  options: { checkLatest?: boolean; latestTimeoutMs?: number } = {},
): Promise<CliVersionResult> {
  const startedAt = startupTimingNow();
  void target;
  try {
    const result = await detectKimiCodeVersion();
    if (!options.checkLatest) return result;
    return await attachLatestVersion(result, options.latestTimeoutMs);
  } finally {
    recordStartupTiming("cli.getTargetCliVersion", startedAt);
  }
}

export async function upgradeTargetCli(
  target: ConfigTarget = "kimi-code",
  options: { install?: boolean } = {},
): Promise<{ ok: true; stdout: string; stderr: string }> {
  void target;
  const platform = currentPlatform();
  const r = platform === "windows"
    ? await exec("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `irm ${KIMI_CODE_INSTALL_SCRIPT_URL} | iex`], 120000)
    : await exec("brew", [options.install ? "install" : "upgrade", "kimi-code"], 120000);
  if (r.code !== 0) throw new Error(r.stderr || "upgrade failed");
  return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

export async function upgradeKimiCli(): Promise<{ ok: true; stdout: string; stderr: string }> {
  return upgradeTargetCli("kimi-code");
}

export async function startKimiOAuthLogin(
  target: ConfigTarget,
  onEvent?: (event: KimiOAuthLoginEvent) => void,
  options?: { accountId?: string; activate?: boolean },
): Promise<{ ok: true; stdout: string; stderr: string }> {
  const unlisten = onEvent
    ? await listen<KimiOAuthLoginEvent>("kimi-oauth-login", (event) => onEvent(event.payload))
    : null;
  try {
    if (options?.accountId) {
      await officialAccounts.prepareOfficialAccountLogin(options.accountId);
    }
    const r = await invoke<ExecResult>("start_kimi_oauth_login", { target });
    if (r.code !== 0) throw new Error(r.stderr || "kimi login failed");
    if (options?.accountId) {
      await officialAccounts.completeOfficialAccountLogin(options.accountId, options.activate ?? true);
    }
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  } finally {
    unlisten?.();
  }
}

export async function runKimiMcpServerTest(
  name: string,
  server: McpServerConfig,
): Promise<{ ok: true; stdout: string; stderr: string }> {
  if (server.transport === "stdio") {
    if (!server.command.trim()) {
      throw new Error(`MCP server "${name}" uses stdio transport but has no command.`);
    }
    const r = currentPlatform() === "windows"
      ? await exec("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Get-Command ${JSON.stringify(server.command)} -ErrorAction Stop | Out-Null`], 5000)
      : await exec("sh", ["-lc", `command -v ${quoteForShell(server.command)} >/dev/null`], 5000);
    if (r.code !== 0) {
      throw new Error(`MCP server "${name}" command is not available: ${server.command}`);
    }
    return { ok: true, stdout: `MCP stdio command is available: ${server.command}`, stderr: "" };
  }

  if (!server.url.trim()) {
    throw new Error(`MCP server "${name}" URL is required.`);
  }

  const resp = await http(
    "POST",
    server.url.trim(),
    {
      ...server.headers,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "kimi-code-switch-gui",
          version: "1.0.0",
        },
      },
    }),
  );
  if (resp.status === 405) {
    throw new Error(`MCP server "${name}" does not accept Streamable HTTP POST requests. This URL is likely an SSE endpoint; use a real HTTP MCP URL or a stdio bridge.`);
  }
  if (!resp.ok) {
    throw new Error(`MCP server "${name}" HTTP test failed: ${resp.status}${resp.body ? ` - ${resp.body.slice(0, 300)}` : ""}`);
  }
  return { ok: true, stdout: resp.body.trim(), stderr: "" };
}

function mcpInitializeRequest(id: number): McpStdioRpcRequest {
  return {
    id,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "kimi-code-switch-gui",
        version: "1.0.0",
      },
    },
  } as McpStdioRpcRequest;
}

function mcpInitializedNotification(): McpStdioRpcRequest {
  return { method: "notifications/initialized" };
}

function mcpHttpHeaders(server: McpServerConfig, sessionId?: string, protocolVersion = MCP_PROTOCOL_VERSION): Record<string, string> {
  return {
    ...server.headers,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": protocolVersion,
  };
}

async function postMcpJsonRpc(
  name: string,
  server: McpServerConfig,
  request: McpStdioRpcRequest,
  sessionId?: string,
  protocolVersion = MCP_PROTOCOL_VERSION,
): Promise<HttpResponse> {
  if (!server.url.trim()) {
    throw new Error(`MCP server "${name}" URL is required.`);
  }
  const payload: Record<string, unknown> = {
    jsonrpc: "2.0",
    method: request.method,
  };
  if (request.id !== undefined) payload.id = request.id;
  if (request.params !== undefined) payload.params = request.params;
  const resp = await http("POST", server.url.trim(), mcpHttpHeaders(server, sessionId, protocolVersion), JSON.stringify(payload));
  if (resp.status === 405) {
    throw new Error(`MCP server "${name}" does not accept Streamable HTTP POST requests. This URL is likely an SSE endpoint; use a real HTTP MCP URL or a stdio bridge.`);
  }
  if (!resp.ok) {
    throw new Error(`MCP server "${name}" HTTP request failed: ${resp.status}${resp.body ? ` - ${resp.body.slice(0, 300)}` : ""}`);
  }
  return resp;
}

function parseJsonRpcBody(body: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("MCP server returned an empty response.");
  }
  const direct = tryParseJson(trimmed);
  if (direct.ok) return direct.value;

  const eventData = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .find((line) => line && line !== "[DONE]");
  if (eventData) {
    const parsed = tryParseJson(eventData);
    if (parsed.ok) return parsed.value;
  }
  throw new Error("MCP server returned a non-JSON response.");
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

function jsonRpcResult(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    throw new Error("MCP server returned an invalid JSON-RPC response.");
  }
  const record = payload as Record<string, unknown>;
  if (record.error) {
    const error = record.error as Record<string, unknown>;
    throw new Error(`MCP JSON-RPC error: ${String(error.message ?? JSON.stringify(error))}`);
  }
  return record.result;
}

function negotiatedMcpProtocolVersion(initializeResult: unknown): string {
  if (!initializeResult || typeof initializeResult !== "object") {
    return MCP_PROTOCOL_VERSION;
  }
  const version = (initializeResult as Record<string, unknown>).protocolVersion;
  return typeof version === "string" && version.trim() ? version.trim() : MCP_PROTOCOL_VERSION;
}

function parseMcpTools(result: unknown): McpToolInfo[] {
  const tools = result && typeof result === "object" ? (result as Record<string, unknown>).tools : null;
  if (!Array.isArray(tools)) {
    throw new Error("MCP tools/list response does not contain tools.");
  }
  return tools.map((tool, index) => {
    if (!tool || typeof tool !== "object") {
      throw new Error(`MCP tool at index ${index} is invalid.`);
    }
    const record = tool as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) {
      throw new Error(`MCP tool at index ${index} has no name.`);
    }
    return {
      name,
      description: typeof record.description === "string" ? record.description : "",
      inputSchema: record.inputSchema ?? record.input_schema ?? null,
    };
  });
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseToolArguments(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function runHttpMcpToolList(name: string, server: McpServerConfig): Promise<McpToolListResult> {
  const init = await postMcpJsonRpc(name, server, mcpInitializeRequest(1));
  const sessionId = init.headers?.["mcp-session-id"] ?? init.headers?.["Mcp-Session-Id"];
  const protocolVersion = negotiatedMcpProtocolVersion(jsonRpcResult(parseJsonRpcBody(init.body)));
  await postMcpJsonRpc(name, server, mcpInitializedNotification(), sessionId, protocolVersion);
  const listResp = await postMcpJsonRpc(name, server, { id: 2, method: "tools/list" }, sessionId, protocolVersion);
  const payload = parseJsonRpcBody(listResp.body);
  const result = jsonRpcResult(payload);
  return { ok: true, tools: parseMcpTools(result), raw: formatJson(payload) };
}

async function runHttpMcpToolCall(
  name: string,
  server: McpServerConfig,
  toolName: string,
  argsJson: string,
): Promise<McpToolCallResult> {
  const init = await postMcpJsonRpc(name, server, mcpInitializeRequest(1));
  const sessionId = init.headers?.["mcp-session-id"] ?? init.headers?.["Mcp-Session-Id"];
  const protocolVersion = negotiatedMcpProtocolVersion(jsonRpcResult(parseJsonRpcBody(init.body)));
  await postMcpJsonRpc(name, server, mcpInitializedNotification(), sessionId, protocolVersion);
  const callResp = await postMcpJsonRpc(name, server, {
    id: 2,
    method: "tools/call",
    params: { name: toolName, arguments: parseToolArguments(argsJson) },
  }, sessionId, protocolVersion);
  const payload = parseJsonRpcBody(callResp.body);
  return { ok: true, toolName, result: jsonRpcResult(payload), raw: formatJson(payload) };
}

function ensureStdioMcpServer(name: string, server: McpServerConfig): void {
  if (!server.command.trim()) {
    throw new Error(`MCP server "${name}" uses stdio transport but has no command.`);
  }
}

function findJsonRpcResponse(responses: unknown[], id: number): unknown {
  const response = responses.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).id === id;
  });
  if (!response) {
    throw new Error(`MCP stdio server did not return response for request ${id}.`);
  }
  return response;
}

async function runStdioMcpToolList(name: string, server: McpServerConfig): Promise<McpToolListResult> {
  ensureStdioMcpServer(name, server);
  const session = await mcpStdioSession(server.command, server.args, server.env, [
    mcpInitializeRequest(1),
    mcpInitializedNotification(),
    { id: 2, method: "tools/list" },
  ]);
  jsonRpcResult(findJsonRpcResponse(session.responses, 1));
  const listPayload = findJsonRpcResponse(session.responses, 2);
  return {
    ok: true,
    tools: parseMcpTools(jsonRpcResult(listPayload)),
    raw: formatJson(listPayload),
    stderr: session.stderr.trim(),
  };
}

async function runStdioMcpToolCall(
  name: string,
  server: McpServerConfig,
  toolName: string,
  argsJson: string,
): Promise<McpToolCallResult> {
  ensureStdioMcpServer(name, server);
  const session = await mcpStdioSession(server.command, server.args, server.env, [
    mcpInitializeRequest(1),
    mcpInitializedNotification(),
    {
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: parseToolArguments(argsJson) },
    },
  ]);
  jsonRpcResult(findJsonRpcResponse(session.responses, 1));
  const callPayload = findJsonRpcResponse(session.responses, 2);
  return {
    ok: true,
    toolName,
    result: jsonRpcResult(callPayload),
    raw: formatJson(callPayload),
    stderr: session.stderr.trim(),
  };
}

export async function listKimiMcpServerTools(name: string, server: McpServerConfig): Promise<McpToolListResult> {
  return server.transport === "stdio" ? runStdioMcpToolList(name, server) : runHttpMcpToolList(name, server);
}

export async function callKimiMcpServerTool(
  name: string,
  server: McpServerConfig,
  toolName: string,
  argsJson: string,
): Promise<McpToolCallResult> {
  if (!toolName.trim()) {
    throw new Error("MCP tool name is required.");
  }
  return server.transport === "stdio"
    ? runStdioMcpToolCall(name, server, toolName, argsJson)
    : runHttpMcpToolCall(name, server, toolName, argsJson);
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// ── 连通性测试（非流式版：通过 Rust http_request 拿完整响应）──
function joinUrlPath(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const re = new RegExp(`${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return re.test(trimmed) ? trimmed : `${trimmed}${suffix}`;
}

function readStringPath(value: unknown, path: Array<string | number>): string | null {
  let cur: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(cur)) return null;
      cur = cur[key];
    } else {
      if (!cur || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[key];
    }
  }
  return typeof cur === "string" ? cur : null;
}

type Kind = "chat-completions" | "responses" | "anthropic";

function buildRequest(provider: ProviderConfig, model: ModelConfig, prompt: string): {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  kind: Kind;
} {
  const type = provider.type || "openai_legacy";
  if (type === "anthropic") {
    return {
      endpoint: joinUrlPath(provider.base_url, "/v1/messages"),
      headers: { "content-type": "application/json", "x-api-key": provider.api_key, "anthropic-version": "2023-06-01" },
      body: { model: model.model, max_tokens: 64, messages: [{ role: "user", content: prompt }] },
      kind: "anthropic",
    };
  }
  if (type === "openai_responses") {
    return {
      endpoint: joinUrlPath(provider.base_url, "/responses"),
      headers: { "content-type": "application/json", authorization: `Bearer ${provider.api_key}` },
      body: { model: model.model, input: prompt },
      kind: "responses",
    };
  }
  return {
    endpoint: joinUrlPath(provider.base_url, "/chat/completions"),
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.api_key}` },
    body: { model: model.model, messages: [{ role: "user", content: prompt }] },
    kind: "chat-completions",
  };
}

function extractText(raw: string, kind: Kind): string {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (kind === "anthropic") return readStringPath(v, ["content", 0, "text"]) ?? raw;
    if (kind === "responses") return readStringPath(v, ["output_text"]) ?? readStringPath(v, ["output", 0, "content", 0, "text"]) ?? raw;
    return readStringPath(v, ["choices", 0, "message", "content"]) ?? raw;
  } catch {
    return raw;
  }
}

export async function runKimiConnectivityTest(state: AppState, modelName: string): Promise<ProfileConnectivityTestResult> {
  const model = state.mainConfig.models[modelName];
  if (!model) throw new Error(`Model not found: ${modelName}`);
  const provider = state.mainConfig.providers[model.provider];
  if (!provider) throw new Error(`Provider not found: ${model.provider}`);
  if (model.auth_mode === "official-account") {
    const accountStatus = await officialAccounts.getOfficialAccountCredentialsStatus();
    if (!accountStatus.active_account_id || !accountStatus.credentials_present) {
      throw new Error("Official account mode requires an active logged-in Kimi official account.");
    }
    return {
      ok: true,
      stdout: "Official account credentials are active.",
      stderr: "",
      profileName: state.activeProfile,
      modelName,
      providerName: model.provider,
      providerType: provider.type,
      prompt: "",
      endpoint: accountStatus.standard_credentials_path,
      firstTokenMs: 0,
      totalMs: 0,
      status: 0,
    };
  }
  if (!provider.base_url.trim()) throw new Error(`Provider base URL is required: ${model.provider}`);
  if (!provider.api_key.trim()) throw new Error(`Provider API key is required: ${model.provider}`);

  const prompt = "hi";
  const startedAt = performance.now();
  const req = buildRequest(provider, model, prompt);
  const resp = await http("POST", req.endpoint, req.headers, JSON.stringify(req.body));
  const totalMs = Math.max(0, Math.round(performance.now() - startedAt));
  const text = extractText(resp.body, req.kind);
  if (!resp.ok) {
    throw new Error(`Connectivity test failed: HTTP ${resp.status}${text ? ` - ${text}` : ""}`);
  }
  return {
    ok: true,
    stdout: text.trim(),
    stderr: "",
    profileName: state.activeProfile,
    modelName,
    providerName: model.provider,
    providerType: provider.type,
    prompt,
    endpoint: req.endpoint,
    firstTokenMs: totalMs,
    totalMs,
    status: resp.status,
  };
}

// ── 全 provider 批量健康巡检 ──
// 复用 buildRequest 的请求构造做轻量连通性探测；逐项独立 try/catch，
// 单个 provider 失败（含 429 限流）不阻断其余。
export type ProviderHealthReason = "ok" | "no-model" | "missing-base-url" | "missing-api-key" | "rate-limited" | "http-error" | "network-error";

export interface ProviderHealthResult {
  providerName: string;
  ok: boolean;
  reason: ProviderHealthReason;
  status?: number;
  latencyMs?: number;
  detail?: string;
}

// 为某 provider 选一个代表 model（首个引用该 provider 的 model）。
function findRepresentativeModel(state: AppState, providerName: string): { modelName: string; model: ModelConfig } | null {
  for (const [modelName, model] of Object.entries(state.mainConfig.models)) {
    if (model.provider === providerName) return { modelName, model };
  }
  return null;
}

async function probeProvider(providerName: string, provider: ProviderConfig, model: ModelConfig): Promise<ProviderHealthResult> {
  if (model.auth_mode === "official-account") {
    const accountStatus = await officialAccounts.getOfficialAccountCredentialsStatus();
    return {
      providerName,
      ok: Boolean(accountStatus.active_account_id && accountStatus.credentials_present),
      reason: accountStatus.active_account_id && accountStatus.credentials_present ? "ok" : "missing-api-key",
      detail: accountStatus.standard_credentials_path,
    };
  }
  if (!provider.base_url.trim()) {
    return { providerName, ok: false, reason: "missing-base-url" };
  }
  if (!provider.api_key.trim()) {
    return { providerName, ok: false, reason: "missing-api-key" };
  }
  const startedAt = performance.now();
  try {
    const req = buildRequest(provider, model, "hi");
    const resp = await http("POST", req.endpoint, req.headers, JSON.stringify(req.body));
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (resp.ok) {
      return { providerName, ok: true, reason: "ok", status: resp.status, latencyMs };
    }
    if (resp.status === 429) {
      return { providerName, ok: false, reason: "rate-limited", status: resp.status, latencyMs };
    }
    return { providerName, ok: false, reason: "http-error", status: resp.status, latencyMs, detail: resp.body.slice(0, 200) };
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return { providerName, ok: false, reason: "network-error", latencyMs, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function runProvidersHealthCheck(state: AppState): Promise<ProviderHealthResult[]> {
  const entries = Object.entries(state.mainConfig.providers);
  const results = await Promise.all(
    entries.map(async ([providerName, provider]): Promise<ProviderHealthResult> => {
      const rep = findRepresentativeModel(state, providerName);
      if (!rep) {
        return { providerName, ok: false, reason: "no-model" };
      }
      // 逐项独立：单个 provider 探测失败不抛出，统一收敛为结果对象。
      try {
        return await probeProvider(providerName, provider, rep.model);
      } catch (error) {
        return { providerName, ok: false, reason: "network-error", detail: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  return results;
}
