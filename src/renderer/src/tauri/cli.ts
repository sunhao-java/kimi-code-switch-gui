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
