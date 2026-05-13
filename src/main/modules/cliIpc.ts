import type { IpcMain } from "electron";

import { checkForUpdates, detectInstallSource } from "./updates";
import { getCliVersion, getCliEnv, upgradeKimiCli } from "./cli";

export function registerCliIpc(ipcMain: IpcMain): void {
  ipcMain.handle("app:check-for-updates", async () => {
    return checkForUpdates(getCliEnv);
  });

  ipcMain.handle("app:get-install-source", async () => {
    return detectInstallSource(getCliEnv);
  });

  ipcMain.handle("app:cli-version", async (_, options?: { checkLatest?: boolean }) => {
    return getCliVersion(options);
  });

  ipcMain.handle("app:upgrade-kimi-cli", async () => {
    return upgradeKimiCli();
  });
}
