// CLI / MCP / 连通性测试前端适配（移植自 main/modules/cli.ts）。
// 进程执行走 Rust exec_command，网络走 Rust http_request（绕过 CORS）。
import { invoke } from "@tauri-apps/api/core";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";
import type { AppState, ModelConfig, ProfileConnectivityTestResult, ProviderConfig } from "@shared/types";

const KIMI_CLI_PYPI_URL = "https://pypi.org/pypi/kimi-cli/json";

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

export interface CliVersionResult {
  version: string;
  installed: boolean;
  latestVersion?: string;
  hasUpdate?: boolean;
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

export async function getCliVersion(options: { checkLatest?: boolean } = {}): Promise<CliVersionResult> {
  let result: CliVersionResult;
  try {
    const r = await exec("kimi", ["--version"], 3000);
    if (r.code !== 0) throw new Error(r.stderr);
    const match = r.stdout.match(/(\d+\.\d+\.\d+)/);
    result = { version: match ? match[1] : r.stdout.trim(), installed: true };
  } catch {
    result = { version: "", installed: false };
  }
  if (!options.checkLatest) return result;

  try {
    const resp = await http("GET", KIMI_CLI_PYPI_URL, { Accept: "application/json", "User-Agent": "kimi-code-switch-gui" });
    if (!resp.ok) return result;
    const payload = JSON.parse(resp.body) as { info?: { version?: string } };
    const latestVersion = normalizeReleaseVersion(payload.info?.version ?? "");
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

export async function upgradeKimiCli(): Promise<{ ok: true; stdout: string; stderr: string }> {
  const r = await exec("uv", ["tool", "upgrade", "kimi-cli", "--no-cache"], 120000);
  if (r.code !== 0) throw new Error(r.stderr || "upgrade failed");
  return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
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
