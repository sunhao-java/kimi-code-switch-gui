import type { BrowserWindow, IpcMain } from "electron";
import { dialog, shell } from "electron";

import type { FileDialogResult, OpenKimiTerminalRequest, PanelSettings } from "@shared/types";

import { fileAccess } from "./fileAccess";

export interface DialogIpcContext {
  getMainWindow: () => BrowserWindow | null;
  openKimiInTerminal: (request: PanelSettings | OpenKimiTerminalRequest) => Promise<{ ok: true }>;
}

export function registerDialogIpc(ipcMain: IpcMain, ctx: DialogIpcContext): void {
  ipcMain.handle("dialog:pick-file", async (_, options): Promise<FileDialogResult> => {
    try {
      const mainWindow = ctx.getMainWindow();
      if (!mainWindow) {
        return { canceled: true };
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        ...options,
      });
      return {
        canceled: result.canceled,
        filePath: result.filePaths[0],
      };
    } catch (error) {
      console.error("dialog:pick-file", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("dialog:save-file", async (_, content: string, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<FileDialogResult> => {
    try {
      const mainWindow = ctx.getMainWindow();
      if (!mainWindow) {
        return { canceled: true };
      }
      const result = await dialog.showSaveDialog(mainWindow, {
        filters: options?.filters ?? [{ name: "JSON", extensions: ["json"] }],
        defaultPath: options?.defaultPath,
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      await fileAccess.ensureDir(result.filePath.replace(/\/[^/]*$/, "/"));
      await fileAccess.writeText(result.filePath, content);
      return { canceled: false, filePath: result.filePath };
    } catch (error) {
      console.error("dialog:save-file", error);
      return { canceled: true };
    }
  });

  ipcMain.handle("dialog:read-file", async (_, filePath: string): Promise<{ ok: boolean; content?: string; error?: string }> => {
    try {
      const content = await fileAccess.readText(filePath);
      if (content === null) {
        return { ok: false, error: "File not found." };
      }
      return { ok: true, content };
    } catch (error) {
      console.error("dialog:read-file", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:open-external", async (_, url: string) => {
    try {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error("Invalid URL provided.");
      }
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "mailto:") {
        throw new Error("Only HTTPS and mailto URLs can be opened.");
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (error) {
      console.error("app:open-external", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:open-kimi-in-terminal", async (_, request: PanelSettings | OpenKimiTerminalRequest) => {
    try {
      return await ctx.openKimiInTerminal(request);
    } catch (error) {
      console.error("app:open-kimi-in-terminal", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
