import { open, stat, readdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";

import type { UsageEvent } from "@shared/usageTypes";
import { resolveHome } from "./fileAccess";
import type { UsageDb } from "./usageDb";

const LOG_DIR = "~/.kimi/logs";
const LOG_PATH = "~/.kimi/logs/kimi.log";

const RE_LLM_STEP = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+kimisoul:_step:\d+ \| ([0-9a-f-]+) - LLM step completed in ([\d.]+)s \(input=(\d+), output=(\d+)\)/;
const RE_SESSION_CREATE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:_run:\d+ \|  - Created new session: ([0-9a-f-]+)/;
const RE_PROVIDER = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM provider: type='([^']+)' base_url='([^']+)'/;
const RE_MODEL = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \| INFO\s+\| .+:create:\d+ \|  - Using LLM model: provider='([^']+)' model='([^']+)'/;

interface SessionContext {
  provider: string;
  model: string;
  baseUrl: string;
}

export interface UsageLogWatcherOptions {
  db?: UsageDb;
  getActiveProfile: () => string;
  onEvent?: (event: UsageEvent) => void;
}

export class UsageLogWatcher {
  private watcher: FSWatcher | null = null;
  private fileOffset = 0;
  private tailBuffer = "";
  private resolvedPath: string;
  private sessions = new Map<string, SessionContext>();
  private currentSession: string | null = null;
  private currentProvider = "";
  private currentModel = "";
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private options: UsageLogWatcherOptions) {
    this.resolvedPath = resolveHome(LOG_PATH);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.ingestHistoricalLogs();

    this.fileOffset = 0;
    await this.readNewLines();

    this.watcher = watch(this.resolvedPath, () => {
      void this.readNewLines();
    });

    this.pollTimer = setInterval(() => {
      void this.readNewLines();
    }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): { sessionsTracked: number; eventsIngested: number } {
    return {
      sessionsTracked: this.sessions.size,
      eventsIngested: this.options.db?.getEventCount() ?? 0,
    };
  }

  private async ingestHistoricalLogs(): Promise<void> {
    const logDir = resolveHome(LOG_DIR);
    try {
      const entries = await readdir(logDir);
      const rotatedLogs = entries
        .filter((name) => name.startsWith("kimi.") && name.endsWith(".log") && name !== "kimi.log")
        .sort();
      for (const name of rotatedLogs) {
        await this.ingestFile(join(logDir, name));
      }
    } catch {
      // logs dir may not exist
    }
  }

  private async ingestFile(filePath: string): Promise<void> {
    let fh;
    try {
      fh = await open(filePath, "r");
      const s = await stat(filePath);
      const buf = Buffer.alloc(s.size);
      await fh.read(buf, 0, buf.length, 0);
      const lines = buf.toString("utf-8").split("\n");
      for (const line of lines) {
        if (line.trim()) this.parseLine(line);
      }
    } catch {
      // file may not be readable
    } finally {
      await fh?.close();
    }
  }

  private async readNewLines(): Promise<void> {
    if (!this.running) return;

    let fh;
    try {
      const s = await stat(this.resolvedPath);
      if (s.size < this.fileOffset) {
        this.fileOffset = 0;
      }
      if (s.size <= this.fileOffset) return;

      fh = await open(this.resolvedPath, "r");
      const buf = Buffer.alloc(s.size - this.fileOffset);
      await fh.read(buf, 0, buf.length, this.fileOffset);
      this.fileOffset = s.size;

      const text = this.tailBuffer + buf.toString("utf-8");
      const lines = text.split("\n");
      this.tailBuffer = lines.pop() ?? "";

      for (const line of lines) {
        this.parseLine(line);
      }
    } catch {
      // log file may not exist yet or be rotated
    } finally {
      await fh?.close();
    }
  }

  private parseLine(line: string): void {
    let match: RegExpMatchArray | null;

    match = line.match(RE_SESSION_CREATE);
    if (match) {
      this.currentSession = match[2];
      this.sessions.set(this.currentSession, {
        provider: this.currentProvider,
        model: this.currentModel,
        baseUrl: "",
      });
      return;
    }

    match = line.match(RE_PROVIDER);
    if (match) {
      this.currentProvider = match[2];
      const baseUrl = match[3];
      if (this.currentSession && this.sessions.has(this.currentSession)) {
        const ctx = this.sessions.get(this.currentSession)!;
        ctx.provider = match[2];
        ctx.baseUrl = baseUrl;
      }
      return;
    }

    match = line.match(RE_MODEL);
    if (match) {
      this.currentModel = match[3];
      if (this.currentSession && this.sessions.has(this.currentSession)) {
        const ctx = this.sessions.get(this.currentSession)!;
        ctx.provider = match[2];
        ctx.model = match[3];
      }
      return;
    }

    match = line.match(RE_LLM_STEP);
    if (match) {
      const [, timestamp, sessionId, latencyStr, inputStr, outputStr] = match;
      const sessionCtx = this.sessions.get(sessionId) ?? {
        provider: this.currentProvider,
        model: this.currentModel,
        baseUrl: "",
      };

      const ts = new Date(timestamp.replace(" ", "T")).getTime();
      if (isNaN(ts)) return;

      const event: UsageEvent = {
        request_id: randomUUID(),
        ts,
        ts_end: null,
        provider: sessionCtx.provider,
        model: sessionCtx.model,
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

      if (this.options.db) {
        this.options.db.insertEvent(event);
      }
      this.options.onEvent?.(event);
    }
  }
}
