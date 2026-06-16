import type { McpConfig, McpServerConfig } from "./types";

export const DEFAULT_MCP_CONFIG_PATH = "~/.kimi-code/mcp.json";

export function createDefaultMcpConfig(): McpConfig {
  return {
    mcpServers: {},
  };
}

export async function loadMcpConfig(
  files: { readText(path: string): Promise<string | null> },
  path: string,
): Promise<McpConfig> {
  let document: string | null;
  try {
    document = await files.readText(path);
  } catch (error) {
    throw new Error(`Failed to read MCP config at ${path}: ${formatErrorMessage(error)}`);
  }
  return parseMcpConfig(document, { sourcePath: path });
}

export function parseMcpConfig(document: string | null, options?: { sourcePath?: string }): McpConfig {
  if (!document?.trim()) {
    return createDefaultMcpConfig();
  }

  try {
    return parseMcpConfigStrict(document);
  } catch (error) {
    const location = options?.sourcePath ? ` at ${options.sourcePath}` : "";
    throw new Error(`Invalid MCP config${location}: ${formatErrorMessage(error)}`);
  }
}

export function parseMcpConfigStrict(document: string): McpConfig {
  const parsed = JSON.parse(document) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    throw new Error("Invalid MCP config: expected an object with mcpServers.");
  }

  const mcpServers = Object.fromEntries(
    Object.entries(parsed.mcpServers).map(([name, raw]) => [name, parseMcpServer(raw)]),
  );

  return { mcpServers };
}

export function buildMcpConfigDocument(config: McpConfig): string {
  const mcpServers = Object.fromEntries(
    Object.entries(config.mcpServers)
      .filter(([, server]) => server.enabled !== false && !isUnsupportedSseServer(server))
      .map(([name, server]) => [name, buildMcpServerDocument(server)]),
  );
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function parseMcpServer(raw: unknown): McpServerConfig {
  const data = isRecord(raw) ? raw : {};
  const headers = asStringRecord(data.headers);
  const env = asStringRecord(data.env);
  const args = Array.isArray(data.args)
    ? data.args.filter((item): item is string => typeof item === "string")
    : [];
  const enabled = typeof data.enabled === "boolean" ? data.enabled : true;

  const knownKeys = new Set(["transport", "type", "url", "auth", "headers", "command", "args", "env", "enabled", "extra"]);
  const derivedExtra = Object.fromEntries(
    Object.entries(data).filter(([key]) => !knownKeys.has(key)),
  );
  const explicitExtra = isRecord(data.extra) ? data.extra : {};
  const extra = {
    ...explicitExtra,
    ...derivedExtra,
  };

  const transport = normalizeMcpTransport(data.transport ?? data.type, data.url, data.command);

  if (transport !== "stdio") {
    return {
      enabled,
      transport,
      url: typeof data.url === "string" ? data.url : "",
      headers,
      command: "",
      args: [],
      env: {},
      extra: Object.keys(extra).length ? extra : undefined,
    };
  }

  return {
    enabled,
    transport: "stdio",
    url: "",
    headers: {},
    command: typeof data.command === "string" ? data.command : "",
    args,
    env,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

function buildMcpServerDocument(server: McpServerConfig): Record<string, unknown> {
  const base =
    server.transport === "stdio"
      ? {
          ...(server.command ? { command: server.command } : {}),
          ...(server.args.length ? { args: server.args } : {}),
          ...(Object.keys(server.env).length ? { env: server.env } : {}),
        }
      : {
          ...(server.url ? { url: server.url } : {}),
          ...(Object.keys(server.headers).length ? { headers: server.headers } : {}),
        };

  return {
    ...sanitizeMcpExtra(server.extra),
    ...base,
    ...(server.enabled === false ? { enabled: false } : {}),
  };
}

export function isUnsupportedSseServer(server: McpServerConfig): boolean {
  // 仅当 transport 解析为 sse 时才视为不支持。URL 启发式（路径含 /sse）只用于
  // normalizeMcpTransport 推断缺省 transport，不应作为过滤依据——否则显式声明为
  // streamable-http 但 URL 恰好含 /sse 的合法端点会被静默丢弃。
  return server.transport === "sse";
}

function sanitizeMcpExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!extra) {
    return {};
  }
  const blockedKeys = new Set(["transport", "type"]);
  return Object.fromEntries(Object.entries(extra).filter(([key]) => !blockedKeys.has(key)));
}

function normalizeMcpTransport(transport: unknown, url: unknown, command: unknown): McpServerConfig["transport"] {
  if (transport === "stdio") {
    return "stdio";
  }
  if (transport === "sse") {
    return "sse";
  }
  if (transport === "http" || transport === "streamable-http") {
    return "streamable-http";
  }
  if (typeof url === "string" && url.trim()) {
    return /\/sse([/?#]|$)/.test(url) ? "sse" : "streamable-http";
  }
  if (typeof command === "string" && command.trim()) {
    return "stdio";
  }
  return "streamable-http";
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
