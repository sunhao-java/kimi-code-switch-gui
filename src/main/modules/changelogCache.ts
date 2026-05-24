import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DEFAULT_PANEL_DIRECTORY } from "@shared/configStore";
import { resolveHome } from "./fileAccess";

const CACHE_DIR = `${DEFAULT_PANEL_DIRECTORY}/changelog-cache`;
const STATE_PATH = `${CACHE_DIR}/state.json`;
const RAW_URL = (locale: string): string =>
  `https://raw.githubusercontent.com/sunhao-java/kimi-code-switch-gui/master/CHANGELOGS/${locale}.md`;

const LOCALES = ["zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE", "es-ES"] as const;

interface CacheState {
  fetchedForVersion: string;
  fetchedAt: number;
}

async function readState(): Promise<CacheState | null> {
  try {
    const raw = await readFile(resolveHome(STATE_PATH), "utf-8");
    const parsed = JSON.parse(raw) as Partial<CacheState>;
    if (typeof parsed.fetchedForVersion === "string") {
      return {
        fetchedForVersion: parsed.fetchedForVersion,
        fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeState(state: CacheState): Promise<void> {
  const path = resolveHome(STATE_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function fetchLocale(locale: string): Promise<string | null> {
  try {
    const response = await fetch(RAW_URL(locale), {
      method: "GET",
      headers: {
        Accept: "text/plain, text/markdown, */*",
        "User-Agent": "kimi-code-switch-gui",
      },
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function readCachedChangelog(locale: string): Promise<string | null> {
  try {
    const path = resolveHome(`${CACHE_DIR}/${locale}.md`);
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function maybeRefreshChangelogCache(): Promise<{ refreshed: boolean; locales: string[] }> {
  const currentVersion = app.getVersion();
  const state = await readState();
  if (state && state.fetchedForVersion === currentVersion) {
    return { refreshed: false, locales: [] };
  }
  const refreshed: string[] = [];
  await Promise.all(
    LOCALES.map(async (locale) => {
      const body = await fetchLocale(locale);
      if (!body) {
        return;
      }
      const cachePath = resolveHome(`${CACHE_DIR}/${locale}.md`);
      try {
        await mkdir(dirname(cachePath), { recursive: true });
        await writeFile(cachePath, body, "utf-8");
        refreshed.push(locale);
      } catch (err) {
        console.error("write changelog cache failed", locale, err);
      }
    }),
  );
  // even if some locales failed, mark the version as attempted so we don't retry every launch
  await writeState({ fetchedForVersion: currentVersion, fetchedAt: Date.now() }).catch((err) => {
    console.error("write changelog cache state failed", err);
  });
  return { refreshed: refreshed.length > 0, locales: refreshed };
}
