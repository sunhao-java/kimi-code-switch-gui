// Tauri 版 FileAccess：把 shared/configStore 的 FileAccess 接口接到 Rust 后端原子命令。
// 对应 Electron 侧 src/main/modules/fileAccess.ts，但运行在 renderer 进程。
import { invoke } from "@tauri-apps/api/core";

import type { FileAccess, PanelSettings } from "@shared/configStore";
import { getPanelSettings, savePanelSettings } from "./panelSettingsStore";

export const tauriFileAccess: FileAccess = {
  async readText(path: string): Promise<string | null> {
    return invoke<string | null>("read_text", { path });
  },
  async writeText(path: string, content: string): Promise<void> {
    await invoke("write_text", { path, content });
  },
  async ensureDir(path: string): Promise<void> {
    await invoke("ensure_dir", { path });
  },
  async readPanelSettings(_path: string): Promise<PanelSettings | null> {
    // 忽略 path 参数，直接从 SQLite 读取（单行存储）
    return getPanelSettings();
  },
  async writePanelSettings(_path: string, settings: PanelSettings): Promise<void> {
    // 忽略 path 参数，直接写入 SQLite
    const ok = await savePanelSettings(settings);
    if (!ok) {
      throw new Error("Failed to save panel settings to SQLite");
    }
  },
};

export async function removeFile(path: string): Promise<void> {
  await invoke("remove_file", { path });
}

export async function moveFile(from: string, to: string): Promise<void> {
  await invoke("move_file", { from, to });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function listDir(path: string): Promise<string[]> {
  return invoke<string[]>("list_dir", { path });
}
