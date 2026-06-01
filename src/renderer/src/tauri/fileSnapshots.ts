// 文件指纹/快照（前端版，移植自 main/modules/fileSnapshots.ts）。
// sha256 用 Web Crypto；stat 用 Rust file_stat；读取用 fileAccess。
import { invoke } from "@tauri-apps/api/core";

import { createLineDiff, normalizeStatePaths } from "@shared/configStore";
import { redactDocumentText } from "@shared/configSafety";
import type {
  AppState,
  ExternalChangeConflict,
  ExternalChangeDetail,
  FileFingerprint,
  FileSnapshotBundle,
  ManagedFileId,
} from "@shared/types";

import { tauriFileAccess } from "./fileAccess";

interface FileStat {
  size: number;
  mtime_ms: number;
  ino: number;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function resolveManagedPaths(state: AppState): Record<ManagedFileId, string> {
  const s = normalizeStatePaths(state);
  return { config: s.configPath, profiles: s.profilesPath, panel: s.panelSettingsPath, mcp: s.mcpConfigPath };
}

export async function fingerprintFile(id: ManagedFileId, path: string): Promise<FileFingerprint> {
  const stat = await invoke<FileStat | null>("file_stat", { path });
  if (!stat) {
    return { id, path, exists: false, size: 0, mtimeMs: 0, sha256: "" };
  }
  const content = (await tauriFileAccess.readText(path)) ?? "";
  return { id, path, exists: true, size: stat.size, mtimeMs: stat.mtime_ms, sha256: await sha256Hex(content) };
}

export async function captureSnapshotForPaths(paths: Record<ManagedFileId, string>): Promise<FileSnapshotBundle> {
  const files = await Promise.all(
    (Object.entries(paths) as Array<[ManagedFileId, string]>).map(async ([id, path]) => [id, await fingerprintFile(id, path)] as const),
  );
  return {
    capturedAt: new Date().toISOString(),
    files: Object.fromEntries(files) as Record<ManagedFileId, FileFingerprint>,
  };
}

export async function captureSnapshotForState(state: AppState): Promise<FileSnapshotBundle> {
  return captureSnapshotForPaths(resolveManagedPaths(state));
}

export async function readManagedDocuments(paths: Record<ManagedFileId, string>): Promise<Partial<Record<ManagedFileId, string>>> {
  const entries = await Promise.all(
    (Object.entries(paths) as Array<[ManagedFileId, string]>).map(async ([id, path]) => [id, await tauriFileAccess.readText(path)] as const),
  );
  return Object.fromEntries(entries) as Partial<Record<ManagedFileId, string>>;
}

export function detectChangeReason(expected: FileFingerprint, actual: FileFingerprint): ExternalChangeDetail["reason"] | null {
  if (!expected.exists && actual.exists) return "created";
  if (expected.exists && !actual.exists) return "deleted";
  if (expected.exists && actual.exists && expected.sha256 !== actual.sha256) return "modified";
  return null;
}

export async function detectExternalChangeConflict(options: {
  expectedSnapshot?: FileSnapshotBundle;
  targetPaths: Record<ManagedFileId, string>;
  draftDocuments: Record<ManagedFileId, string>;
}): Promise<{ snapshot: FileSnapshotBundle; conflict: ExternalChangeConflict | null }> {
  const snapshot = await captureSnapshotForPaths(options.targetPaths);
  if (!options.expectedSnapshot) return { snapshot, conflict: null };

  const changedFiles: ExternalChangeDetail[] = [];
  for (const id of Object.keys(options.targetPaths) as ManagedFileId[]) {
    const expected = options.expectedSnapshot.files[id];
    const actual = snapshot.files[id];
    if (!expected || expected.path !== actual.path) continue;
    const reason = detectChangeReason(expected, actual);
    if (!reason) continue;
    const diskDocument = actual.exists ? (await tauriFileAccess.readText(actual.path)) ?? "" : "";
    const draftDocument = options.draftDocuments[id] ?? "";
    if (diskDocument === draftDocument) continue;
    const redactedDisk = redactDocumentText(diskDocument).text;
    const redactedDraft = redactDocumentText(draftDocument).text;
    changedFiles.push({
      id, path: actual.path, reason, expected, actual,
      diskDocument: redactedDisk, draftDocument: redactedDraft,
      diff: createLineDiff(redactedDisk, redactedDraft),
    });
  }
  return { snapshot, conflict: changedFiles.length ? { changedFiles } : null };
}
