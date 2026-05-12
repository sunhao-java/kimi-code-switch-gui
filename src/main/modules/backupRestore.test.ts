import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  bootstrapProfiles,
  buildConfigDocument,
  buildPanelSettingsDocument,
  buildProfilesDocument,
  createDefaultPanelSettings,
} from "@shared/configStore";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import type { AppState } from "@shared/types";
import { resolveRestoreTargets } from "./backupRestore";

describe("backupRestore", () => {
  it("restores profile data to the current machine paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "kimi-restore-"));
    try {
      const backupRoot = join(root, "backups");
      const backupName = "backup-20260512-120000-000-source";
      const backupDir = join(backupRoot, backupName);
      const currentConfigPath = join(root, "target", "config.toml");
      const currentProfilesPath = join(root, "target", "config.profiles.toml");
      const currentPanelPath = join(root, "target", ".panel", "config.panel.toml");
      const currentMcpPath = join(root, "target", "mcp.json");

      const backupState = createState({
        configPath: "/Users/source/.kimi/config.toml",
        profilesPath: "/Users/source/.kimi/config.profiles.toml",
        panelSettingsPath: "/Users/source/.kimi/config.panel.toml",
        mcpConfigPath: "/Users/source/.kimi/mcp.json",
        backupLocalPath: backupRoot,
      });
      backupState.profiles.work = {
        ...backupState.profiles.default,
        name: "work",
        label: "Work",
        default_yolo: true,
      };
      backupState.activeProfile = "work";

      await mkdir(backupDir, { recursive: true });
      await Promise.all([
        writeFile(join(backupDir, "config.toml"), buildConfigDocument(backupState), "utf-8"),
        writeFile(join(backupDir, "config.profiles.toml"), buildProfilesDocument(backupState), "utf-8"),
        writeFile(join(backupDir, "config.panel.toml"), buildPanelSettingsDocument(backupState.panelSettings), "utf-8"),
        writeFile(join(backupDir, "mcp.json"), buildMcpConfigDocument(backupState.mcpConfig), "utf-8"),
      ]);

      const currentState = createState({
        configPath: currentConfigPath,
        profilesPath: currentProfilesPath,
        panelSettingsPath: currentPanelPath,
        mcpConfigPath: currentMcpPath,
        backupLocalPath: backupRoot,
      });

      const resolved = await resolveRestoreTargets(currentState, backupName);

      expect(resolved.paths.config).toBe(currentConfigPath);
      expect(resolved.paths.profiles).toBe(currentProfilesPath);
      expect(resolved.draftState.activeProfile).toBe("work");
      expect(resolved.draftState.profiles.work.label).toBe("Work");
      expect(resolved.draftState.profiles.work.default_yolo).toBe(true);
      expect(resolved.documents.panel).toContain(`config_path = "${currentConfigPath}"`);
      expect(resolved.documents.panel).toContain('profiles_path = ""');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects backups that do not contain profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "kimi-restore-missing-"));
    try {
      const backupRoot = join(root, "backups");
      const backupName = "backup-20260512-130000-000-source";
      const backupDir = join(backupRoot, backupName);
      const state = createState({
        configPath: join(root, "target", "config.toml"),
        profilesPath: join(root, "target", "config.profiles.toml"),
        panelSettingsPath: join(root, "target", ".panel", "config.panel.toml"),
        mcpConfigPath: join(root, "target", "mcp.json"),
        backupLocalPath: backupRoot,
      });

      await mkdir(backupDir, { recursive: true });
      await Promise.all([
        writeFile(join(backupDir, "config.toml"), buildConfigDocument(state), "utf-8"),
        writeFile(join(backupDir, "config.panel.toml"), buildPanelSettingsDocument(state.panelSettings), "utf-8"),
        writeFile(join(backupDir, "mcp.json"), buildMcpConfigDocument(state.mcpConfig), "utf-8"),
      ]);

      await expect(resolveRestoreTargets(state, backupName)).rejects.toThrow("Backup is missing config.profiles.toml.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createState(paths: {
  configPath: string;
  profilesPath: string;
  panelSettingsPath: string;
  mcpConfigPath: string;
  backupLocalPath: string;
}): AppState {
  const mainConfig = {
    default_model: "kimi_gateway/kimi-k2.5",
    default_thinking: true,
    default_yolo: false,
    default_plan_mode: false,
    default_editor: "",
    theme: "dark",
    show_thinking_stream: false,
    merge_all_available_skills: false,
    hooks: [],
    models: {
      "kimi_gateway/kimi-k2.5": {
        provider: "kimi_gateway",
        model: "kimi-k2.5",
        max_context_size: 262144,
        capabilities: ["thinking"],
      },
    },
    providers: {
      kimi_gateway: {
        type: "kimi",
        base_url: "https://example.test/v1",
        api_key: "sk-test",
      },
    },
    loop_control: {},
    background: {},
    notifications: {},
    services: {},
    mcp: {},
  };
  const panelSettings = createDefaultPanelSettings(paths.configPath, paths.panelSettingsPath);
  panelSettings.backup_local_path = paths.backupLocalPath;

  return {
    configPath: paths.configPath,
    profilesPath: paths.profilesPath,
    panelSettingsPath: paths.panelSettingsPath,
    mcpConfigPath: paths.mcpConfigPath,
    mainConfig,
    profiles: bootstrapProfiles(mainConfig),
    activeProfile: "default",
    panelSettings,
    mcpConfig: {
      mcpServers: {},
    },
  };
}
