// 备份/恢复（前端版，移植自 main/index.ts + backupRestore.ts）。
// 本地走 fileAccess，WebDAV 走 http_request。临时目录方案简化为直接写目标目录。
import { invoke } from "@tauri-apps/api/core";

import {
  buildConfigDocument,
  buildPanelSettingsDocument,
  buildProfilesDocument,
  loadAppState,
  normalizeStatePaths,
  parsePanelSettingsDocument,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildManagedDocuments, redactDocumentText } from "@shared/configSafety";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import { normalizeShortcuts } from "@shared/shortcutStore";
import { createLineDiff } from "@shared/configStore";
import type {
  AppState,
  BackupRecord,
  BackupResult,
  FileSnapshotBundle,
  ManagedFileId,
  RestoreBackupResult,
  RestoreDryRunResult,
  SaveStateConflictResult,
} from "@shared/types";

import { tauriFileAccess } from "./fileAccess";
import { captureSnapshotForState, detectExternalChangeConflict } from "./fileSnapshots";
import {
  buildWebDavUrl,
  deleteWebDavPath,
  downloadWebDavFile,
  ensureWebDavCollection,
  pruneWebDavBackups,
  readWebDavManifest,
  testWebDavConnection,
  uploadWebDavFile,
} from "./webdav";

const SHORTCUTS_BACKUP_FILENAME = "shortcuts.json";
const BACKUP_METADATA_FILENAME = "backup.meta.json";

function removeDir(path: string): Promise<void> {
  return invoke<void>("remove_dir", { path });
}
function listSubdirs(path: string): Promise<string[]> {
  return invoke<string[]>("list_subdirs", { path });
}
function hostname(): Promise<string> {
  return invoke<string>("hostname");
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}
function formatBackupStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}
function sanitizeMachineName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "") || "unknown-host";
}

function buildBackupFiles(state: AppState): Array<{ name: string; content: string }> {
  const s = normalizeStatePaths(state);
  return [
    { name: "config.toml", content: buildConfigDocument(s) },
    { name: "config.profiles.toml", content: buildProfilesDocument(s) },
    { name: "config.panel.json", content: JSON.stringify(s.panelSettings, null, 2) }, // SQLite 导出为 JSON
    { name: SHORTCUTS_BACKUP_FILENAME, content: JSON.stringify(normalizeShortcuts(s.panelSettings.shortcuts), null, 2) },
    { name: "mcp.json", content: buildMcpConfigDocument(s.mcpConfig) },
  ];
}

async function buildMetadata(state: AppState, backupName: string, trigger: string): Promise<string> {
  const s = normalizeStatePaths(state);
  return JSON.stringify({
    name: backupName,
    createdAt: new Date().toISOString(),
    trigger,
    sourceHost: sanitizeMachineName(await hostname()),
    paths: { config: s.configPath, profiles: s.profilesPath, panel: s.panelSettingsPath, mcp: s.mcpConfigPath },
  }, null, 2);
}

// ── 创建备份 ──
async function createLocalBackup(state: AppState, backupName: string, trigger: string): Promise<BackupResult> {
  const s = normalizeStatePaths(state);
  const backupRoot = s.panelSettings.backup_local_path;
  const dir = `${backupRoot}/${backupName}`;
  const files = buildBackupFiles(s);
  await tauriFileAccess.ensureDir(dir);
  for (const f of files) await tauriFileAccess.writeText(`${dir}/${f.name}`, f.content);
  await tauriFileAccess.writeText(`${dir}/${BACKUP_METADATA_FILENAME}`, await buildMetadata(s, backupName, trigger));

  // 轮转
  const subdirs = (await listSubdirs(backupRoot)).filter((n) => n.startsWith("backup-")).sort().reverse();
  for (const obsolete of subdirs.slice(s.panelSettings.backup_retention_count)) {
    await removeDir(`${backupRoot}/${obsolete}`);
  }
  return { ok: true, backupPath: dir, files: files.map((f) => `${dir}/${f.name}`) };
}

async function createWebDavBackup(state: AppState, backupName: string, trigger: string): Promise<BackupResult> {
  const s = normalizeStatePaths(state);
  const settings = s.panelSettings;
  const files = buildBackupFiles(s);
  const dirUrl = await ensureWebDavCollection(settings, [backupName]);
  for (const f of files) await uploadWebDavFile(settings, `${dirUrl}/${encodeURIComponent(f.name)}`, f.content);
  await uploadWebDavFile(settings, `${dirUrl}/${encodeURIComponent(BACKUP_METADATA_FILENAME)}`, await buildMetadata(s, backupName, trigger));

  const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
  const entries = await readWebDavManifest(settings, manifestUrl);
  const next = [...entries.filter((e) => e.name !== backupName), { name: backupName, createdAt: backupName }];
  await pruneWebDavBackups(settings, manifestUrl, next);
  return { ok: true, backupPath: dirUrl, files: files.map((f) => `${dirUrl}/${encodeURIComponent(f.name)}`) };
}

export async function createBackupSnapshot(state: AppState, trigger = "manual"): Promise<BackupResult & { backupName: string }> {
  const s = normalizeStatePaths(state);
  const backupName = `backup-${formatBackupStamp(new Date())}-${sanitizeMachineName(await hostname())}`;
  const result = s.panelSettings.backup_destination_type === "webdav"
    ? await createWebDavBackup(s, backupName, trigger)
    : await createLocalBackup(s, backupName, trigger);
  return { ...result, backupName };
}

export async function runBackup(state: AppState): Promise<BackupResult> {
  return createBackupSnapshot(state, "manual");
}

// ── 列表/删除 ──
export async function listBackups(state: AppState): Promise<BackupRecord[]> {
  const s = normalizeStatePaths(state);
  if (s.panelSettings.backup_destination_type === "webdav") {
    const settings = s.panelSettings;
    const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
    const entries = await readWebDavManifest(settings, manifestUrl);
    return entries
      .map((e) => ({ name: e.name, createdAt: e.createdAt, path: buildWebDavUrl(settings, [e.name]) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const backupRoot = s.panelSettings.backup_local_path;
  const subdirs = (await listSubdirs(backupRoot)).filter((n) => n.startsWith("backup-"));
  return subdirs
    .map((name) => ({ name, createdAt: name, path: `${backupRoot}/${name}` }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackup(state: AppState, backupName: string): Promise<{ ok: true }> {
  const s = normalizeStatePaths(state);
  if (s.panelSettings.backup_destination_type === "webdav") {
    const settings = s.panelSettings;
    const manifestUrl = `${await ensureWebDavCollection(settings)}/.kimi-backups.json`;
    const entries = await readWebDavManifest(settings, manifestUrl);
    await deleteWebDavPath(settings, buildWebDavUrl(settings, [backupName]));
    await uploadWebDavFile(settings, manifestUrl, JSON.stringify({ backups: entries.filter((e) => e.name !== backupName) }, null, 2));
  } else {
    await removeDir(`${s.panelSettings.backup_local_path}/${backupName}`);
  }
  return { ok: true };
}

export async function testBackupWebdav(state: AppState): Promise<{ ok: true; target: string }> {
  return testWebDavConnection(state.panelSettings);
}

// ── 读取备份文档 ──
interface RestoreDocuments {
  configDocument: string;
  profilesDocument: string;
  panelSettingsDocument: string;
  mcpDocument: string;
}

function mergeShortcuts(panelDoc: string, shortcutsDoc: string | null): string {
  if (!shortcutsDoc?.trim()) return panelDoc;
  try {
    const ps = parsePanelSettingsDocument(panelDoc);
    ps.shortcuts = normalizeShortcuts(JSON.parse(shortcutsDoc) as unknown);
    return buildPanelSettingsDocument(ps);
  } catch {
    return panelDoc;
  }
}

async function readBackupDocuments(state: AppState, backupName: string): Promise<RestoreDocuments> {
  const s = normalizeStatePaths(state);
  if (s.panelSettings.backup_destination_type === "webdav") {
    const dirUrl = buildWebDavUrl(s.panelSettings, [backupName]);
    const read = (n: string): Promise<string | null> => downloadWebDavFile(s.panelSettings, `${dirUrl}/${encodeURIComponent(n)}`);
    // 优先读取 JSON 格式，兼容旧 TOML 格式
    let pa = await read("config.panel.json");
    if (!pa) pa = await read("config.panel.toml");
    const [c, p, sh, m] = await Promise.all([read("config.toml"), read("config.profiles.toml"), read(SHORTCUTS_BACKUP_FILENAME), read("mcp.json")]);
    return { configDocument: c ?? "", profilesDocument: p ?? "", panelSettingsDocument: mergeShortcuts(pa ?? "", sh), mcpDocument: m ?? "" };
  }
  const dir = `${s.panelSettings.backup_local_path}/${backupName}`;
  const read = (n: string): Promise<string | null> => tauriFileAccess.readText(`${dir}/${n}`);
  // 优先读取 JSON 格式，兼容旧 TOML 格式
  let pa = await read("config.panel.json");
  if (!pa) pa = await read("config.panel.toml");
  const [c, p, sh, m] = await Promise.all([read("config.toml"), read("config.profiles.toml"), read(SHORTCUTS_BACKUP_FILENAME), read("mcp.json")]);
  return { configDocument: c ?? "", profilesDocument: p ?? "", panelSettingsDocument: mergeShortcuts(pa ?? "", sh), mcpDocument: m ?? "" };
}

function validate(docs: RestoreDocuments): void {
  if (!docs.configDocument.trim()) throw new Error("Backup is missing config.toml.");
  if (!docs.profilesDocument.trim()) throw new Error("Backup is missing config.profiles.toml.");
}

// 用内存 FileAccess 把备份文档喂给 loadAppState，得到 draftState
function memoryFileAccess(map: Record<string, string>): typeof tauriFileAccess {
  return {
    async readText(path: string) { return map[path] ?? null; },
    async writeText(path: string, content: string) { map[path] = content; },
    async ensureDir() { /* no-op */ },
  };
}

interface ResolvedTargets {
  paths: Record<ManagedFileId, string>;
  documents: Record<ManagedFileId, string>;
  draftState: AppState;
}

async function resolveRestoreTargets(state: AppState, backupName: string): Promise<ResolvedTargets> {
  const s = normalizeStatePaths(state);
  const docs = await readBackupDocuments(s, backupName);
  validate(docs);
  const restoredPanel = parsePanelSettingsDocument(docs.panelSettingsDocument);
  const panelDoc = buildPanelSettingsDocument({ ...restoredPanel, config_path: s.configPath, profiles_path: "", follow_config_profiles: true });
  const mem = memoryFileAccess({
    [s.configPath]: docs.configDocument,
    [s.profilesPath]: docs.profilesDocument,
    [s.panelSettingsPath]: panelDoc,
    [s.mcpConfigPath]: docs.mcpDocument,
  });
  const draftState = await loadAppState(mem, {
    configPath: s.configPath, profilesPath: s.profilesPath, panelSettingsPath: s.panelSettingsPath, mcpConfigPath: s.mcpConfigPath,
  });
  return {
    paths: { config: s.configPath, profiles: s.profilesPath, panel: s.panelSettingsPath, mcp: s.mcpConfigPath },
    documents: { config: docs.configDocument, profiles: docs.profilesDocument, panel: panelDoc, mcp: docs.mcpDocument },
    draftState,
  };
}

async function readCurrentDocuments(paths: Record<ManagedFileId, string>): Promise<Record<ManagedFileId, string>> {
  const [c, p, pa, m] = await Promise.all([
    tauriFileAccess.readText(paths.config), tauriFileAccess.readText(paths.profiles),
    tauriFileAccess.readText(paths.panel), tauriFileAccess.readText(paths.mcp),
  ]);
  return { config: c ?? "", profiles: p ?? "", panel: pa ?? "", mcp: m ?? "" };
}

export async function restoreBackupDryRun(state: AppState, backupName: string): Promise<RestoreDryRunResult | SaveStateConflictResult> {
  const resolved = await resolveRestoreTargets(state, backupName);
  const doctor = buildConfigDoctorReport(resolved.draftState);
  const current = await readCurrentDocuments(resolved.paths);
  const filePlans = (Object.keys(resolved.paths) as ManagedFileId[]).map((id) => {
    const rawCur = current[id] ?? "";
    const rawNext = resolved.documents[id] ?? "";
    const cur = redactDocumentText(rawCur).text;
    const next = redactDocumentText(rawNext).text;
    return {
      id, path: resolved.paths[id],
      action: (rawCur ? (rawCur === rawNext ? "unchanged" : "replace") : "create") as "unchanged" | "replace" | "create",
      currentDocument: cur, nextDocument: next,
      diff: cur === next ? "" : createLineDiff(cur, next),
    };
  });
  return {
    backupName, doctor, filePlans,
    warnings: doctor.issues.filter((i) => i.severity !== "info").map((i) => `${i.scope}: ${i.message}`),
  };
}

export async function restoreBackupSafe(
  state: AppState,
  backupName: string,
  options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
): Promise<RestoreBackupResult | SaveStateConflictResult> {
  const resolved = await resolveRestoreTargets(state, backupName);
  const doctor = buildConfigDoctorReport(resolved.draftState);

  if (options?.allowOverwrite !== true) {
    const expectedDocs = buildManagedDocuments(normalizeStatePaths(state));
    const conflict = await detectExternalChangeConflict({
      expectedSnapshot: options?.expectedSnapshot,
      targetPaths: resolved.paths,
      draftDocuments: resolved.documents,
    });
    if (conflict.conflict) {
      const changed = conflict.conflict.changedFiles.filter((f) => {
        const current = (resolved.documents[f.id] !== undefined);
        void current;
        return (expectedDocs[f.id] ?? "") !== "" || true;
      });
      if (changed.length > 0) {
        return { ok: false, reason: "external-change", snapshot: conflict.snapshot, doctor, conflict: { changedFiles: changed } };
      }
    }
  }

  // 恢复前先快照回滚备份
  const rollback = await createBackupSnapshot(state, "pre-restore");

  for (const id of Object.keys(resolved.paths) as ManagedFileId[]) {
    await tauriFileAccess.writeText(resolved.paths[id], resolved.documents[id]);
  }

  const restoredState = await loadAppState(tauriFileAccess, {
    configPath: resolved.paths.config, profilesPath: resolved.paths.profiles,
    panelSettingsPath: resolved.paths.panel, mcpConfigPath: resolved.paths.mcp,
  });

  return {
    ok: true,
    state: restoredState,
    snapshot: await captureSnapshotForState(restoredState),
    doctor: buildConfigDoctorReport(restoredState),
    rollbackBackupName: rollback.backupName,
  };
}

export async function restoreBackup(state: AppState, backupName: string): Promise<AppState> {
  const result = await restoreBackupSafe(state, backupName, { allowOverwrite: true });
  if (result.ok) return result.state;
  throw new Error(`Restore blocked: ${result.reason}`);
}
