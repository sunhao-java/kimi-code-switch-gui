import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";
import {
  readReleaseCache,
  upsertReleaseNote,
  writeReleaseCache,
  type CachedReleaseNote,
  type ReleaseCacheData,
} from "./releaseCache";

const execFileAsync = promisify(execFile);
const GITHUB_RELEASES_LATEST_URL = "https://api.github.com/repos/sunhao-java/kimi-code-switch-gui/releases/latest";
const GITHUB_RELEASES_PAGE_URL = "https://github.com/sunhao-java/kimi-code-switch-gui/releases";
const GITHUB_RELEASES_LATEST_PAGE_URL = `${GITHUB_RELEASES_PAGE_URL}/latest`;
const HOMEBREW_UPGRADE_COMMAND = "brew upgrade --cask kimi-code-switch-gui";
const GITHUB_RELEASE_BY_TAG_URL = (tag: string): string =>
  `https://api.github.com/repos/sunhao-java/kimi-code-switch-gui/releases/tags/${encodeURIComponent(tag)}`;

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string;
  releaseBody: string;
  publishedAt: string;
  homebrewCommand: string;
  installSource: "homebrew" | "manual" | "development";
};

type ReleaseLookupResult = {
  latestVersion: string;
  releaseUrl: string;
  releaseName: string;
  releaseBody: string;
  publishedAt: string;
  etag: string | null;
};

export async function detectInstallSource(getCliEnv: () => NodeJS.ProcessEnv): Promise<UpdateCheckResult["installSource"]> {
  if (!app.isPackaged) {
    return "development";
  }

  try {
    await execFileAsync("brew", ["list", "--cask", "kimi-code-switch-gui"], {
      env: getCliEnv(),
    });
    return "homebrew";
  } catch {
    return "manual";
  }
}

function getReleaseLookupError(response: Response): Error {
  if (response.status === 403 || response.status === 429) {
    return new Error("GitHub API rate limit exceeded. Please open the GitHub Releases page and check manually.");
  }

  return new Error(`GitHub release check failed: ${response.status} ${response.statusText}`);
}

async function loadLatestReleaseFromApi(etag: string | null): Promise<{ result: ReleaseLookupResult | null; notModified: boolean }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kimi-code-switch-gui",
  };
  if (etag) {
    headers["If-None-Match"] = etag;
  }

  const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
    method: "GET",
    headers,
  });

  if (response.status === 304) {
    return { result: null, notModified: true };
  }

  if (!response.ok) {
    throw getReleaseLookupError(response);
  }

  const payload = await response.json() as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
    body?: string;
  };
  const latestVersion = normalizeReleaseVersion(payload.tag_name ?? "");
  if (!latestVersion) {
    throw new Error("GitHub release check failed: invalid latest release tag.");
  }

  return {
    notModified: false,
    result: {
      latestVersion,
      releaseUrl: payload.html_url ?? GITHUB_RELEASES_PAGE_URL,
      releaseName: payload.name?.trim() || payload.tag_name?.trim() || `v${latestVersion}`,
      releaseBody: typeof payload.body === "string" ? payload.body : "",
      publishedAt: payload.published_at ?? "",
      etag: response.headers.get("etag"),
    },
  };
}

function parseLatestReleaseTag(releaseUrl: string): string {
  const matched = releaseUrl.match(/\/releases\/tag\/([^/?#]+)/);
  return normalizeReleaseVersion(matched?.[1] ?? "");
}

async function loadLatestReleaseFromPage(): Promise<ReleaseLookupResult> {
  const response = await fetch(GITHUB_RELEASES_LATEST_PAGE_URL, {
    method: "GET",
    headers: {
      "User-Agent": "kimi-code-switch-gui",
    },
    redirect: "manual",
  });

  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`GitHub release page fallback failed: ${response.status} ${response.statusText}`);
  }

  const releaseUrl = new URL(location, GITHUB_RELEASES_PAGE_URL).toString();
  const latestVersion = parseLatestReleaseTag(releaseUrl);
  if (!latestVersion) {
    throw new Error("GitHub release page fallback failed: invalid release redirect URL.");
  }

  return {
    latestVersion,
    releaseUrl,
    releaseName: `v${latestVersion}`,
    releaseBody: "",
    publishedAt: "",
    etag: null,
  };
}

async function fetchReleaseBodyByTag(tag: string): Promise<Pick<ReleaseLookupResult, "releaseBody" | "releaseUrl" | "releaseName" | "publishedAt"> | null> {
  try {
    const response = await fetch(GITHUB_RELEASE_BY_TAG_URL(`v${tag.replace(/^v/i, "")}`), {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "kimi-code-switch-gui",
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as {
      name?: string;
      html_url?: string;
      published_at?: string;
      body?: string;
      tag_name?: string;
    };
    return {
      releaseBody: typeof payload.body === "string" ? payload.body : "",
      releaseUrl: payload.html_url ?? GITHUB_RELEASES_PAGE_URL,
      releaseName: payload.name?.trim() || payload.tag_name?.trim() || `v${tag}`,
      publishedAt: payload.published_at ?? "",
    };
  } catch {
    return null;
  }
}

function cacheToNote(result: ReleaseLookupResult): CachedReleaseNote {
  return {
    body: result.releaseBody,
    name: result.releaseName,
    publishedAt: result.publishedAt,
    releaseUrl: result.releaseUrl,
    fetchedAt: Date.now(),
  };
}

function noteToResult(version: string, note: CachedReleaseNote): ReleaseLookupResult {
  return {
    latestVersion: version,
    releaseUrl: note.releaseUrl,
    releaseName: note.name,
    releaseBody: note.body,
    publishedAt: note.publishedAt,
    etag: null,
  };
}

async function loadLatestRelease(cache: ReleaseCacheData): Promise<{ result: ReleaseLookupResult; nextCache: ReleaseCacheData }> {
  let workingCache = cache;
  try {
    const { result, notModified } = await loadLatestReleaseFromApi(cache.etag);
    if (notModified && cache.latestVersion) {
      const cachedNote = cache.notesByVersion[cache.latestVersion];
      if (cachedNote) {
        workingCache = { ...workingCache, latestFetchedAt: Date.now() };
        return { result: noteToResult(cache.latestVersion, cachedNote), nextCache: workingCache };
      }
    }
    if (result) {
      workingCache = {
        ...workingCache,
        etag: result.etag,
        latestVersion: result.latestVersion,
        latestFetchedAt: Date.now(),
      };
      workingCache = upsertReleaseNote(workingCache, result.latestVersion, cacheToNote(result));
      return { result, nextCache: workingCache };
    }
  } catch (apiError) {
    // try page fallback below, then fall back to cache if still failing
    try {
      const fallback = await loadLatestReleaseFromPage();
      if (cache.notesByVersion[fallback.latestVersion]?.body) {
        const cached = cache.notesByVersion[fallback.latestVersion];
        workingCache = { ...workingCache, latestVersion: fallback.latestVersion, latestFetchedAt: Date.now() };
        return { result: { ...fallback, releaseBody: cached.body, publishedAt: cached.publishedAt }, nextCache: workingCache };
      }
      const body = await fetchReleaseBodyByTag(fallback.latestVersion);
      const enriched: ReleaseLookupResult = body
        ? { ...fallback, releaseBody: body.releaseBody, publishedAt: body.publishedAt, releaseUrl: body.releaseUrl, releaseName: body.releaseName }
        : fallback;
      workingCache = {
        ...workingCache,
        latestVersion: enriched.latestVersion,
        latestFetchedAt: Date.now(),
      };
      if (enriched.releaseBody) {
        workingCache = upsertReleaseNote(workingCache, enriched.latestVersion, cacheToNote(enriched));
      }
      return { result: enriched, nextCache: workingCache };
    } catch {
      if (cache.latestVersion && cache.notesByVersion[cache.latestVersion]) {
        return {
          result: noteToResult(cache.latestVersion, cache.notesByVersion[cache.latestVersion]),
          nextCache: workingCache,
        };
      }
      throw apiError;
    }
  }
  throw new Error("GitHub release check failed: no usable response.");
}

export async function checkForUpdates(getCliEnv: () => NodeJS.ProcessEnv): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const cache = await readReleaseCache();
  const { result: release, nextCache } = await loadLatestRelease(cache);
  await writeReleaseCache(nextCache).catch((err) => {
    console.error("write release cache failed", err);
  });
  const installSource = await detectInstallSource(getCliEnv);
  return {
    currentVersion,
    latestVersion: release.latestVersion,
    hasUpdate: compareReleaseVersions(release.latestVersion, currentVersion) > 0,
    releaseUrl: release.releaseUrl,
    releaseName: release.releaseName,
    releaseBody: release.releaseBody,
    publishedAt: release.publishedAt,
    homebrewCommand: HOMEBREW_UPGRADE_COMMAND,
    installSource,
  };
}
