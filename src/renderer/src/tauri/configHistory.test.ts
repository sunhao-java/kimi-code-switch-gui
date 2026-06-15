import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initConfigHistory,
  captureSnapshot,
  listSnapshots,
  getSnapshotContent,
  restoreSnapshot,
  cleanupOldSnapshots,
} from "./configHistory";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

describe("configHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initConfigHistory", () => {
    it("调用 init_config_history 命令", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await initConfigHistory();

      expect(mockInvoke).toHaveBeenCalledWith("init_config_history");
    });

    it("失败时抛出错误", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("init failed"));

      await expect(initConfigHistory()).rejects.toThrow("init failed");
    });
  });

  describe("captureSnapshot", () => {
    it("成功时返回快照 ID", async () => {
      mockInvoke.mockResolvedValueOnce(42);

      const result = await captureSnapshot("config", "~/.kimi/config.toml", "test snapshot");

      expect(mockInvoke).toHaveBeenCalledWith("capture_snapshot", {
        fileId: "config",
        filePath: "~/.kimi/config.toml",
        description: "test snapshot",
        kimiCodeEnvironmentId: null,
      });
      expect(result).toBe(42);
    });

    it("去重时返回 null", async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await captureSnapshot("profiles", "~/.kimi/config.profiles.toml");

      expect(result).toBeNull();
    });

    it("失败时返回 null（不阻塞调用方）", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("disk full"));

      const result = await captureSnapshot("panel", "~/.kimi/config.panel.toml");

      expect(result).toBeNull();
    });
  });

  describe("listSnapshots", () => {
    it("返回快照列表", async () => {
      const mockSnapshots = [
        {
          id: 1,
          snapshot_at: "2026-06-08T10:00:00Z",
          file_id: "config",
          sha256: "abc123",
          size_bytes: 1024,
          snapshot_path: "/path/1.gz",
          description: "test",
        },
        {
          id: 2,
          snapshot_at: "2026-06-08T11:00:00Z",
          file_id: "profiles",
          sha256: "def456",
          size_bytes: 2048,
          snapshot_path: "/path/2.gz",
          description: null,
        },
      ];

      mockInvoke.mockResolvedValueOnce(mockSnapshots);

      const result = await listSnapshots("config", 50);

      expect(mockInvoke).toHaveBeenCalledWith("list_snapshots", {
        fileId: "config",
        limit: 50,
      });
      expect(result).toEqual(mockSnapshots);
    });

    it("默认参数", async () => {
      mockInvoke.mockResolvedValueOnce([]);

      await listSnapshots();

      expect(mockInvoke).toHaveBeenCalledWith("list_snapshots", {
        fileId: null,
        limit: 100,
      });
    });

    it("失败时返回空数组", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("db error"));

      const result = await listSnapshots();

      expect(result).toEqual([]);
    });
  });

  describe("getSnapshotContent", () => {
    it("返回快照内容", async () => {
      const mockContent = "[providers]\ndefault = \"kimi\"";
      mockInvoke.mockResolvedValueOnce(mockContent);

      const result = await getSnapshotContent(42);

      expect(mockInvoke).toHaveBeenCalledWith("get_snapshot_content", {
        snapshotId: 42,
      });
      expect(result).toBe(mockContent);
    });

    it("失败时返回 null", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("file not found"));

      const result = await getSnapshotContent(999);

      expect(result).toBeNull();
    });
  });

  describe("restoreSnapshot", () => {
    it("成功时返回 true", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await restoreSnapshot(42);

      expect(mockInvoke).toHaveBeenCalledWith("restore_snapshot", {
        snapshotId: 42,
      });
      expect(result).toBe(true);
    });

    it("失败时返回 false", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("write failed"));

      const result = await restoreSnapshot(42);

      expect(result).toBe(false);
    });
  });

  describe("cleanupOldSnapshots", () => {
    it("返回删除的记录数", async () => {
      mockInvoke.mockResolvedValueOnce(15);

      const result = await cleanupOldSnapshots();

      expect(mockInvoke).toHaveBeenCalledWith("cleanup_old_snapshots");
      expect(result).toBe(15);
    });

    it("失败时返回 0", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("cleanup failed"));

      const result = await cleanupOldSnapshots();

      expect(result).toBe(0);
    });
  });
});
