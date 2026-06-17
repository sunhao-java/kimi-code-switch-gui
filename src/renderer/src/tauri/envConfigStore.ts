/**
 * 环境级配置存储（SQLite）适配器。
 *
 * Provider / Model 以 SQLite 为唯一真源，按 Kimi Code 环境标识隔离。
 * config.toml 仅为「启用项」的单向投影，由 configStore.saveAppState 生成。
 */

import { invoke } from "@tauri-apps/api/core";
import type { EnvConfigData } from "@shared/configStore";

export async function initEnvConfigStore(): Promise<void> {
  await invoke("init_env_config_store");
}

export async function getEnvConfig(environmentId: string): Promise<EnvConfigData | null> {
  const json = await invoke<string | null>("get_env_config", { environmentId });
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<EnvConfigData>;
    return {
      providers: parsed.providers ?? {},
      models: parsed.models ?? {},
    };
  } catch (err) {
    console.error("Failed to parse env config:", err);
    return null;
  }
}

export async function saveEnvConfig(environmentId: string, data: EnvConfigData): Promise<void> {
  await invoke("save_env_config", {
    environmentId,
    configJson: JSON.stringify({ providers: data.providers, models: data.models }),
  });
}

export async function deleteEnvConfig(environmentId: string): Promise<void> {
  await invoke("delete_env_config", { environmentId });
}

export async function exportAllEnvConfigs(): Promise<Record<string, EnvConfigData>> {
  const json = await invoke<string>("export_all_env_configs");
  try {
    return JSON.parse(json) as Record<string, EnvConfigData>;
  } catch (err) {
    console.error("Failed to parse exported env configs:", err);
    return {};
  }
}

export async function importAllEnvConfigs(all: Record<string, EnvConfigData>): Promise<void> {
  await invoke("import_all_env_configs", { allJson: JSON.stringify(all) });
}

/**
 * 一次性迁移：从某环境的 config.toml 把 providers/models 导入 DB（全部启用）。
 * 仅当 DB 中该环境尚无记录时生效（Rust 端保证幂等）。
 */
export async function migrateEnvConfigFromToml(
  environmentId: string,
  configTomlPath: string,
): Promise<void> {
  await invoke("migrate_env_config_from_toml", { environmentId, configTomlPath });
}
