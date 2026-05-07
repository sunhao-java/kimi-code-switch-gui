import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";

const execFileAsync = promisify(execFile);
const GITHUB_RELEASES_LATEST_URL = "https://api.github.com/repos/sunhao-java/kimi-code-switch-gui/releases/latest";
const GITHUB_RELEASES_PAGE_URL = "https://github.com/sunhao-java/kimi-code-switch-gui/releases";
const GITHUB_RELEASES_LATEST_PAGE_URL = `${GITHUB_RELEASES_PAGE_URL}/latest`;
const HOMEBREW_UPGRADE_COMMAND = "brew upgrade --cask kimi-code-switch-gui";

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
  homebrewCommand: string;
  installSource: "homebrew" | "manual" | "development";
};

type ReleaseLookupResult = {
  latestVersion: string;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
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

async function loadLatestReleaseFromApi(): Promise<ReleaseLookupResult> {
  const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "kimi-code-switch-gui",
    },
  });

  if (!response.ok) {
    throw getReleaseLookupError(response);
  }

  const payload = await response.json() as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
  };
  const latestVersion = normalizeReleaseVersion(payload.tag_name ?? "");
  if (!latestVersion) {
    throw new Error("GitHub release check failed: invalid latest release tag.");
  }

  return {
    latestVersion,
    releaseUrl: payload.html_url ?? GITHUB_RELEASES_PAGE_URL,
    releaseName: payload.name?.trim() || payload.tag_name?.trim() || `v${latestVersion}`,
    publishedAt: payload.published_at ?? "",
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
    publishedAt: "",
  };
}

async function loadLatestRelease(): Promise<ReleaseLookupResult> {
  try {
    return await loadLatestReleaseFromApi();
  } catch (apiError) {
    try {
      return await loadLatestReleaseFromPage();
    } catch {
      throw apiError;
    }
  }
}

export async function checkForUpdates(getCliEnv: () => NodeJS.ProcessEnv): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const release = await loadLatestRelease();
  const installSource = await detectInstallSource(getCliEnv);
  return {
    currentVersion,
    latestVersion: release.latestVersion,
    hasUpdate: compareReleaseVersions(release.latestVersion, currentVersion) > 0,
    releaseUrl: release.releaseUrl,
    releaseName: release.releaseName,
    publishedAt: release.publishedAt,
    homebrewCommand: HOMEBREW_UPGRADE_COMMAND,
    installSource,
  };
}
