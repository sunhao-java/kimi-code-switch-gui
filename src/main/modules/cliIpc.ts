import type { IpcMain } from "electron";

import { checkForUpdates, detectInstallSource } from "./updates";
import { getCliVersion, getCliEnv, upgradeKimiCli } from "./cli";

export function registerCliIpc(ipcMain: IpcMain): void {
  ipcMain.handle("app:check-for-updates", async () => {
    try {
      return await checkForUpdates(getCliEnv);
    } catch (error) {
      console.error("app:check-for-updates", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:get-install-source", async () => {
    try {
      return await detectInstallSource(getCliEnv);
    } catch (error) {
      console.error("app:get-install-source", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:cli-version", async (_, options?: { checkLatest?: boolean }) => {
    try {
      return await getCliVersion(options);
    } catch (error) {
      console.error("app:cli-version", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:upgrade-kimi-cli", async () => {
    try {
      return await upgradeKimiCli();
    } catch (error) {
      console.error("app:upgrade-kimi-cli", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
