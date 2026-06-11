// CLI / MCP / 连通性测试前端适配（移植自 main/modules/cli.ts）。
// 进程执行走 Rust exec_command，网络走 Rust http_request（绕过 CORS）。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";
import type { AppState, ConfigTarget, ModelConfig, ProfileConnectivityTestResult, ProviderConfig } from "@shared/types";

const KIMI_CLI_PYPI_URL = "https://pypi.org/pypi/kimi-cli/json";
const KIMI_CODE_HOMEBREW_URL = "https://formulae.brew.sh/api/formula/kimi-code.json";
const KIMI_CODE_GITHUB_LATEST_URL = "https://api.github.com/repos/MoonshotAI/kimi-code/releases/latest";
const KIMI_CODE_INSTALL_SCRIPT_SH = "https://code.kimi.com/kimi-code/install.sh";
const KIMI_CODE_INSTALL_SCRIPT_URL = "https://code.kimi.com/kimi-code/install.ps1";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

function exec(program: string, args: string[], timeoutMs?: number): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { program, args, timeoutMs: timeoutMs ?? null });
}

function http(method: string, url: string, headers?: Record<string, string>, body?: string): Promise<HttpResponse> {
  return invoke<HttpResponse>("http_request", { method, url, headers: headers ?? null, body: body ?? null });
}

function extractSemver(value: string | undefined): string {
  const match = value?.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : normalizeReleaseVersion(value ?? "");
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

// GUI 期望的 kimi-cli 版本范围：低于 MIN 判定为过旧（功能可能不兼容）。
// EXPECTED 是当前 GUI 主要对照测试过的版本，仅作展示参考。
export const MIN_CLI_VERSION = "1.0.0";
export const EXPECTED_CLI_VERSION = "1.4.0";

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
  if (target === "kimi-code") {
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
  return {
    target,
    packageName: "Kimi CLI",
    installCommand: "uv tool install kimi-cli --force",
    updateCommand: "uv tool upgrade kimi-cli --no-cache",
  };
}

async function detectKimiCommandVersion(target: ConfigTarget): Promise<CliVersionResult> {
  const base = versionResultBase(target);
  try {
    const r = await exec("kimi", ["--version"], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    return { ...base, version: extractSemver(r.stdout) || r.stdout.trim(), installed: true };
  } catch {
    return { ...base, version: "", installed: false };
  }
}

async function detectKimiCodeHomebrewVersion(): Promise<CliVersionResult> {
  const base = versionResultBase("kimi-code");
  try {
    const r = await exec("brew", ["list", "--versions", "kimi-code"], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    const version = extractSemver(r.stdout);
    if (!version) throw new Error("kimi-code Homebrew version not found");
    return { ...base, version, installed: true };
  } catch {
    return { ...base, version: "", installed: false };
  }
}

async function detectKimiCodeScriptVersion(): Promise<CliVersionResult> {
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
    return { ...base, version, installed: true };
  } catch {
    return { ...versionResultBase("kimi-code"), version: "", installed: false };
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
      return { ...base, version, installed: true };
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
    return { ...base, version: extractSemver(output) || output.trim(), installed: true };
  } catch {
    return { ...base, version: "", installed: false };
  }
}

async function detectKimiCodeVersion(): Promise<CliVersionResult> {
  if (currentPlatform() === "windows") {
    return detectKimiCodeWindowsVersion();
  }
  const homebrew = await detectKimiCodeHomebrewVersion();
  if (homebrew.installed) return homebrew;
  return detectKimiCodeScriptVersion();
}

async function getKimiCliLatestVersion(): Promise<string | null> {
  const resp = await http("GET", KIMI_CLI_PYPI_URL, { Accept: "application/json", "User-Agent": "kimi-code-switch-gui" });
  if (!resp.ok) return null;
  const payload = JSON.parse(resp.body) as { info?: { version?: string } };
  return extractSemver(payload.info?.version) || null;
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

async function attachLatestVersion(result: CliVersionResult): Promise<CliVersionResult> {
  try {
    const latestVersion = result.target === "kimi-code"
      ? await getKimiCodeLatestVersion()
      : await getKimiCliLatestVersion();
    if (!latestVersion) return result;
    return {
      ...result,
      latestVersion,
      hasUpdate: result.version ? compareReleaseVersions(latestVersion, result.version) > 0 : false,
    };
  } catch {
    return result;
  }
}

export async function getCliVersion(options: { checkLatest?: boolean } = {}): Promise<CliVersionResult> {
  return getTargetCliVersion("kimi-cli", options);
}

export async function getTargetCliVersion(target: ConfigTarget = "kimi-cli", options: { checkLatest?: boolean } = {}): Promise<CliVersionResult> {
  const result = target === "kimi-code"
    ? await detectKimiCodeVersion()
    : await detectKimiCommandVersion(target);
  if (!options.checkLatest) return result;
  return attachLatestVersion(result);
}

export async function upgradeTargetCli(
  target: ConfigTarget = "kimi-cli",
  options: { install?: boolean } = {},
): Promise<{ ok: true; stdout: string; stderr: string }> {
  if (target === "kimi-code") {
    const platform = currentPlatform();
    const r = platform === "windows"
      ? await exec("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `irm ${KIMI_CODE_INSTALL_SCRIPT_URL} | iex`], 120000)
      : await exec("brew", [options.install ? "install" : "upgrade", "kimi-code"], 120000);
    if (r.code !== 0) throw new Error(r.stderr || "upgrade failed");
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  }
  if (options.install) {
    const r = await exec("uv", ["tool", "install", "kimi-cli", "--force"], 120000);
    if (r.code !== 0) throw new Error(r.stderr || "install failed");
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  }
  return upgradeKimiCli();
}

export async function upgradeKimiCli(): Promise<{ ok: true; stdout: string; stderr: string }> {
  const r = await exec("uv", ["tool", "upgrade", "kimi-cli", "--no-cache"], 120000);
  if (r.code !== 0) throw new Error(r.stderr || "upgrade failed");
  return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

export async function startKimiOAuthLogin(
  target: ConfigTarget,
  onEvent?: (event: KimiOAuthLoginEvent) => void,
): Promise<{ ok: true; stdout: string; stderr: string }> {
  const unlisten = onEvent
    ? await listen<KimiOAuthLoginEvent>("kimi-oauth-login", (event) => onEvent(event.payload))
    : null;
  try {
    const r = await invoke<ExecResult>("start_kimi_oauth_login", { target });
    if (r.code !== 0) throw new Error(r.stderr || "kimi login failed");
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  } finally {
    unlisten?.();
  }
}

export async function runKimiMcpCommand(args: string[]): Promise<{ ok: true; stdout: string; stderr: string }> {
  const r = await exec("kimi", ["mcp", ...args]);
  if (r.code !== 0) throw new Error(r.stderr || "mcp command failed");
  return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
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
