import type { IpcMain } from "electron";

import { applyProfile, cloneState } from "@shared/configStore";
import type { AppState } from "@shared/types";

import { runKimiMcpCommand, runKimiConnectivityTest } from "./cli";

export function registerMcpProfileIpc(ipcMain: IpcMain): void {
  ipcMain.handle("mcp:test-server", async (_, name: string) => {
    try {
      return await runKimiMcpCommand(["test", name]);
    } catch (error) {
      console.error("mcp:test-server", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("mcp:auth-server", async (_, name: string) => {
    try {
      return await runKimiMcpCommand(["auth", name]);
    } catch (error) {
      console.error("mcp:auth-server", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("mcp:reset-auth", async (_, name: string) => {
    try {
      return await runKimiMcpCommand(["reset-auth", name]);
    } catch (error) {
      console.error("mcp:reset-auth", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("profile:test-connectivity", async (_, state: AppState, profileName: string, modelName?: string) => {
    try {
      const draft = cloneState(state);
      applyProfile(draft, profileName);
      return await runKimiConnectivityTest(draft, modelName ?? draft.mainConfig.default_model);
    } catch (error) {
      console.error("profile:test-connectivity", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
