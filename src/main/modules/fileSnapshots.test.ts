import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureSnapshotForPaths, detectExternalChangeConflict } from "./fileSnapshots";
import type { ManagedFileId } from "@shared/types";

describe("fileSnapshots", () => {
  it("does not report stale snapshots as external changes when disk already matches the draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "kimi-file-snapshot-"));
    try {
      const paths: Record<ManagedFileId, string> = {
        config: join(root, "config.toml"),
        profiles: join(root, "config.profiles.toml"),
        panel: join(root, "config.panel.toml"),
        mcp: join(root, "mcp.json"),
      };
      await Promise.all([
        writeFile(paths.config, "default_model = \"old\"\n", "utf-8"),
        writeFile(paths.profiles, "", "utf-8"),
        writeFile(paths.panel, "", "utf-8"),
        writeFile(paths.mcp, "{}", "utf-8"),
      ]);
      const staleSnapshot = await captureSnapshotForPaths(paths);
      await writeFile(paths.config, "default_model = \"new\"\n", "utf-8");

      const result = await detectExternalChangeConflict({
        expectedSnapshot: staleSnapshot,
        targetPaths: paths,
        draftDocuments: {
          config: "default_model = \"new\"\n",
          profiles: "",
          panel: "",
          mcp: "{}",
        },
      });

      expect(result.conflict).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a conflict when stale snapshots point to disk content that differs from the draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "kimi-file-snapshot-conflict-"));
    try {
      const paths: Record<ManagedFileId, string> = {
        config: join(root, "config.toml"),
        profiles: join(root, "config.profiles.toml"),
        panel: join(root, "config.panel.toml"),
        mcp: join(root, "mcp.json"),
      };
      await Promise.all([
        writeFile(paths.config, "default_model = \"old\"\n", "utf-8"),
        writeFile(paths.profiles, "", "utf-8"),
        writeFile(paths.panel, "", "utf-8"),
        writeFile(paths.mcp, "{}", "utf-8"),
      ]);
      const staleSnapshot = await captureSnapshotForPaths(paths);
      await writeFile(paths.config, "default_model = \"external\"\n", "utf-8");

      const result = await detectExternalChangeConflict({
        expectedSnapshot: staleSnapshot,
        targetPaths: paths,
        draftDocuments: {
          config: "default_model = \"draft\"\n",
          profiles: "",
          panel: "",
          mcp: "{}",
        },
      });

      expect(result.conflict?.changedFiles[0]?.id).toBe("config");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
