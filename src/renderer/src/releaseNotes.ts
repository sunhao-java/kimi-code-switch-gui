import zhCN from "../../../CHANGELOGS/zh-CN.md?raw";
import zhTW from "../../../CHANGELOGS/zh-TW.md?raw";
import enUS from "../../../CHANGELOGS/en-US.md?raw";
import jaJP from "../../../CHANGELOGS/ja-JP.md?raw";
import deDE from "../../../CHANGELOGS/de-DE.md?raw";
import esES from "../../../CHANGELOGS/es-ES.md?raw";

import type { Locale } from "@shared/types";

const BUNDLED: Record<Locale, string> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": enUS,
  "ja-JP": jaJP,
  "de-DE": deDE,
  "es-ES": esES,
};

export function getBundledChangelog(locale: Locale): string {
  return BUNDLED[locale] ?? BUNDLED["en-US"];
}

export function extractReleaseNotes(changelog: string, version: string): string {
  const trimmed = version.trim().replace(/^v/i, "");
  if (!trimmed) {
    return "";
  }
  const normalized = changelog.replace(/\r\n/g, "\n");
  const headerPattern = new RegExp(`^## \\[${escapeRegExp(trimmed)}\\]`, "m");
  const start = normalized.search(headerPattern);
  if (start < 0) {
    return "";
  }
  const bodyStart = normalized.indexOf("\n", start) + 1;
  if (bodyStart <= 0) {
    return "";
  }
  const nextHeader = normalized.slice(bodyStart).search(/^## \[/m);
  const body = nextHeader < 0
    ? normalized.slice(bodyStart)
    : normalized.slice(bodyStart, bodyStart + nextHeader);
  return body.replace(/^\n+/, "").trimEnd();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
