// 用量日志监听器（前端版，移植自 main/modules/usageLogWatcher.ts）。
// 解析逻辑（正则 + session 上下文）纯前端；文件 tail 用 Rust file_stat/read_file_slice + 轮询。
import { invoke } from "@tauri-apps/api/core";

import type { UsageEvent } from "@shared/usageTypes";
import * as db from "./usageDb";

const SESSION_ROOT = "~/.kimi-code/sessions";
const LOG_DIR = "~/.kimi-code/logs";
const LOG_PATH = "~/.kimi-code/logs/kimi-code.log";

const RE_LLM_STEP = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+kimisoul:_step:\d+ \| ([0-9a-f-]+) - LLM step completed in ([\d.]+)s \(input=(\d+), output=(\d+)\)/;
const RE_SESSION_CREATE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:_run:\d+ \|  - Created new session: ([0-9a-f-]+)/;
const RE_PROVIDER = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM provider: type='([^']+)' base_url='([^']+)'/;
const RE_MODEL = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM model: provider='([^']+)' model='([^']+)'/;
const RE_CODE_LLM_CONFIG = /^(\d{4}-\d{2}-\d{2}T[^ ]+) INFO\s+llm config\s+(.+)$/;
const RE_CODE_LLM_REQUEST = /^(\d{4}-\d{2}-\d{2}T[^ ]+) INFO\s+llm request\s+(.+)$/;
const RE_CODE_LLM_FAILED = /^(\d{4}-\d{2}-\d{2}T[^ ]+) WARN\s+llm request failed\s+(.+)$/;

interface FileStat {
  size: number;
  mtime_ms: number;
  ino: number;
}

interface SessionContext {
  provider: string;
  model: string;
  baseUrl: string;
}

export interface UsageLogWatcherOptions {
  getActiveProfile: () => string;
  onEvent?: (event: UsageEvent) => void;
}

export class UsageLogWatcher {
  private fileOffset = 0;
  private tailBuffer = "";
  private sessions = new Map<string, SessionContext>();
  private currentSession: string | null = null;
  private currentProvider = "";
  private currentModel = "";
  private currentModelAlias = "";
  private pendingRequests = new Map<string, { ts: number; provider: string; model: string; modelAlias: string }>();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private eventsIngested = 0;

  constructor(private options: UsageLogWatcherOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.ingestHistoricalLogs();
    await this.readNewLines(LOG_PATH);
    this.pollTimer = setInterval(() => {
      void this.readNewLines();
      void this.readSessionLogs();
    }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): { sessionsTracked: number; eventsIngested: number } {
    return { sessionsTracked: this.sessions.size, eventsIngested: this.eventsIngested };
  }

  private async fileStat(path: string): Promise<FileStat | null> {
    return invoke<FileStat | null>("file_stat", { path });
  }

  private async readSlice(path: string, offset: number, length: number): Promise<string> {
    return invoke<string>("read_file_slice", { path, offset, length });
  }

  private async listDir(path: string): Promise<string[]> {
    return invoke<string[]>("list_dir", { path });
  }

  private async ingestHistoricalLogs(): Promise<void> {
    try {
      const entries = await this.listDir(LOG_DIR);
      const rotated = entries
        .filter((name) => name.endsWith(".log") && name !== "kimi-code.log")
        .sort();
      for (const name of rotated) {
        await this.ingestFile(`${LOG_DIR}/${name}`);
      }
    } catch {
      /* logs dir may not exist */
    }
    await this.readSessionLogs();
  }

  private async ingestFile(path: string): Promise<void> {
    try {
      const s = await this.fileStat(path);
      if (!s || s.size === 0) return;
      const text = await this.readSlice(path, 0, s.size);
      for (const line of text.split("\n")) {
        if (line.trim()) await this.parseLine(line);
      }
    } catch {
      /* file may not be readable */
    }
  }

  private async readSessionLogs(): Promise<void> {
    for (const path of await this.discoverSessionLogPaths()) {
      await this.readNewLines(path);
    }
  }

  private async discoverSessionLogPaths(): Promise<string[]> {
    const paths: string[] = [];
    try {
      const workDirs = await this.listDir(SESSION_ROOT);
      for (const workDir of workDirs) {
        const workDirPath = `${SESSION_ROOT}/${workDir}`;
        let sessions: string[];
        try {
          sessions = await this.listDir(workDirPath);
        } catch {
          continue;
        }
        for (const session of sessions) {
          const logPath = `${workDirPath}/${session}/logs/kimi-code.log`;
          if (await this.fileStat(logPath)) paths.push(logPath);
          const wirePath = `${workDirPath}/${session}/agents/main/wire.jsonl`;
          if (await this.fileStat(wirePath)) paths.push(wirePath);
        }
      }
    } catch {
      /* sessions dir may not exist */
    }
    return paths;
  }

  private inodeSignature(stat: FileStat): string {
    return `${stat.ino}:${stat.mtime_ms}`;
  }

  private byteLength(text: string): number {
    return new TextEncoder().encode(text).length;
  }

  private async readNewLines(path = LOG_PATH): Promise<void> {
    if (!this.running) return;
    try {
      const s = await this.fileStat(path);
      if (!s) return;
      const signature = this.inodeSignature(s);
      const saved = path === LOG_PATH ? null : await db.getIngestState(path);
      let offset = path === LOG_PATH ? this.fileOffset : saved?.byteOffset ?? 0;
      if (saved?.inodeSignature && saved.inodeSignature !== signature) offset = 0;
      if (s.size < offset) offset = 0;
      if (s.size <= offset) return;

      const text = (path === LOG_PATH ? this.tailBuffer : "") + (await this.readSlice(path, offset, s.size - offset));
      if (path === LOG_PATH) this.fileOffset = s.size;
      const lines = text.split("\n");
      const tail = lines.pop() ?? "";
      if (path === LOG_PATH) {
        this.tailBuffer = tail;
      } else if (tail.trim()) {
        lines.push(tail);
      }
      for (const line of lines) await this.parseLine(line, path);
      if (path !== LOG_PATH) await db.setIngestState(path, s.size, signature);
    } catch {
      /* log file may not exist yet */
    }
  }

  private parseFields(raw: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const re = /(\w+)=((?:"[^"]*")|(?:\S+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      fields[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    return fields;
  }

  private stableRequestId(path: string, ts: number, kind: string, key: string): string {
    const raw = `${path}:${ts}:${kind}:${key}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = Math.imul(31, hash) + raw.charCodeAt(i) | 0;
    }
    return `log-${Math.abs(hash).toString(36)}-${ts}`;
  }

  private sessionHintFromPath(path: string): string | null {
    const parts = path.split("/");
    const agentsIndex = parts.lastIndexOf("agents");
    if (agentsIndex > 0) return parts[agentsIndex - 1] || null;
    const logsIndex = parts.lastIndexOf("logs");
    if (logsIndex > 0) return parts[logsIndex - 1] || null;
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private numberField(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private async parseWireJsonLine(line: string, sourcePath: string): Promise<boolean> {
    if (!line.startsWith("{")) return false;
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      return false;
    }
    if (!this.isRecord(payload) || payload.type !== "usage.record") return false;
    const usage = this.isRecord(payload.usage) ? payload.usage : {};
    const ts = this.numberField(payload.time) || Date.now();
    const model = typeof payload.model === "string" ? payload.model : this.currentModelAlias || this.currentModel;
    const provider = model.includes("/") ? model.split("/")[0] : this.currentProvider || "kimi";
    const event: UsageEvent = {
      request_id: this.stableRequestId(sourcePath, ts, "usage", model),
      ts,
      ts_end: ts,
      provider,
      model,
      profile: this.options.getActiveProfile(),
      prompt_tokens: this.numberField(usage.inputOther),
      completion_tokens: this.numberField(usage.output),
      cache_read_tokens: this.numberField(usage.inputCacheRead),
      cache_creation_tokens: this.numberField(usage.inputCacheCreation),
      reasoning_tokens: this.numberField(usage.reasoningTokens),
      latency_ms: 0,
      proxy_overhead_ms: 0,
      error_code: null,
      error_message: null,
      http_status: 200,
      session_hint: this.sessionHintFromPath(sourcePath),
      cost_estimate: null,
      pricing_version: null,
      metadata_json: JSON.stringify({ source: "kimi-code-wire", usageScope: payload.usageScope ?? null }),
    };
    if (await db.insertEvent(event)) this.eventsIngested += 1;
    this.options.onEvent?.(event);
    return true;
  }

  private async parseLine(line: string, sourcePath = LOG_PATH): Promise<void> {
    let m: RegExpMatchArray | null;

    if (await this.parseWireJsonLine(line, sourcePath)) return;

    m = line.match(RE_SESSION_CREATE);
    if (m) {
      this.currentSession = m[2];
      this.sessions.set(this.currentSession, { provider: this.currentProvider, model: this.currentModel, baseUrl: "" });
      return;
    }

    m = line.match(RE_PROVIDER);
    if (m) {
      this.currentProvider = m[2];
      if (this.currentSession && this.sessions.has(this.currentSession)) {
        const ctx = this.sessions.get(this.currentSession)!;
        ctx.provider = m[2];
        ctx.baseUrl = m[3];
      }
      return;
    }

    m = line.match(RE_MODEL);
    if (m) {
      this.currentModel = m[3];
      if (this.currentSession && this.sessions.has(this.currentSession)) {
        const ctx = this.sessions.get(this.currentSession)!;
        ctx.provider = m[2];
        ctx.model = m[3];
      }
      return;
    }

    m = line.match(RE_CODE_LLM_CONFIG);
    if (m) {
      const [, timestamp, rawFields] = m;
      const fields = this.parseFields(rawFields);
      this.currentProvider = fields.provider || this.currentProvider;
      this.currentModel = fields.model || this.currentModel;
      this.currentModelAlias = fields.modelAlias || this.currentModelAlias;
      const turnStep = fields.turnStep || "unknown";
      const ts = new Date(timestamp).getTime();
      if (!Number.isNaN(ts)) {
        this.pendingRequests.set(turnStep, {
          ts,
          provider: this.currentProvider,
          model: this.currentModelAlias || this.currentModel,
          modelAlias: this.currentModelAlias,
        });
      }
      return;
    }

    m = line.match(RE_CODE_LLM_REQUEST);
    if (m) {
      const [, timestamp, rawFields] = m;
      const fields = this.parseFields(rawFields);
      const turnStep = fields.turnStep || "unknown";
      const ts = new Date(timestamp).getTime();
      if (!Number.isNaN(ts) && !this.pendingRequests.has(turnStep)) {
        this.pendingRequests.set(turnStep, {
          ts,
          provider: this.currentProvider,
          model: this.currentModelAlias || this.currentModel,
          modelAlias: this.currentModelAlias,
        });
      }
      return;
    }

    m = line.match(RE_CODE_LLM_FAILED);
    if (m) {
      const [, timestamp, rawFields] = m;
      const fields = this.parseFields(rawFields);
      const ts = new Date(timestamp).getTime();
      if (Number.isNaN(ts)) return;
      const turnStep = fields.turnStep || "unknown";
      const pending = this.pendingRequests.get(turnStep);
      const status = Number.parseInt(fields.statusCode ?? "0", 10);
      const model = fields.model || pending?.model || this.currentModelAlias || this.currentModel;
      const event: UsageEvent = {
        request_id: this.stableRequestId(sourcePath, ts, "failed", turnStep),
        ts: pending?.ts ?? ts,
        ts_end: ts,
        provider: pending?.provider || this.currentProvider || "kimi",
        model,
        profile: this.options.getActiveProfile(),
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        latency_ms: pending ? Math.max(0, ts - pending.ts) : 0,
        proxy_overhead_ms: 0,
        error_code: fields.errorName || (status ? String(status) : "llm_request_failed"),
        error_message: fields.errorMessage || null,
        http_status: Number.isFinite(status) ? status : 0,
        session_hint: this.sessionHintFromPath(sourcePath),
        cost_estimate: null,
        pricing_version: null,
        metadata_json: JSON.stringify({ source: "kimi-code-log", turnStep, modelAlias: pending?.modelAlias ?? this.currentModelAlias }),
      };
      if (await db.insertEvent(event)) this.eventsIngested += 1;
      this.options.onEvent?.(event);
      this.pendingRequests.delete(turnStep);
      return;
    }

    m = line.match(RE_LLM_STEP);
    if (m) {
      const [, timestamp, sessionId, latencyStr, inputStr, outputStr] = m;
      const ctx = this.sessions.get(sessionId) ?? { provider: this.currentProvider, model: this.currentModel, baseUrl: "" };
      const ts = new Date(timestamp.replace(" ", "T")).getTime();
      if (Number.isNaN(ts)) return;

      const event: UsageEvent = {
        request_id: this.stableRequestId(sourcePath, ts, "step", sessionId),
        ts,
        ts_end: null,
        provider: ctx.provider,
        model: ctx.model,
        profile: this.options.getActiveProfile(),
        prompt_tokens: parseInt(inputStr, 10),
        completion_tokens: parseInt(outputStr, 10),
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        latency_ms: Math.round(parseFloat(latencyStr) * 1000),
        proxy_overhead_ms: 0,
        error_code: null,
        error_message: null,
        http_status: 200,
        session_hint: sessionId,
        cost_estimate: null,
        pricing_version: null,
        metadata_json: null,
      };
      if (await db.insertEvent(event)) this.eventsIngested += 1;
      this.options.onEvent?.(event);
    }
  }
}
