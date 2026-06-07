/**
 * MCP 服务器存储（SQLite）。
 *
 * 设计：
 * - 数据保存在 SQLite 数据库中
 * - 启用时：自动同步到 ~/.kimi/config.mcp.json
 * - 禁用时：从 mcp.json 删除，数据库保留（enabled=false）
 * - 删除时：从数据库物理删除
 */

import { invoke } from "@tauri-apps/api/core";
import type { McpServerConfig } from "../../shared/types";

export interface McpServerRecord extends McpServerConfig {
  id?: number;
  server_name: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 初始化 MCP 服务器表
 */
export async function initMcpServersStore(): Promise<void> {
  await invoke("init_mcp_servers_store");
}

/**
 * 列出所有 MCP 服务器（包括禁用的）
 */
export async function listMcpServers(): Promise<McpServerRecord[]> {
  const json = await invoke<string>("list_mcp_servers");
  return JSON.parse(json);
}

/**
 * 获取单个 MCP 服务器
 */
export async function getMcpServer(serverName: string): Promise<McpServerRecord | null> {
  const json = await invoke<string | null>("get_mcp_server", { serverName });
  return json ? JSON.parse(json) : null;
}

/**
 * 保存 MCP 服务器（创建或更新）
 */
export async function saveMcpServer(server: McpServerRecord): Promise<void> {
  const json = JSON.stringify(server);
  await invoke("save_mcp_server", { serverJson: json });
}

/**
 * 启用 MCP 服务器
 */
export async function enableMcpServer(serverName: string): Promise<void> {
  await invoke("enable_mcp_server", { serverName });
}

/**
 * 禁用 MCP 服务器
 */
export async function disableMcpServer(serverName: string): Promise<void> {
  await invoke("disable_mcp_server", { serverName });
}

/**
 * 删除 MCP 服务器（物理删除）
 */
export async function deleteMcpServer(serverName: string): Promise<void> {
  await invoke("delete_mcp_server", { serverName });
}

/**
 * 获取所有启用的 MCP 服务器（用于同步到 mcp.json）
 */
export async function getEnabledMcpServers(): Promise<McpServerRecord[]> {
  const json = await invoke<string>("get_enabled_mcp_servers");
  return JSON.parse(json);
}

/**
 * 从 mcp.json 迁移到数据库（首次启动）
 */
export async function migrateMcpFromJson(jsonPath: string): Promise<void> {
  await invoke("migrate_mcp_from_json", { jsonPath });
}

/**
 * 同步启用的 MCP 服务器到 mcp.json 文件
 *
 * 只写入 enabled=true 的服务器，构建 kimi-code-cli 需要的格式
 */
export async function syncEnabledToMcpFile(mcpPath: string): Promise<void> {
  const { writeFile } = await import("./fileAccess");

  // 获取所有启用的服务器
  const enabledServers = await getEnabledMcpServers();

  // 构建 mcpServers 对象
  const mcpServers: Record<string, McpServerConfig> = {};

  for (const server of enabledServers) {
    mcpServers[server.server_name] = {
      enabled: true,
      transport: server.transport,
      url: server.url,
      command: server.command,
      args: server.args,
      headers: server.headers,
      env: server.env,
      ...(server.extra ? { extra: server.extra } : {}),
    };
  }

  // 写入文件
  const mcpConfig = {
    mcpServers,
  };

  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2));
}

/**
 * 切换 MCP 服务器启用状态
 *
 * 启用后自动同步到 mcp.json，禁用后从 mcp.json 删除
 */
export async function toggleMcpServer(
  serverName: string,
  enabled: boolean,
  mcpPath: string
): Promise<void> {
  if (enabled) {
    await enableMcpServer(serverName);
  } else {
    await disableMcpServer(serverName);
  }

  // 同步到文件
  await syncEnabledToMcpFile(mcpPath);
}
