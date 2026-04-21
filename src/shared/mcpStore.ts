import type { McpConfig, McpServerConfig } from "./types";

export const DEFAULT_MCP_CONFIG_PATH = "~/.kimi/mcp.json";

export function createDefaultMcpConfig(): McpConfig {
  return {
    mcpServers: {},
  };
}

export async function loadMcpConfig(
  files: { readText(path: string): Promise<string | null> },
  path: string,
): Promise<McpConfig> {
  const document = await files.readText(path);
  return parseMcpConfig(document);
}

export function parseMcpConfig(document: string | null): McpConfig {
  if (!document?.trim()) {
    return createDefaultMcpConfig();
  }

  try {
    return parseMcpConfigStrict(document);
  } catch {
    return createDefaultMcpConfig();
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
      .filter(([, server]) => server.enabled !== false)
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
          transport: "stdio",
          ...(server.command ? { command: server.command } : {}),
          ...(server.args.length ? { args: server.args } : {}),
          ...(Object.keys(server.env).length ? { env: server.env } : {}),
        }
      : {
          transport: server.transport,
          ...(server.url ? { url: server.url } : {}),
          ...(Object.keys(server.headers).length ? { headers: server.headers } : {}),
        };

  return {
    ...base,
    ...(server.enabled === false ? { enabled: false } : {}),
    ...(server.extra ?? {}),
  };
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
