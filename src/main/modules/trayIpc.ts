import type { IpcMain } from "electron";

export interface TrayIpcContext {
  createTray: () => void;
  destroyTray: () => void;
  updateTrayMenu: () => Promise<void>;
}

export function registerTrayIpc(ipcMain: IpcMain, ctx: TrayIpcContext): void {
  ipcMain.handle("app:set-tray", (_, enabled: boolean) => {
    try {
      if (enabled) {
        ctx.createTray();
        void ctx.updateTrayMenu();
      } else {
        ctx.destroyTray();
      }
      return { ok: true };
    } catch (error) {
      console.error("app:set-tray", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:refresh-tray-menu", async () => {
    try {
      await ctx.updateTrayMenu();
      return { ok: true };
    } catch (error) {
      console.error("app:refresh-tray-menu", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
