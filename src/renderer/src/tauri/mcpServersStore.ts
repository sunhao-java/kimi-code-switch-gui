/**
 * MCP 服务器存储（SQLite）的初始化与一次性迁移。
 *
 * 说明：MCP 配置实际通过 panel_settings 的 mcp_servers JSON 列管理，
 * 这里只保留启动时的建表（init）与从旧 mcp.json 的一次性导入（migrate）。
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 初始化 MCP 服务器表
 */
export async function initMcpServersStore(): Promise<void> {
  await invoke("init_mcp_servers_store");
}

/**
 * 从 mcp.json 迁移到数据库（首次启动）
 */
export async function migrateMcpFromJson(jsonPath: string): Promise<void> {
  await invoke("migrate_mcp_from_json", { jsonPath });
}
