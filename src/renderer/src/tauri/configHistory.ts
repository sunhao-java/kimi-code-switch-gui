// 配置历史前端适配器
import { invoke } from "@tauri-apps/api/core";
import type { ManagedFileId } from "@shared/types";

/**
 * 快照记录（从 Rust 返回）
 */
export interface SnapshotRecord {
  id: number;
  snapshot_at: string; // ISO 8601 timestamp
  file_id: ManagedFileId;
  sha256: string;
  size_bytes: number;
  snapshot_path: string;
  description: string | null;
}

/**
 * 初始化配置历史表。
 *
 * 调用时机：应用启动时，在 usageOpen 之后。
 * 注意：复用 usage.rs 的 SQLite 连接，不需要单独的 open 操作。
 */
export async function initConfigHistory(): Promise<void> {
  try {
    await invoke("init_config_history");
  } catch (err) {
    console.error("Failed to init config history:", err);
    throw err;
  }
}

/**
 * 捕获配置快照。
 *
 * @param fileId - 配置文件 ID（'config' | 'profiles' | 'panel' | 'mcp'）
 * @param filePath - 配置文件路径（支持 ~/）
 * @param description - 可选的快照描述
 * @returns 快照 ID，如果去重或失败则返回 null
 */
export async function captureSnapshot(
  fileId: ManagedFileId,
  filePath: string,
  description?: string,
  kimiCodeEnvironmentId?: string,
): Promise<number | null> {
  try {
    const result = await invoke<number | null>("capture_snapshot", {
      fileId,
      filePath,
      description: description ?? null,
      kimiCodeEnvironmentId: kimiCodeEnvironmentId ?? null,
    });
    return result;
  } catch (err) {
    console.error(`Failed to capture snapshot for ${fileId}:`, err);
    return null; // 快照失败不阻塞调用方
  }
}

/**
 * 列出快照历史。
 *
 * @param fileId - 可选，过滤指定文件类型
 * @param limit - 返回记录数上限（默认 100）
 * @returns 按时间倒序排列的快照列表
 */
export async function listSnapshots(
  fileId?: ManagedFileId,
  limit?: number,
): Promise<SnapshotRecord[]> {
  try {
    const result = await invoke<SnapshotRecord[]>("list_snapshots", {
      fileId: fileId ?? null,
      limit: limit ?? 100,
    });
    return result;
  } catch (err) {
    console.error("Failed to list snapshots:", err);
    return [];
  }
}

/**
 * 获取快照内容。
 *
 * @param snapshotId - 快照 ID
 * @returns 解压后的原始配置文本
 */
export async function getSnapshotContent(snapshotId: number): Promise<string | null> {
  try {
    const content = await invoke<string>("get_snapshot_content", {
      snapshotId,
    });
    return content;
  } catch (err) {
    console.error(`Failed to get snapshot content for ${snapshotId}:`, err);
    return null;
  }
}

/**
 * 回滚到指定快照。
 *
 * 注意：
 * - 回滚前会自动创建"回滚点"快照，支持撤销回滚
 * - 回滚后需要重新加载 AppState
 *
 * @param snapshotId - 快照 ID
 * @returns 成功返回 true，失败返回 false
 */
export async function restoreSnapshot(snapshotId: number): Promise<boolean> {
  try {
    await invoke("restore_snapshot", { snapshotId });
    return true;
  } catch (err) {
    console.error(`Failed to restore snapshot ${snapshotId}:`, err);
    return false;
  }
}

/**
 * 清理旧快照。
 *
 * 删除 30 天前的快照记录和对应的文件系统文件。
 *
 * @returns 删除的记录数
 */
export async function cleanupOldSnapshots(): Promise<number> {
  try {
    const deleted = await invoke<number>("cleanup_old_snapshots");
    return deleted;
  } catch (err) {
    console.error("Failed to cleanup old snapshots:", err);
    return 0;
  }
}

