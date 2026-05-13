import type { BrowserWindow, IpcMain } from "electron";
import { dialog, shell } from "electron";

import type { FileDialogResult, OpenKimiTerminalRequest, PanelSettings } from "@shared/types";

export interface DialogIpcContext {
  getMainWindow: () => BrowserWindow | null;
  openKimiInTerminal: (request: PanelSettings | OpenKimiTerminalRequest) => Promise<{ ok: true }>;
}

export function registerDialogIpc(ipcMain: IpcMain, ctx: DialogIpcContext): void {
  ipcMain.handle("dialog:pick-file", async (_, options): Promise<FileDialogResult> => {
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
  });

  ipcMain.handle("app:open-external", async (_, url: string) => {
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
  });

  ipcMain.handle("app:open-kimi-in-terminal", async (_, request: PanelSettings | OpenKimiTerminalRequest) => {
    return ctx.openKimiInTerminal(request);
  });
}
