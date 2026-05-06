import type { PanelSettings } from "@shared/types";

export function getWebDavAuthHeader(settings: PanelSettings): string {
  const credentials = `${settings.backup_webdav_username}:${settings.backup_webdav_password}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

export function getWebDavBaseUrl(settings: PanelSettings): string {
  const baseUrl = settings.backup_webdav_url.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("WebDAV URL is required.");
  }
  return baseUrl;
}

export function getWebDavPathSegments(settings: PanelSettings, additionalSegments: string[] = []): string[] {
  const segments = settings.backup_webdav_path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return [...segments, ...additionalSegments];
}

export function buildWebDavUrl(settings: PanelSettings, additionalSegments: string[] = []): string {
  const baseUrl = getWebDavBaseUrl(settings);
  const segments = getWebDavPathSegments(settings, additionalSegments).map(encodeURIComponent);
  return segments.length ? `${baseUrl}/${segments.join("/")}` : baseUrl;
}

export async function ensureWebDavCollection(settings: PanelSettings, additionalSegments: string[] = []): Promise<string> {
  let currentUrl = getWebDavBaseUrl(settings);
  const headers = new Headers({
    Authorization: getWebDavAuthHeader(settings),
  });

  for (const segment of getWebDavPathSegments(settings, additionalSegments)) {
    currentUrl = `${currentUrl}/${encodeURIComponent(segment)}`;
    const response = await fetch(currentUrl, {
      method: "MKCOL",
      headers,
    });
    if (![200, 201, 204, 301, 405].includes(response.status)) {
      throw new Error(`WebDAV MKCOL failed: ${response.status} ${response.statusText}`);
    }
  }

  return currentUrl;
}

export async function uploadWebDavFile(settings: PanelSettings, url: string, content: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
      "Content-Type": "application/octet-stream",
    },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`WebDAV upload failed: ${response.status} ${response.statusText}`);
  }
}

export async function deleteWebDavPath(settings: PanelSettings, url: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
    },
  });

  if (![200, 204, 404].includes(response.status)) {
    throw new Error(`WebDAV delete failed: ${response.status} ${response.statusText}`);
  }
}

export async function readWebDavManifest(settings: PanelSettings, manifestUrl: string): Promise<Array<{ name: string; createdAt: string }>> {
  const response = await fetch(manifestUrl, {
    method: "GET",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
    },
  });

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`WebDAV manifest read failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { backups?: Array<{ name?: string; createdAt?: string }> };
  return Array.isArray(payload.backups)
    ? payload.backups
      .filter((entry) => typeof entry.name === "string" && typeof entry.createdAt === "string")
      .map((entry) => ({ name: entry.name as string, createdAt: entry.createdAt as string }))
    : [];
}

export async function pruneWebDavBackups(
  settings: PanelSettings,
  manifestUrl: string,
  currentEntries: Array<{ name: string; createdAt: string }>,
): Promise<void> {
  const obsoleteEntries = [...currentEntries]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(settings.backup_retention_count);

  await Promise.all(
    obsoleteEntries.map((entry) => deleteWebDavPath(settings, buildWebDavUrl(settings, [entry.name]))),
  );

  const keptEntries = [...currentEntries]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, settings.backup_retention_count);

  await uploadWebDavFile(settings, manifestUrl, JSON.stringify({ backups: keptEntries }, null, 2));
}

export async function testWebDavConnection(settings: PanelSettings): Promise<{ ok: true; target: string }> {
  const target = buildWebDavUrl(settings);
  const response = await fetch(target, {
    method: "PROPFIND",
    headers: {
      Authorization: getWebDavAuthHeader(settings),
      Depth: "0",
    },
  });

  if (response.status === 404) {
    const ensuredTarget = await ensureWebDavCollection(settings);
    return {
      ok: true,
      target: ensuredTarget,
    };
  }

  if (!response.ok) {
    throw new Error(`WebDAV test failed: ${response.status} ${response.statusText}`);
  }

  return {
    ok: true,
    target,
  };
}
