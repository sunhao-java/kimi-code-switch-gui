import type { IpcMain } from "electron";

import { applyProfile, cloneState } from "@shared/configStore";
import type { AppState } from "@shared/types";

import { runKimiMcpCommand, runKimiConnectivityTest } from "./cli";

export function registerMcpProfileIpc(ipcMain: IpcMain): void {
  ipcMain.handle("mcp:test-server", async (_, name: string) => {
    return runKimiMcpCommand(["test", name]);
  });

  ipcMain.handle("mcp:auth-server", async (_, name: string) => {
    return runKimiMcpCommand(["auth", name]);
  });

  ipcMain.handle("mcp:reset-auth", async (_, name: string) => {
    return runKimiMcpCommand(["reset-auth", name]);
  });

  ipcMain.handle("profile:test-connectivity", async (_, state: AppState, profileName: string, modelName?: string) => {
    const draft = cloneState(state);
    applyProfile(draft, profileName);
    return runKimiConnectivityTest(draft, modelName ?? draft.mainConfig.default_model);
  });
}
