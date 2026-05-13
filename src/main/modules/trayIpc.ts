import type { IpcMain } from "electron";

export interface TrayIpcContext {
  createTray: () => void;
  destroyTray: () => void;
  updateTrayMenu: () => Promise<void>;
}

export function registerTrayIpc(ipcMain: IpcMain, ctx: TrayIpcContext): void {
  ipcMain.handle("app:set-tray", (_, enabled: boolean) => {
    if (enabled) {
      ctx.createTray();
      void ctx.updateTrayMenu();
    } else {
      ctx.destroyTray();
    }
    return { ok: true };
  });

  ipcMain.handle("app:refresh-tray-menu", async () => {
    await ctx.updateTrayMenu();
    return { ok: true };
  });
}
