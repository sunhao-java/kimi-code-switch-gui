import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";

const execFileAsync = promisify(execFile);
const GITHUB_RELEASES_LATEST_URL = "https://api.github.com/repos/sunhao-java/kimi-code-switch-gui/releases/latest";
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

export async function checkForUpdates(getCliEnv: () => NodeJS.ProcessEnv): Promise<UpdateCheckResult> {
  const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "kimi-code-switch-gui",
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("GitHub API rate limit exceeded. Please open the GitHub Releases page and check manually.");
    }

    throw new Error(`GitHub release check failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
  };
  const currentVersion = app.getVersion();
  const latestVersion = normalizeReleaseVersion(payload.tag_name ?? currentVersion);
  const installSource = await detectInstallSource(getCliEnv);
  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareReleaseVersions(latestVersion, currentVersion) > 0,
    releaseUrl: payload.html_url ?? "https://github.com/sunhao-java/kimi-code-switch-gui/releases",
    releaseName: payload.name?.trim() || payload.tag_name?.trim() || `v${latestVersion}`,
    publishedAt: payload.published_at ?? "",
    homebrewCommand: HOMEBREW_UPGRADE_COMMAND,
    installSource,
  };
}
