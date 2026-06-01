// WebDAV 备份（前端版，移植自 main/modules/webdav.ts）。
// 标准 fetch 不支持 MKCOL/PROPFIND，故通过 Rust http_request 发请求。
import { invoke } from "@tauri-apps/api/core";

import type { PanelSettings } from "@shared/types";

interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

function http(method: string, url: string, headers?: Record<string, string>, body?: string): Promise<HttpResponse> {
  return invoke<HttpResponse>("http_request", { method, url, headers: headers ?? null, body: body ?? null });
}

export function getWebDavAuthHeader(settings: PanelSettings): string {
  const credentials = `${settings.backup_webdav_username}:${settings.backup_webdav_password}`;
  return `Basic ${btoa(credentials)}`;
}

export function getWebDavBaseUrl(settings: PanelSettings): string {
  const baseUrl = settings.backup_webdav_url.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("WebDAV URL is required.");
  return baseUrl;
}

export function getWebDavPathSegments(settings: PanelSettings, additional: string[] = []): string[] {
  const segments = settings.backup_webdav_path.split("/").map((s) => s.trim()).filter(Boolean);
  return [...segments, ...additional];
}

export function buildWebDavUrl(settings: PanelSettings, additional: string[] = []): string {
  const baseUrl = getWebDavBaseUrl(settings);
  const segments = getWebDavPathSegments(settings, additional).map(encodeURIComponent);
  return segments.length ? `${baseUrl}/${segments.join("/")}` : baseUrl;
}

export async function ensureWebDavCollection(settings: PanelSettings, additional: string[] = []): Promise<string> {
  let currentUrl = getWebDavBaseUrl(settings);
  const headers = { Authorization: getWebDavAuthHeader(settings) };
  for (const segment of getWebDavPathSegments(settings, additional)) {
    currentUrl = `${currentUrl}/${encodeURIComponent(segment)}`;
    const resp = await http("MKCOL", currentUrl, headers);
    if (![200, 201, 204, 301, 405].includes(resp.status)) {
      throw new Error(`WebDAV MKCOL failed: ${resp.status}`);
    }
  }
  return currentUrl;
}

export async function uploadWebDavFile(settings: PanelSettings, url: string, content: string): Promise<void> {
  const resp = await http("PUT", url, {
    Authorization: getWebDavAuthHeader(settings),
    "Content-Type": "application/octet-stream",
  }, content);
  if (!resp.ok) throw new Error(`WebDAV upload failed: ${resp.status}`);
}

export async function deleteWebDavPath(settings: PanelSettings, url: string): Promise<void> {
  const resp = await http("DELETE", url, { Authorization: getWebDavAuthHeader(settings) });
  if (![200, 204, 404].includes(resp.status)) throw new Error(`WebDAV delete failed: ${resp.status}`);
}

export async function readWebDavManifest(settings: PanelSettings, manifestUrl: string): Promise<Array<{ name: string; createdAt: string }>> {
  const resp = await http("GET", manifestUrl, { Authorization: getWebDavAuthHeader(settings) });
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`WebDAV manifest read failed: ${resp.status}`);
  const payload = JSON.parse(resp.body) as { backups?: Array<{ name?: string; createdAt?: string }> };
  return Array.isArray(payload.backups)
    ? payload.backups
        .filter((e) => typeof e.name === "string" && typeof e.createdAt === "string")
        .map((e) => ({ name: e.name as string, createdAt: e.createdAt as string }))
    : [];
}

export async function downloadWebDavFile(settings: PanelSettings, url: string): Promise<string | null> {
  const resp = await http("GET", url, { Authorization: getWebDavAuthHeader(settings) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`WebDAV download failed: ${resp.status}`);
  return resp.body;
}

export async function pruneWebDavBackups(
  settings: PanelSettings,
  manifestUrl: string,
  currentEntries: Array<{ name: string; createdAt: string }>,
): Promise<void> {
  const sorted = [...currentEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const obsolete = sorted.slice(settings.backup_retention_count);
  await Promise.all(obsolete.map((e) => deleteWebDavPath(settings, buildWebDavUrl(settings, [e.name]))));
  const kept = sorted.slice(0, settings.backup_retention_count);
  await uploadWebDavFile(settings, manifestUrl, JSON.stringify({ backups: kept }, null, 2));
}

export async function testWebDavConnection(settings: PanelSettings): Promise<{ ok: true; target: string }> {
  const target = buildWebDavUrl(settings);
  const resp = await http("PROPFIND", target, { Authorization: getWebDavAuthHeader(settings), Depth: "0" });
  if (resp.status === 404) {
    const ensured = await ensureWebDavCollection(settings);
    return { ok: true, target: ensured };
  }
  if (!resp.ok) throw new Error(`WebDAV test failed: ${resp.status}`);
  return { ok: true, target };
}
