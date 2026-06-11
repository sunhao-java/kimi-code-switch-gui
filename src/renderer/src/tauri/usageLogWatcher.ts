// 用量日志监听器（前端版，移植自 main/modules/usageLogWatcher.ts）。
// 解析逻辑（正则 + session 上下文）纯前端；文件 tail 用 Rust file_stat/read_file_slice + 轮询。
import { invoke } from "@tauri-apps/api/core";

import type { UsageEvent } from "@shared/usageTypes";
import * as db from "./usageDb";

const LOG_DIR = "~/.kimi-code/logs";
const LOG_PATH = "~/.kimi-code/logs/kimi-code.log";

const RE_LLM_STEP = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+kimisoul:_step:\d+ \| ([0-9a-f-]+) - LLM step completed in ([\d.]+)s \(input=(\d+), output=(\d+)\)/;
const RE_SESSION_CREATE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:_run:\d+ \|  - Created new session: ([0-9a-f-]+)/;
const RE_PROVIDER = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM provider: type='([^']+)' base_url='([^']+)'/;
const RE_MODEL = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM model: provider='([^']+)' model='([^']+)'/;

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

function uuid(): string {
  return crypto.randomUUID();
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
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private eventsIngested = 0;

  constructor(private options: UsageLogWatcherOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.ingestHistoricalLogs();
    this.fileOffset = 0;
    await this.readNewLines();
    this.pollTimer = setInterval(() => void this.readNewLines(), 5000);
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

  private async readNewLines(): Promise<void> {
    if (!this.running) return;
    try {
      const s = await this.fileStat(LOG_PATH);
      if (!s) return;
      if (s.size < this.fileOffset) this.fileOffset = 0;
      if (s.size <= this.fileOffset) return;

      const text = this.tailBuffer + (await this.readSlice(LOG_PATH, this.fileOffset, s.size - this.fileOffset));
      this.fileOffset = s.size;
      const lines = text.split("\n");
      this.tailBuffer = lines.pop() ?? "";
      for (const line of lines) await this.parseLine(line);
    } catch {
      /* log file may not exist yet */
    }
  }

  private async parseLine(line: string): Promise<void> {
    let m: RegExpMatchArray | null;

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

    m = line.match(RE_LLM_STEP);
    if (m) {
      const [, timestamp, sessionId, latencyStr, inputStr, outputStr] = m;
      const ctx = this.sessions.get(sessionId) ?? { provider: this.currentProvider, model: this.currentModel, baseUrl: "" };
      const ts = new Date(timestamp.replace(" ", "T")).getTime();
      if (Number.isNaN(ts)) return;

      const event: UsageEvent = {
        request_id: uuid(),
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
