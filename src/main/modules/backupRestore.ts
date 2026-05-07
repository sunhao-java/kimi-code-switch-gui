import { dirname, join } from "node:path";

import {
  DEFAULT_CONFIG_PATH,
  PROFILE_FILENAME,
  buildPanelSettingsDocument,
  createLineDiff,
  loadAppState,
  normalizeStatePaths,
  parsePanelSettingsDocument,
} from "@shared/configStore";
import { buildConfigDoctorReport, redactDocumentText } from "@shared/configSafety";
import { normalizeShortcuts } from "@shared/shortcutStore";
import type {
  AppState,
  FileSnapshotBundle,
  ManagedFileId,
  PanelSettings,
  RestoreBackupResult,
  RestoreDryRunFilePlan,
  RestoreDryRunResult,
  SaveStateConflictResult,
} from "@shared/types";
import { fileAccess, resolveHome } from "./fileAccess";
import { detectExternalChangeConflict, resolveManagedPaths } from "./fileSnapshots";
import { buildWebDavUrl, getWebDavAuthHeader } from "./webdav";

const SHORTCUTS_BACKUP_FILENAME = "shortcuts.json";

export interface RestoreDocuments {
  configDocument: string;
  profilesDocument: string;
  panelSettingsDocument: string;
  mcpDocument: string;
}

export interface RestoreResolvedTargets {
  paths: Record<ManagedFileId, string>;
  documents: Record<ManagedFileId, string>;
  draftState: AppState;
}

export async function readBackupDocuments(state: AppState, backupName: string): Promise<RestoreDocuments> {
  const normalizedState = normalizeStatePaths(state);
  return normalizedState.panelSettings.backup_destination_type === "webdav"
    ? readWebDavBackupFiles(normalizedState, backupName)
    : readLocalBackupFiles(normalizedState, backupName);
}

export async function resolveRestoreTargets(state: AppState, backupName: string): Promise<RestoreResolvedTargets> {
  const normalizedState = normalizeStatePaths(state);
  const restoreDocuments = await readBackupDocuments(normalizedState, backupName);
  const restoredPanelSettings = parsePanelSettingsDocument(restoreDocuments.panelSettingsDocument);
  const configPath = restoredPanelSettings.config_path.trim() || DEFAULT_CONFIG_PATH;
  const profilesPath = resolveProfilesPathFromPanelSettings(configPath, restoredPanelSettings);
  const draftState = await loadAppState(createRestoreFileAccess({
    configPath,
    profilesPath,
    panelSettingsPath: normalizedState.panelSettingsPath,
    mcpConfigPath: normalizedState.mcpConfigPath,
    documents: restoreDocuments,
  }), {
    configPath,
    profilesPath,
    panelSettingsPath: normalizedState.panelSettingsPath,
    mcpConfigPath: normalizedState.mcpConfigPath,
  });

  return {
    paths: {
      config: resolveHome(configPath),
      profiles: resolveHome(profilesPath),
      panel: resolveHome(normalizedState.panelSettingsPath),
      mcp: resolveHome(normalizedState.mcpConfigPath),
    },
    documents: {
      config: restoreDocuments.configDocument,
      profiles: restoreDocuments.profilesDocument,
      panel: restoreDocuments.panelSettingsDocument,
      mcp: restoreDocuments.mcpDocument,
    },
    draftState,
  };
}

export async function buildRestoreDryRun(
  state: AppState,
  backupName: string,
  expectedSnapshot?: FileSnapshotBundle,
): Promise<RestoreDryRunResult | SaveStateConflictResult> {
  const resolved = await resolveRestoreTargets(state, backupName);
  const doctor = buildConfigDoctorReport(resolved.draftState);
  const conflictCheck = await detectExternalChangeConflict({
    expectedSnapshot,
    targetPaths: resolved.paths,
    draftDocuments: resolved.documents,
  });

  if (conflictCheck.conflict) {
    return {
      ok: false,
      reason: "external-change",
      snapshot: conflictCheck.snapshot,
      doctor,
      conflict: conflictCheck.conflict,
    };
  }

  const currentDocuments = await readCurrentDocuments(resolved.paths);
  return {
    backupName,
    doctor,
    filePlans: buildDryRunFilePlans(currentDocuments, resolved.documents, resolved.paths),
    warnings: doctor.issues
      .filter((issue) => issue.severity !== "info")
      .map((issue) => `${issue.scope}: ${issue.message}`),
  };
}

export async function restoreBackupSafely(options: {
  state: AppState;
  backupName: string;
  expectedSnapshot?: FileSnapshotBundle;
  allowOverwrite?: boolean;
  createBackupSnapshot: (state: AppState, trigger: "pre-restore" | "rollback") => Promise<{ backupName: string }>;
  loadRestoredState: (paths: { panelSettingsPath: string; mcpConfigPath: string }) => Promise<AppState>;
  onRestored: (state: AppState) => void;
  captureSnapshot: (state: AppState) => Promise<FileSnapshotBundle>;
}): Promise<RestoreBackupResult | SaveStateConflictResult> {
  const normalizedState = normalizeStatePaths(options.state);
  const resolved = await resolveRestoreTargets(normalizedState, options.backupName);
  const doctor = buildConfigDoctorReport(resolved.draftState);
  const conflictCheck = await detectExternalChangeConflict({
    expectedSnapshot: options.expectedSnapshot,
    targetPaths: resolved.paths,
    draftDocuments: resolved.documents,
  });

  if (conflictCheck.conflict && options.allowOverwrite !== true) {
    return {
      ok: false,
      reason: "external-change",
      snapshot: conflictCheck.snapshot,
      doctor,
      conflict: conflictCheck.conflict,
    };
  }

  const rollbackBackup = await options.createBackupSnapshot(normalizedState, "pre-restore");

  await Promise.all([
    fileAccess.ensureDir(dirname(resolved.paths.panel)),
    fileAccess.ensureDir(dirname(resolved.paths.config)),
    fileAccess.ensureDir(dirname(resolved.paths.profiles)),
    fileAccess.ensureDir(dirname(resolved.paths.mcp)),
  ]);

  await fileAccess.writeText(resolved.paths.panel, resolved.documents.panel);
  const persistedPanelSettings = parsePanelSettingsDocument(
    (await fileAccess.readText(resolved.paths.panel)) ?? buildPanelSettingsDocument(normalizedState.panelSettings),
  );
  const persistedConfigPath = resolveHome(persistedPanelSettings.config_path.trim() || DEFAULT_CONFIG_PATH);
  const persistedProfilesPath = resolveHome(resolveProfilesPathFromPanelSettings(persistedConfigPath, persistedPanelSettings));

  await Promise.all([
    fileAccess.ensureDir(dirname(persistedConfigPath)),
    fileAccess.ensureDir(dirname(persistedProfilesPath)),
    fileAccess.writeText(persistedConfigPath, resolved.documents.config),
    fileAccess.writeText(persistedProfilesPath, resolved.documents.profiles),
    fileAccess.writeText(resolved.paths.mcp, resolved.documents.mcp),
  ]);

  const restoredState = await options.loadRestoredState({
    panelSettingsPath: resolved.paths.panel,
    mcpConfigPath: resolved.paths.mcp,
  });
  options.onRestored(restoredState);

  return {
    ok: true,
    state: restoredState,
    snapshot: await options.captureSnapshot(restoredState),
    doctor: buildConfigDoctorReport(restoredState),
    rollbackBackupName: rollbackBackup.backupName,
  };
}

async function readCurrentDocuments(
  paths: Record<ManagedFileId, string>,
): Promise<Record<ManagedFileId, string>> {
  const [configDocument, profilesDocument, panelDocument, mcpDocument] = await Promise.all([
    fileAccess.readText(paths.config),
    fileAccess.readText(paths.profiles),
    fileAccess.readText(paths.panel),
    fileAccess.readText(paths.mcp),
  ]);

  return {
    config: configDocument ?? "",
    profiles: profilesDocument ?? "",
    panel: panelDocument ?? "",
    mcp: mcpDocument ?? "",
  };
}

function buildDryRunFilePlans(
  currentDocuments: Record<ManagedFileId, string>,
  nextDocuments: Record<ManagedFileId, string>,
  paths: Record<ManagedFileId, string>,
): RestoreDryRunFilePlan[] {
  return (Object.keys(paths) as ManagedFileId[]).map((id) => {
    const rawCurrent = currentDocuments[id] ?? "";
    const rawNext = nextDocuments[id] ?? "";
    const currentDocument = redactDocumentText(rawCurrent).text;
    const nextDocument = redactDocumentText(rawNext).text;

    return {
      id,
      path: paths[id],
      action: rawCurrent ? (rawCurrent === rawNext ? "unchanged" : "replace") : "create",
      currentDocument,
      nextDocument,
      diff: currentDocument === nextDocument ? "" : createLineDiff(currentDocument, nextDocument),
    };
  });
}

function createRestoreFileAccess(options: {
  configPath: string;
  profilesPath: string;
  panelSettingsPath: string;
  mcpConfigPath: string;
  documents: RestoreDocuments;
}): {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
} {
  const writes = new Map<string, string>([
    [resolveHome(options.configPath), options.documents.configDocument],
    [resolveHome(options.profilesPath), options.documents.profilesDocument],
    [resolveHome(options.panelSettingsPath), options.documents.panelSettingsDocument],
    [resolveHome(options.mcpConfigPath), options.documents.mcpDocument],
  ]);

  return {
    async readText(path: string): Promise<string | null> {
      const resolvedPath = resolveHome(path);
      if (writes.has(resolvedPath)) {
        return writes.get(resolvedPath) ?? null;
      }
      return null;
    },
    async writeText(path: string, content: string): Promise<void> {
      writes.set(resolveHome(path), content);
    },
    async ensureDir(): Promise<void> {
      return;
    },
  };
}

async function readLocalBackupFiles(state: AppState, backupName: string): Promise<RestoreDocuments> {
  const backupDirectory = join(resolveHome(state.panelSettings.backup_local_path), backupName);
  const [configDocument, profilesDocument, panelSettingsDocument, shortcutsDocument, mcpDocument] = await Promise.all([
    fileAccess.readText(join(backupDirectory, "config.toml")),
    fileAccess.readText(join(backupDirectory, "config.profiles.toml")),
    fileAccess.readText(join(backupDirectory, "config.panel.toml")),
    fileAccess.readText(join(backupDirectory, SHORTCUTS_BACKUP_FILENAME)),
    fileAccess.readText(join(backupDirectory, "mcp.json")),
  ]);

  return {
    configDocument: configDocument ?? "",
    profilesDocument: profilesDocument ?? "",
    panelSettingsDocument: mergeShortcutsBackupDocument(panelSettingsDocument ?? "", shortcutsDocument),
    mcpDocument: mcpDocument ?? "",
  };
}

async function readWebDavBackupFiles(state: AppState, backupName: string): Promise<RestoreDocuments> {
  const backupDirectoryUrl = buildWebDavUrl(state.panelSettings, [backupName]);

  const readRemoteText = async (filename: string): Promise<string | null> => {
    const response = await fetch(`${backupDirectoryUrl}/${encodeURIComponent(filename)}`, {
      method: "GET",
      headers: {
        Authorization: getWebDavAuthHeader(state.panelSettings),
      },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`WebDAV restore download failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  };

  const [configDocument, profilesDocument, panelSettingsDocument, shortcutsDocument, mcpDocument] = await Promise.all([
    readRemoteText("config.toml"),
    readRemoteText("config.profiles.toml"),
    readRemoteText("config.panel.toml"),
    readRemoteText(SHORTCUTS_BACKUP_FILENAME),
    readRemoteText("mcp.json"),
  ]);

  return {
    configDocument: configDocument ?? "",
    profilesDocument: profilesDocument ?? "",
    panelSettingsDocument: mergeShortcutsBackupDocument(panelSettingsDocument ?? "", shortcutsDocument),
    mcpDocument: mcpDocument ?? "",
  };
}

function mergeShortcutsBackupDocument(panelSettingsDocument: string, shortcutsDocument: string | null): string {
  if (!shortcutsDocument?.trim()) {
    return panelSettingsDocument;
  }

  try {
    const panelSettings = parsePanelSettingsDocument(panelSettingsDocument);
    panelSettings.shortcuts = normalizeShortcuts(JSON.parse(shortcutsDocument) as unknown);
    return buildPanelSettingsDocument(panelSettings);
  } catch {
    return panelSettingsDocument;
  }
}

function resolveProfilesPathFromPanelSettings(configPath: string, panelSettings: PanelSettings): string {
  if (panelSettings.follow_config_profiles) {
    return join(dirname(configPath), PROFILE_FILENAME);
  }
  return panelSettings.profiles_path.trim() || join(dirname(configPath), PROFILE_FILENAME);
}

export function getRestoreManagedPaths(state: AppState): Record<ManagedFileId, string> {
  return resolveManagedPaths(state);
}
