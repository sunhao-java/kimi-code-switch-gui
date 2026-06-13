import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState } from "@shared/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// Shared business logic is exercised elsewhere; here we isolate backup.ts orchestration.
vi.mock("@shared/configStore", () => ({
  normalizeStatePaths: (s: AppState) => s,
  buildConfigDocument: () => "config-doc",
  buildProfilesDocument: () => "profiles-doc",
  buildPanelSettingsDocument: () => "panel-doc",
  parsePanelSettingsDocument: () => ({ shortcuts: [] }),
  loadAppState: vi.fn(async () => ({ tag: "loaded" })),
  createLineDiff: () => "diff",
}));
vi.mock("@shared/configSafety", () => ({
  buildConfigDoctorReport: () => ({ ok: true, generatedAt: "", issues: [], errorCount: 0, warningCount: 0, infoCount: 0 }),
  buildManagedDocuments: () => ({ config: "", panel: "", mcp: "" }),
  redactDocumentText: (t: string) => ({ text: t }),
}));
vi.mock("@shared/mcpStore", () => ({ buildMcpConfigDocument: () => "mcp-doc" }));
vi.mock("@shared/shortcutStore", () => ({ normalizeShortcuts: () => [] }));

// Mock factories must be self-contained (hoisted), so the mock surfaces are created inside
// the factory and the live references are pulled back via vi.mocked() after the imports.
vi.mock("./fileAccess", () => ({
  tauriFileAccess: {
    readText: vi.fn(async () => "current-doc"),
    writeText: vi.fn(async () => undefined),
    ensureDir: vi.fn(async () => undefined),
  },
}));
vi.mock("./fileSnapshots", () => ({
  captureSnapshotForState: vi.fn(async () => ({ capturedAt: "now", files: {} })),
  detectExternalChangeConflict: vi.fn(async () => ({ conflict: null, snapshot: { capturedAt: "now", files: {} } })),
}));
vi.mock("./panelSettingsStore", () => ({
  importPanelSettings: vi.fn(async () => true),
}));
vi.mock("./webdav", () => ({
  buildWebDavUrl: vi.fn((_s: unknown, extra: string[] = []) => `https://dav/${extra.join("/")}`),
  deleteWebDavPath: vi.fn(async () => undefined),
  downloadWebDavFile: vi.fn(async () => "remote-doc"),
  ensureWebDavCollection: vi.fn(async (_s: unknown, extra: string[] = []) => `https://dav/${extra.join("/")}`),
  pruneWebDavBackups: vi.fn(async () => undefined),
  readWebDavManifest: vi.fn(async () => [] as Array<{ name: string; createdAt: string }>),
  testWebDavConnection: vi.fn(async () => ({ ok: true, target: "https://dav" })),
  uploadWebDavFile: vi.fn(async () => undefined),
}));

import { invoke } from "@tauri-apps/api/core";
import { tauriFileAccess } from "./fileAccess";
import { captureSnapshotForState, detectExternalChangeConflict } from "./fileSnapshots";
import { importPanelSettings } from "./panelSettingsStore";
import * as webdavMod from "./webdav";
import {
  createBackupSnapshot,
  deleteBackup,
  listBackups,
  restoreBackupSafe,
  testBackupWebdav,
} from "./backup";

const mockedInvoke = vi.mocked(invoke);
const fa = vi.mocked(tauriFileAccess);
const webdav = vi.mocked(webdavMod);
const mockedDetectConflict = vi.mocked(detectExternalChangeConflict);
const mockedImportPanelSettings = vi.mocked(importPanelSettings);
void captureSnapshotForState;

function state(destination: "local" | "webdav"): AppState {
  return {
    configPath: "/cfg/config.toml",
    profilesPath: "/cfg/config.profiles.toml",
    panelSettingsPath: "/cfg/config.panel.toml",
    mcpConfigPath: "/cfg/mcp.json",
    panelSettings: {
      backup_destination_type: destination,
      backup_local_path: "/backups",
      backup_retention_count: 2,
      shortcuts: [],
      backup_webdav_url: "https://dav",
      backup_webdav_username: "u",
      backup_webdav_password: "p",
      backup_webdav_path: "/k",
    },
  } as unknown as AppState;
}

beforeEach(() => {
  vi.clearAllMocks();
  // hostname / list_subdirs / remove_dir all flow through invoke
  mockedInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "hostname") return "My-Laptop" as never;
    if (cmd === "list_subdirs") return [] as never;
    return undefined as never;
  });
  fa.readText.mockResolvedValue("current-doc");
  fa.writeText.mockResolvedValue(undefined);
  fa.ensureDir.mockResolvedValue(undefined);
});

describe("createBackupSnapshot — local branch", () => {
  it("writes backup files + metadata through fileAccess and never touches WebDAV", async () => {
    const result = await createBackupSnapshot(state("local"), "manual");

    expect(result.ok).toBe(true);
    // stamp is YYYYMMDD-HHMMSS-mmm, host sanitized to lowercase
    expect(result.backupName).toMatch(/^backup-\d{8}-\d{6}-\d{3}-my-laptop$/);
    expect(result.backupPath).toContain("/backups/backup-");
    // 4 backup docs + 1 metadata file written; profiles live in config.panel.json.
    expect(fa.writeText).toHaveBeenCalledTimes(5);
    expect(fa.ensureDir).toHaveBeenCalled();
    expect(webdav.uploadWebDavFile).not.toHaveBeenCalled();
  });

  it("rotates obsolete local backups beyond the retention count", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "hostname") return "host" as never;
      if (cmd === "list_subdirs") return ["backup-a", "backup-b", "backup-c"] as never; // 3 dirs, retention 2
      return undefined as never;
    });
    await createBackupSnapshot(state("local"), "manual");
    const removed = mockedInvoke.mock.calls.filter((c) => c[0] === "remove_dir");
    expect(removed).toHaveLength(1); // oldest one pruned
  });
});

describe("createBackupSnapshot — webdav branch", () => {
  it("uploads via WebDAV and prunes the manifest, never touching the local FS writer", async () => {
    const result = await createBackupSnapshot(state("webdav"), "manual");

    expect(result.ok).toBe(true);
    expect(webdav.ensureWebDavCollection).toHaveBeenCalled();
    // 4 backup docs + metadata uploaded; profiles live in config.panel.json.
    expect(webdav.uploadWebDavFile).toHaveBeenCalledTimes(5);
    expect(webdav.pruneWebDavBackups).toHaveBeenCalled();
    expect(fa.writeText).not.toHaveBeenCalled();
  });
});

describe("listBackups / deleteBackup branching", () => {
  it("lists local subdirs prefixed with backup-, newest first", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_subdirs") return ["backup-1", "other", "backup-2"] as never;
      return undefined as never;
    });
    const records = await listBackups(state("local"));
    expect(records.map((r) => r.name)).toEqual(["backup-2", "backup-1"]);
  });

  it("lists WebDAV backups from the manifest", async () => {
    webdav.readWebDavManifest.mockResolvedValueOnce([
      { name: "backup-1", createdAt: "2026-01-01" },
      { name: "backup-2", createdAt: "2026-01-02" },
    ]);
    const records = await listBackups(state("webdav"));
    expect(records.map((r) => r.name)).toEqual(["backup-2", "backup-1"]);
    expect(webdav.readWebDavManifest).toHaveBeenCalled();
  });

  it("deletes a local backup directory via remove_dir", async () => {
    await deleteBackup(state("local"), "backup-x");
    expect(mockedInvoke).toHaveBeenCalledWith("remove_dir", { path: "/backups/backup-x" });
  });

  it("deletes a WebDAV backup and rewrites the manifest", async () => {
    webdav.readWebDavManifest.mockResolvedValueOnce([{ name: "backup-x", createdAt: "2026-01-01" }]);
    await deleteBackup(state("webdav"), "backup-x");
    expect(webdav.deleteWebDavPath).toHaveBeenCalled();
    expect(webdav.uploadWebDavFile).toHaveBeenCalled(); // manifest rewrite
  });
});

describe("testBackupWebdav", () => {
  it("delegates to testWebDavConnection", async () => {
    await expect(testBackupWebdav(state("webdav"))).resolves.toEqual({ ok: true, target: "https://dav" });
    expect(webdav.testWebDavConnection).toHaveBeenCalled();
  });
});

describe("restoreBackupSafe — rollback point", () => {
  it("creates a pre-restore rollback snapshot, writes restored docs, and returns rollbackBackupName", async () => {
    const result = await restoreBackupSafe(state("local"), "backup-x", { allowOverwrite: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // rollback snapshot is itself a backup -> rollbackBackupName follows the backup naming
    expect(result.rollbackBackupName).toMatch(/^backup-/);
    // restored documents are written back to the managed paths (3 ids)
    const restoredWrites = fa.writeText.mock.calls.filter(([p]) => String(p).startsWith("/cfg/"));
    expect(restoredWrites).toHaveLength(2);
    expect(mockedImportPanelSettings).toHaveBeenCalledWith(expect.any(String));
  });

  it("returns an external-change conflict result without writing when a conflict is detected", async () => {
    mockedDetectConflict.mockResolvedValueOnce({
      conflict: { changedFiles: [{ id: "config" }] },
      snapshot: { capturedAt: "now", files: {} },
    } as never);

    const result = await restoreBackupSafe(state("local"), "backup-x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("external-change");
    // no restored docs written to managed paths
    const restoredWrites = fa.writeText.mock.calls.filter(([p]) => String(p).startsWith("/cfg/"));
    expect(restoredWrites).toHaveLength(0);
  });
});
