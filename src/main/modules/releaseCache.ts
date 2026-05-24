import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { DEFAULT_PANEL_DIRECTORY } from "@shared/configStore";
import { resolveHome } from "./fileAccess";

const CACHE_PATH = `${DEFAULT_PANEL_DIRECTORY}/release-cache.json`;
const CACHE_VERSION = 1;

export interface CachedReleaseNote {
  body: string;
  name: string;
  publishedAt: string;
  releaseUrl: string;
  fetchedAt: number;
}

export interface ReleaseCacheData {
  cacheVersion: number;
  etag: string | null;
  latestVersion: string | null;
  latestFetchedAt: number;
  notesByVersion: Record<string, CachedReleaseNote>;
}

function emptyCache(): ReleaseCacheData {
  return {
    cacheVersion: CACHE_VERSION,
    etag: null,
    latestVersion: null,
    latestFetchedAt: 0,
    notesByVersion: {},
  };
}

export async function readReleaseCache(): Promise<ReleaseCacheData> {
  const path = resolveHome(CACHE_PATH);
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ReleaseCacheData>;
    if (parsed.cacheVersion !== CACHE_VERSION || typeof parsed.notesByVersion !== "object" || parsed.notesByVersion === null) {
      return emptyCache();
    }
    return {
      cacheVersion: CACHE_VERSION,
      etag: typeof parsed.etag === "string" ? parsed.etag : null,
      latestVersion: typeof parsed.latestVersion === "string" ? parsed.latestVersion : null,
      latestFetchedAt: typeof parsed.latestFetchedAt === "number" ? parsed.latestFetchedAt : 0,
      notesByVersion: parsed.notesByVersion as Record<string, CachedReleaseNote>,
    };
  } catch {
    return emptyCache();
  }
}

export async function writeReleaseCache(data: ReleaseCacheData): Promise<void> {
  const path = resolveHome(CACHE_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...data, cacheVersion: CACHE_VERSION }, null, 2)}\n`, "utf-8");
}

export function upsertReleaseNote(
  data: ReleaseCacheData,
  version: string,
  note: CachedReleaseNote,
): ReleaseCacheData {
  return {
    ...data,
    notesByVersion: { ...data.notesByVersion, [version]: note },
  };
}
