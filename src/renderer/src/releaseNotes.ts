import changelog from "../../../CHANGELOG.md?raw";

export function extractReleaseNotes(version: string): string {
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
