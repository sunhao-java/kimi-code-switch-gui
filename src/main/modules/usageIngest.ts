import { readdir, stat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { UsageEvent } from "@shared/usageTypes";
import { resolveHome } from "./fileAccess";
import type { UsageDb } from "./usageDb";

export interface IngestStats {
  filesScanned: number;
  linesIngested: number;
  linesSkipped: number;
  filesRotated: number;
}

const BATCH_SIZE = 1000;
const MAX_LINE_BYTES = 1024 * 256;

export async function ingestPending(db: UsageDb, jsonlDir: string): Promise<IngestStats> {
  const stats: IngestStats = { filesScanned: 0, linesIngested: 0, linesSkipped: 0, filesRotated: 0 };
  const resolvedDir = resolveHome(jsonlDir);

  let entries: string[];
  try {
    entries = await readdir(resolvedDir);
  } catch {
    return stats;
  }

  const jsonlFiles = entries.filter((name) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();

  for (const name of jsonlFiles) {
    const filePath = join(resolvedDir, name);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }
    stats.filesScanned += 1;

    const signature = computeSignature(fileStat);
    const prev = db.getIngestState(filePath);
    let offset = prev?.byteOffset ?? 0;

    if (prev && prev.inodeSignature && prev.inodeSignature !== signature) {
      offset = 0;
      stats.filesRotated += 1;
    }

    if (offset >= fileStat.size) {
      db.setIngestState(filePath, fileStat.size, signature);
      continue;
    }

    const result = await readAndIngest(db, filePath, offset, fileStat.size);
    stats.linesIngested += result.inserted;
    stats.linesSkipped += result.skipped;
    db.setIngestState(filePath, result.endOffset, signature, result.skipped > 0 ? "partial" : "ok");
  }

  return stats;
}

async function readAndIngest(
  db: UsageDb,
  filePath: string,
  startOffset: number,
  fileSize: number,
): Promise<{ inserted: number; skipped: number; endOffset: number }> {
  const handle = await open(filePath, "r");
  let inserted = 0;
  let skipped = 0;
  let offset = startOffset;
  const batch: UsageEvent[] = [];

  try {
    const remaining = fileSize - startOffset;
    if (remaining <= 0) {
      return { inserted, skipped, endOffset: startOffset };
    }
    const buffer = Buffer.allocUnsafe(remaining);
    await handle.read(buffer, 0, remaining, startOffset);
    let lineStart = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] !== 0x0a) continue;
      const lineLength = i - lineStart;
      if (lineLength === 0) {
        offset = startOffset + i + 1;
        lineStart = i + 1;
        continue;
      }
      if (lineLength > MAX_LINE_BYTES) {
        skipped += 1;
        offset = startOffset + i + 1;
        lineStart = i + 1;
        continue;
      }
      const line = buffer.slice(lineStart, i).toString("utf-8").trim();
      if (line.length === 0) {
        offset = startOffset + i + 1;
        lineStart = i + 1;
        continue;
      }
      const event = parseEventLine(line);
      if (event) {
        batch.push(event);
        if (batch.length >= BATCH_SIZE) {
          inserted += db.insertEventsBatch(batch);
          batch.length = 0;
        }
      } else {
        skipped += 1;
      }
      offset = startOffset + i + 1;
      lineStart = i + 1;
    }
    if (batch.length > 0) {
      inserted += db.insertEventsBatch(batch);
      batch.length = 0;
    }
  } finally {
    await handle.close();
  }

  return { inserted, skipped, endOffset: offset };
}

function parseEventLine(line: string): UsageEvent | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const requestId = typeof raw.request_id === "string" ? raw.request_id : null;
  const ts = typeof raw.ts === "number" ? raw.ts : null;
  const profile = typeof raw.profile === "string" ? raw.profile : null;
  const provider = typeof raw.provider === "string" ? raw.provider : null;
  const model = typeof raw.model === "string" ? raw.model : null;
  if (!requestId || ts === null || profile === null || provider === null || model === null) {
    return null;
  }

  return {
    request_id: requestId,
    ts,
    ts_end: typeof raw.ts_end === "number" ? raw.ts_end : null,
    profile,
    provider,
    model,
    prompt_tokens: numberOr(raw.prompt_tokens, 0),
    completion_tokens: numberOr(raw.completion_tokens, 0),
    cache_read_tokens: numberOr(raw.cache_read_tokens, 0),
    cache_creation_tokens: numberOr(raw.cache_creation_tokens, 0),
    reasoning_tokens: numberOr(raw.reasoning_tokens, 0),
    latency_ms: numberOr(raw.latency_ms, 0),
    proxy_overhead_ms: numberOr(raw.proxy_overhead_ms, 0),
    error_code: typeof raw.error_code === "string" ? raw.error_code : null,
    error_message:
      typeof raw.error_message === "string" ? raw.error_message.slice(0, 256) : null,
    http_status: numberOr(raw.http_status, 0),
    session_hint: typeof raw.session_hint === "string" ? raw.session_hint : null,
    cost_estimate: typeof raw.cost_estimate === "number" ? raw.cost_estimate : null,
    pricing_version: typeof raw.pricing_version === "string" ? raw.pricing_version : null,
    metadata_json: raw.metadata !== undefined ? JSON.stringify(raw.metadata) : null,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function computeSignature(fileStat: { ino: number; size: number; mtimeMs: number }): string {
  const hash = createHash("sha1");
  hash.update(`${fileStat.ino}:${fileStat.size}:${Math.floor(fileStat.mtimeMs)}`);
  return hash.digest("hex").slice(0, 16);
}
