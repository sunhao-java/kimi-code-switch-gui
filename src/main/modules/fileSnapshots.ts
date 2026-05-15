import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

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
import { resolveHome } from "./fileAccess";

export function resolveManagedPaths(state: AppState): Record<ManagedFileId, string> {
  const normalizedState = normalizeStatePaths(state);
  return {
    config: resolveHome(normalizedState.configPath),
    profiles: resolveHome(normalizedState.profilesPath),
    panel: resolveHome(normalizedState.panelSettingsPath),
    mcp: resolveHome(normalizedState.mcpConfigPath),
  };
}

export async function captureSnapshotForState(state: AppState): Promise<FileSnapshotBundle> {
  return captureSnapshotForPaths(resolveManagedPaths(state));
}

export async function captureSnapshotForPaths(paths: Record<ManagedFileId, string>): Promise<FileSnapshotBundle> {
  const files = await Promise.all(
    (Object.entries(paths) as Array<[ManagedFileId, string]>).map(async ([id, path]) => [
      id,
      await fingerprintFile(id, path),
    ]),
  );

  return {
    capturedAt: new Date().toISOString(),
    files: Object.fromEntries(files) as Record<ManagedFileId, FileFingerprint>,
  };
}

export async function readManagedDocuments(
  paths: Record<ManagedFileId, string>,
): Promise<Partial<Record<ManagedFileId, string>>> {
  const entries = await Promise.all(
    (Object.entries(paths) as Array<[ManagedFileId, string]>).map(async ([id, path]) => [id, await readTextIfExists(path)]),
  );
  return Object.fromEntries(entries) as Partial<Record<ManagedFileId, string>>;
}

export async function detectExternalChangeConflict(options: {
  expectedSnapshot?: FileSnapshotBundle;
  targetPaths: Record<ManagedFileId, string>;
  draftDocuments: Record<ManagedFileId, string>;
}): Promise<{
  snapshot: FileSnapshotBundle;
  conflict: ExternalChangeConflict | null;
}> {
  const snapshot = await captureSnapshotForPaths(options.targetPaths);
  if (!options.expectedSnapshot) {
    return { snapshot, conflict: null };
  }

  const changedFiles: ExternalChangeDetail[] = [];
  for (const id of Object.keys(options.targetPaths) as ManagedFileId[]) {
    const expected = options.expectedSnapshot.files[id];
    const actual = snapshot.files[id];
    if (!expected || expected.path !== actual.path) {
      continue;
    }

    const reason = detectChangeReason(expected, actual);
    if (!reason) {
      continue;
    }

    const diskDocument = actual.exists ? (await readTextIfExists(actual.path)) ?? "" : "";
    const draftDocument = options.draftDocuments[id] ?? "";
    if (diskDocument === draftDocument) {
      continue;
    }
    const redactedDisk = redactDocumentText(diskDocument).text;
    const redactedDraft = redactDocumentText(draftDocument).text;
    changedFiles.push({
      id,
      path: actual.path,
      reason,
      expected,
      actual,
      diskDocument: redactedDisk,
      draftDocument: redactedDraft,
      diff: createLineDiff(redactedDisk, redactedDraft),
    });
  }

  return {
    snapshot,
    conflict: changedFiles.length ? { changedFiles } : null,
  };
}

export async function fingerprintFile(id: ManagedFileId, path: string): Promise<FileFingerprint> {
  try {
    const [info, content] = await Promise.all([stat(path), readFile(path)]);
    return {
      id,
      path,
      exists: true,
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        id,
        path,
        exists: false,
        size: 0,
        mtimeMs: 0,
        sha256: "",
      };
    }
    throw error;
  }
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }
    throw error;
  }
}

export function detectChangeReason(
  expected: FileFingerprint,
  actual: FileFingerprint,
): ExternalChangeDetail["reason"] | null {
  if (!expected.exists && actual.exists) {
    return "created";
  }
  if (expected.exists && !actual.exists) {
    return "deleted";
  }
  if (expected.exists && actual.exists && expected.sha256 !== actual.sha256) {
    return "modified";
  }
  return null;
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
