import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { dirname, join } from "node:path";

import * as mockttp from "mockttp";

import type {
  InsightsErrorCode,
  ProxyHealth,
  ProxyState,
  UsageEvent,
} from "@shared/usageTypes";
import { emptyProxyHealth, initialProxyState } from "@shared/usageStore";
import { resolveHome } from "./fileAccess";
import type { UsageDb } from "./usageDb";

const PORT_RANGE_START = 49152;
const PORT_RANGE_END = 65535;
const PORT_RETRY_LIMIT = 5;
const CA_DIR = "~/.kimi/usage/ca";
const CA_CERT_PATH = `${CA_DIR}/root.crt`;
const CA_KEY_PATH = `${CA_DIR}/root.key`;
const CA_FINGERPRINT_PATH = `${CA_DIR}/fingerprint.txt`;
const CA_CREATED_AT_PATH = `${CA_DIR}/created_at.txt`;
const CA_VALIDITY_DAYS = 825;
const JSONL_DIR = "~/.kimi/usage";

interface CABundle {
  cert: string;
  key: string;
  fingerprint: string;
  createdAt: string;
}

interface InflightRequest {
  startTs: number;
  profile: string;
  host: string;
  modelHint: string | null;
  sessionHint: string | null;
}

export interface UsageProxyOptions {
  preferredPort: number | "auto";
  getActiveProfile: () => string;
  storePromptPreview: () => boolean;
  db?: UsageDb;
  onEvent?: (event: UsageEvent) => void;
}

export class UsageProxy {
  private server: mockttp.Mockttp | null = null;
  private state: ProxyState = initialProxyState();
  private options: UsageProxyOptions;
  private inflight = new Map<string, InflightRequest>();
  private latencySamples: number[] = [];
  private eventTimestamps: number[] = [];
  private droppedEvents = 0;
  private caInstallFailures = 0;
  private currentCA: CABundle | null = null;
  private jsonlBytesCache = 0;

  constructor(options: UsageProxyOptions) {
    this.options = options;
  }

  getState(): ProxyState {
    return {
      ...this.state,
      health: this.computeHealth(),
    };
  }

  async start(): Promise<{ port: number; caFingerprint: string; caPath: string }> {
    if (this.state.status === "running" || this.state.status === "starting") {
      return {
        port: this.state.port ?? 0,
        caFingerprint: this.state.caFingerprint ?? "",
        caPath: resolveHome(CA_CERT_PATH),
      };
    }

    this.state = { ...this.state, status: "starting", error: undefined, errorCode: undefined };

    let ca: CABundle;
    try {
      ca = await this.ensureCA();
      this.currentCA = ca;
    } catch (err) {
      this.caInstallFailures += 1;
      this.state = {
        ...initialProxyState(),
        status: "error",
        error: String(err),
        errorCode: "E_CA_WRITE",
      };
      throw err;
    }

    const server = mockttp.getLocal({
      https: { cert: ca.cert, key: ca.key },
      suggestChanges: false,
    });

    server.on("request", (req) => this.handleRequest(req));
    server.on("response", (resp) => {
      void this.handleResponse(resp);
    });
    server.on("abort", (req) => this.handleAbort(req));

    await server.forAnyRequest().thenPassThrough();
    await server.forAnyWebSocket().thenPassThrough();

    let port: number;
    try {
      port = await this.bindPort(server, this.options.preferredPort);
    } catch (err) {
      this.state = {
        ...initialProxyState(),
        status: "error",
        error: String(err),
        errorCode: "E_PROXY_BIND",
      };
      try {
        await server.stop();
      } catch {
        /* swallow */
      }
      throw err;
    }

    this.server = server;
    this.state = {
      status: "running",
      port,
      caFingerprint: ca.fingerprint,
      caCreatedAt: ca.createdAt,
      startedAt: new Date().toISOString(),
      health: emptyProxyHealth(),
    };

    return {
      port,
      caFingerprint: ca.fingerprint,
      caPath: resolveHome(CA_CERT_PATH),
    };
  }

  async stop(timeoutMs = 5000): Promise<{ drainedMs: number }> {
    const startStop = Date.now();
    if (!this.server) {
      this.state = initialProxyState();
      return { drainedMs: 0 };
    }
    const server = this.server;
    this.server = null;
    try {
      await Promise.race([
        server.stop(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      /* swallow */
    }
    this.inflight.clear();
    this.state = initialProxyState();
    return { drainedMs: Date.now() - startStop };
  }

  async testReachable(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (this.state.status !== "running" || !this.state.port) {
      return { ok: false, error: "proxy not running" };
    }
    const port = this.state.port;
    const t0 = Date.now();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__probe`, {
        method: "GET",
        redirect: "manual",
      });
      return { ok: res.status > 0, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async getCaInfo(): Promise<{ path: string; fingerprint: string | null; createdAt: string | null }> {
    return {
      path: resolveHome(CA_CERT_PATH),
      fingerprint: this.currentCA?.fingerprint ?? null,
      createdAt: this.currentCA?.createdAt ?? null,
    };
  }

  private async ensureCA(): Promise<CABundle> {
    const dir = resolveHome(CA_DIR);
    await mkdir(dir, { recursive: true });
    const certPath = resolveHome(CA_CERT_PATH);
    const keyPath = resolveHome(CA_KEY_PATH);
    const fingerprintPath = resolveHome(CA_FINGERPRINT_PATH);
    const createdAtPath = resolveHome(CA_CREATED_AT_PATH);

    let cert: string | null = null;
    let key: string | null = null;
    let createdAt: string | null = null;

    try {
      cert = await readFile(certPath, "utf-8");
      key = await readFile(keyPath, "utf-8");
      try {
        createdAt = (await readFile(createdAtPath, "utf-8")).trim();
      } catch {
        createdAt = null;
      }
    } catch {
      cert = null;
      key = null;
    }

    if (cert && key && createdAt && !isCAExpired(createdAt)) {
      const fingerprint = computeFingerprint(cert);
      return { cert, key, fingerprint, createdAt };
    }

    const generated = await mockttp.generateCACertificate({ bits: 2048 });
    const newCert = generated.cert;
    const newKey = generated.key;
    const now = new Date().toISOString();
    const fingerprint = computeFingerprint(newCert);

    await writeFile(certPath, newCert, { encoding: "utf-8", mode: 0o644 });
    await writeFile(keyPath, newKey, { encoding: "utf-8", mode: 0o600 });
    await writeFile(fingerprintPath, fingerprint, "utf-8");
    await writeFile(createdAtPath, now, "utf-8");

    return { cert: newCert, key: newKey, fingerprint, createdAt: now };
  }

  private async bindPort(server: mockttp.Mockttp, preferred: number | "auto"): Promise<number> {
    const candidates: number[] = [];
    if (typeof preferred === "number") {
      candidates.push(preferred);
    }
    while (candidates.length < PORT_RETRY_LIMIT) {
      candidates.push(randomPort());
    }

    let lastErr: unknown = null;
    for (const port of candidates) {
      try {
        await server.start(port);
        return port;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("E_PROXY_BIND: no port available");
  }

  private handleRequest(req: mockttp.CompletedRequest): void {
    const host = req.hostname ?? extractHost(req.url) ?? "unknown";
    this.inflight.set(req.id, {
      startTs: Date.now(),
      profile: this.options.getActiveProfile(),
      host,
      modelHint: extractModelFromUrl(req.url),
      sessionHint: extractSessionHint(req.headers),
    });
  }

  private handleAbort(req: { id: string }): void {
    this.inflight.delete(req.id);
  }

  private async handleResponse(resp: mockttp.CompletedResponse): Promise<void> {
    const inflight = this.inflight.get(resp.id);
    this.inflight.delete(resp.id);
    if (!inflight) return;

    const tsEnd = Date.now();
    const latency = tsEnd - inflight.startTs;
    this.recordLatency(latency);
    this.recordEvent();

    const provider = detectProvider(inflight.host);
    let model = inflight.modelHint ?? "";
    let tokens = zeroTokens();

    try {
      const contentType = String(resp.headers["content-type"] ?? "");
      const text = await readBodyText(resp.body);
      if (text) {
        if (contentType.includes("application/json")) {
          const json = safeParseJson(text);
          if (json) {
            tokens = extractTokens(provider, json);
            model = pickModel(model, json);
          }
        } else if (contentType.includes("text/event-stream")) {
          const sseEvents = parseSSE(text);
          tokens = aggregateSSE(provider, sseEvents);
          for (const ev of sseEvents) {
            const m = pickModel("", ev);
            if (m) {
              model = model || m;
              break;
            }
          }
        }
      }
    } catch {
      /* ignore body parse errors */
    }

    const errorCode = resp.statusCode >= 400 ? `http_${Math.floor(resp.statusCode / 100)}xx` : null;
    const event: UsageEvent = {
      request_id: randomUUID(),
      ts: inflight.startTs,
      ts_end: tsEnd,
      profile: inflight.profile,
      provider,
      model,
      prompt_tokens: tokens.prompt,
      completion_tokens: tokens.completion,
      cache_read_tokens: tokens.cache_read,
      cache_creation_tokens: tokens.cache_creation,
      reasoning_tokens: tokens.reasoning,
      latency_ms: latency,
      proxy_overhead_ms: 0,
      error_code: errorCode,
      error_message: null,
      http_status: resp.statusCode,
      session_hint: inflight.sessionHint,
      cost_estimate: null,
      pricing_version: null,
      metadata_json: JSON.stringify({ host: inflight.host }),
    };

    try {
      await this.writeJsonl(event);
    } catch {
      this.droppedEvents += 1;
    }

    if (this.options.db) {
      try {
        this.options.db.insertEvent(event);
      } catch {
        /* swallow — JSONL is source of truth */
      }
    }

    this.options.onEvent?.(event);
  }

  private async writeJsonl(event: UsageEvent): Promise<void> {
    const dir = resolveHome(JSONL_DIR);
    await mkdir(dir, { recursive: true });
    const day = msToDay(event.ts);
    const path = join(dir, `events-${day}.jsonl`);
    const line = JSON.stringify({
      request_id: event.request_id,
      ts: event.ts,
      ts_end: event.ts_end,
      profile: event.profile,
      provider: event.provider,
      model: event.model,
      prompt_tokens: event.prompt_tokens,
      completion_tokens: event.completion_tokens,
      cache_read_tokens: event.cache_read_tokens,
      cache_creation_tokens: event.cache_creation_tokens,
      reasoning_tokens: event.reasoning_tokens,
      latency_ms: event.latency_ms,
      proxy_overhead_ms: event.proxy_overhead_ms,
      http_status: event.http_status,
      error_code: event.error_code,
      session_hint: event.session_hint,
      metadata: event.metadata_json ? safeParseJson(event.metadata_json) : null,
    });
    await appendFile(path, `${line}\n`, { encoding: "utf-8" });
    this.jsonlBytesCache += Buffer.byteLength(line) + 1;
  }

  private recordLatency(latency: number): void {
    this.latencySamples.push(latency);
    if (this.latencySamples.length > 200) {
      this.latencySamples.splice(0, this.latencySamples.length - 200);
    }
  }

  private recordEvent(): void {
    const now = Date.now();
    this.eventTimestamps.push(now);
    const cutoff = now - 60 * 1000;
    while (this.eventTimestamps.length > 0 && this.eventTimestamps[0] < cutoff) {
      this.eventTimestamps.shift();
    }
  }

  private computeHealth(): ProxyHealth {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    return {
      proxy_latency_ms_p50: p50,
      proxy_latency_ms_p95: p95,
      events_per_minute: this.eventTimestamps.length,
      sqlite_db_size_bytes: 0,
      jsonl_total_bytes: this.jsonlBytesCache,
      ca_install_failures_count: this.caInstallFailures,
      dropped_events_count: this.droppedEvents,
    };
  }
}

interface TokenCounts {
  prompt: number;
  completion: number;
  cache_read: number;
  cache_creation: number;
  reasoning: number;
}

function zeroTokens(): TokenCounts {
  return { prompt: 0, completion: 0, cache_read: 0, cache_creation: 0, reasoning: 0 };
}

function extractTokens(provider: string, body: unknown): TokenCounts {
  const root = body as Record<string, unknown> | null | undefined;
  if (!root) return zeroTokens();

  if (provider === "anthropic") {
    const usage = root.usage as Record<string, unknown> | undefined;
    if (!usage) return zeroTokens();
    return {
      prompt: numberOrZero(usage.input_tokens),
      completion: numberOrZero(usage.output_tokens),
      cache_read: numberOrZero(usage.cache_read_input_tokens),
      cache_creation: numberOrZero(usage.cache_creation_input_tokens),
      reasoning: 0,
    };
  }

  if (provider === "gemini") {
    const meta =
      (root.usageMetadata as Record<string, unknown> | undefined) ??
      (root.usage_metadata as Record<string, unknown> | undefined);
    if (!meta) return zeroTokens();
    return {
      prompt: numberOrZero(meta.promptTokenCount ?? meta.prompt_token_count),
      completion: numberOrZero(meta.candidatesTokenCount ?? meta.candidates_token_count),
      cache_read: numberOrZero(meta.cachedContentTokenCount ?? meta.cached_content_token_count),
      cache_creation: 0,
      reasoning: numberOrZero(meta.thoughtsTokenCount ?? meta.thoughts_token_count),
    };
  }

  const usage = root.usage as Record<string, unknown> | undefined;
  if (!usage) return zeroTokens();
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined;
  return {
    prompt: numberOrZero(usage.prompt_tokens ?? usage.input_tokens),
    completion: numberOrZero(usage.completion_tokens ?? usage.output_tokens),
    cache_read: numberOrZero(promptDetails?.cached_tokens ?? usage.cache_read_input_tokens),
    cache_creation: numberOrZero(usage.cache_creation_input_tokens),
    reasoning: numberOrZero(completionDetails?.reasoning_tokens),
  };
}

function aggregateSSE(provider: string, events: unknown[]): TokenCounts {
  let acc = zeroTokens();
  for (const ev of events) {
    if (provider === "anthropic") {
      const e = ev as Record<string, unknown>;
      const message = e.message as Record<string, unknown> | undefined;
      const delta = e.usage as Record<string, unknown> | undefined;
      if (message?.usage) {
        acc = mergeTokens(acc, extractTokens(provider, { usage: message.usage }));
      }
      if (delta) {
        acc = mergeTokens(acc, extractTokens(provider, { usage: delta }));
      }
    } else {
      const partial = extractTokens(provider, ev);
      if (hasTokens(partial)) {
        acc = partial;
      }
    }
  }
  return acc;
}

function hasTokens(t: TokenCounts): boolean {
  return t.prompt > 0 || t.completion > 0 || t.cache_read > 0 || t.cache_creation > 0 || t.reasoning > 0;
}

function mergeTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    prompt: Math.max(a.prompt, b.prompt),
    completion: Math.max(a.completion, b.completion),
    cache_read: Math.max(a.cache_read, b.cache_read),
    cache_creation: Math.max(a.cache_creation, b.cache_creation),
    reasoning: Math.max(a.reasoning, b.reasoning),
  };
}

function numberOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function detectProvider(host: string): string {
  const h = host.toLowerCase();
  if (h.includes("anthropic.com")) return "anthropic";
  if (h.includes("openai.com")) return "openai";
  if (h.includes("moonshot.cn") || h.includes("moonshot.ai") || h.includes("kimi")) return "moonshot";
  if (h.includes("googleapis.com") || h.includes("generativelanguage")) return "gemini";
  if (h.includes("groq.com")) return "groq";
  if (h.includes("deepseek.com")) return "deepseek";
  if (h.includes("siliconflow")) return "siliconflow";
  if (h.includes("ollama") || h.includes("127.0.0.1") || h.includes("localhost")) return "local";
  return h.split(".").slice(-2).join(".");
}

function pickModel(current: string, body: unknown): string {
  if (current) return current;
  const root = body as Record<string, unknown> | null;
  if (!root) return "";
  const candidate = root.model;
  return typeof candidate === "string" ? candidate : "";
}

function extractModelFromUrl(url: string): string | null {
  const match = url.match(/\/models\/([^/?:]+)/);
  if (match) return match[1];
  return null;
}

function extractSessionHint(headers: Record<string, string | string[] | undefined>): string | null {
  const candidates = ["x-session-id", "x-conversation-id", "x-request-context"];
  for (const key of candidates) {
    const v = headers[key];
    if (typeof v === "string" && v.length > 0) return v.slice(0, 64);
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].slice(0, 64);
  }
  return null;
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseSSE(text: string): unknown[] {
  const events: unknown[] = [];
  for (const block of text.split(/\n\n+/)) {
    let data = "";
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data: ")) data += line.slice(6);
      else if (line.startsWith("data:")) data += line.slice(5);
    }
    if (!data || data === "[DONE]") continue;
    const parsed = safeParseJson(data);
    if (parsed) events.push(parsed);
  }
  return events;
}

async function readBodyText(body: unknown): Promise<string> {
  const b = body as { getText?: () => Promise<string> | string } | null | undefined;
  if (!b || typeof b.getText !== "function") return "";
  try {
    const text = await b.getText();
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

function computeFingerprint(cert: string): string {
  return createHash("sha256").update(cert).digest("hex").slice(0, 32);
}

function isCAExpired(createdAt: string): boolean {
  const d = Date.parse(createdAt);
  if (Number.isNaN(d)) return true;
  return Date.now() - d > CA_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
}

function randomPort(): number {
  return Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START)) + PORT_RANGE_START;
}

function msToDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function classifyError(err: unknown): InsightsErrorCode {
  const msg = String(err);
  if (msg.includes("EADDRINUSE")) return "E_PROXY_BIND";
  if (msg.includes("EACCES")) return "E_CA_WRITE";
  return "E_PROXY_DOWNSTREAM";
}
