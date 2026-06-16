import { buildMcpConfigDocument, parseMcpConfig, parseMcpConfigStrict } from "./mcpStore";

describe("mcpStore", () => {
  it("parses legacy http transport as streamable-http", () => {
    const config = parseMcpConfig(`{
      "mcpServers": {
        "context7": {
          "transport": "http",
          "url": "https://mcp.context7.com/mcp",
          "headers": {
            "CONTEXT7_API_KEY": "ctx-test"
          }
        }
      }
    }`);

    expect(config.mcpServers.context7.transport).toBe("streamable-http");
    expect(config.mcpServers.context7.url).toBe("https://mcp.context7.com/mcp");
  });

  it("keeps legacy sse imports visible in the GUI state", () => {
    const config = parseMcpConfig(`{
      "mcpServers": {
        "linear": {
          "url": "https://example.test/sse",
          "auth": "oauth"
        }
      }
    }`);

    expect(config.mcpServers.linear.transport).toBe("sse");
    expect(config.mcpServers.linear.headers).toEqual({});
  });

  it("accepts type as an alias of transport for imported configs", () => {
    const config = parseMcpConfigStrict(`{
      "mcpServers": {
        "amap-maps": {
          "type": "sse",
          "url": "https://mcp.api-inference.modelscope.net/7b4a1ee2962f46/sse"
        }
      }
    }`);

    expect(config.mcpServers["amap-maps"].transport).toBe("sse");
    expect(config.mcpServers["amap-maps"].url).toBe(
      "https://mcp.api-inference.modelscope.net/7b4a1ee2962f46/sse",
    );
  });

  it("serializes only Kimi Code supported MCP transports", () => {
    const document = buildMcpConfigDocument({
      mcpServers: {
        context7: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.context7.com/mcp",
          headers: {
            CONTEXT7_API_KEY: "ctx-test",
          },
          command: "",
          args: [],
          env: {},
        },
        linear: {
          enabled: true,
          transport: "sse",
          url: "https://example.test/sse",
          headers: {},
          command: "",
          args: [],
          env: {},
          extra: {
            transport: "sse",
          },
        },
        chrome_devtools: {
          enabled: true,
          transport: "stdio",
          url: "",
          headers: {},
          command: "npx",
          args: ["chrome-devtools-mcp@latest"],
          env: {
            DEBUG: "1",
          },
        },
      },
    });

    expect(document).toContain('"context7"');
    expect(document).toContain('"url": "https://mcp.context7.com/mcp"');
    expect(document).toContain('"chrome_devtools"');
    expect(document).toContain('"command": "npx"');
    expect(document).not.toContain('"linear"');
    expect(document).not.toContain('"transport"');
    expect(document).not.toContain('"type"');
    expect(document).not.toContain("/sse");
  });

  it("keeps streamable-http servers whose URL path contains /sse", () => {
    const document = buildMcpConfigDocument({
      mcpServers: {
        modelscope: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.example.test/abc/sse",
          headers: {},
          command: "",
          args: [],
          env: {},
        },
      },
    });

    // 显式 streamable-http 即便 URL 含 /sse 也不应被当作 SSE 过滤掉
    expect(document).toContain('"modelscope"');
    expect(document).toContain('"url": "https://mcp.example.test/abc/sse"');
  });

  it("preserves enabled and explicit extra fields without nesting them into extra", () => {
    const config = parseMcpConfigStrict(`{
      "mcpServers": {
        "context7": {
          "transport": "streamable-http",
          "url": "https://mcp.context7.com/mcp",
          "enabled": false,
          "extra": {
            "oauth": {
              "audience": "ctx"
            }
          }
        }
      }
    }`);

    expect(config.mcpServers.context7.enabled).toBe(false);
    expect(config.mcpServers.context7.extra).toEqual({
      oauth: {
        audience: "ctx",
      },
    });
  });

  it("throws on invalid MCP config instead of silently returning empty config", () => {
    expect(() => parseMcpConfig("{not-json}")).toThrow(/Invalid MCP config/);
  });
});
