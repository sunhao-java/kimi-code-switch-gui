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

  it("infers sse transport from url when transport is absent", () => {
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

  it("serializes remote and stdio transports explicitly", () => {
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

    expect(document).toContain('"transport": "streamable-http"');
    expect(document).toContain('"transport": "sse"');
    expect(document).toContain('"transport": "stdio"');
    expect(document).not.toContain('"transport": "http"');
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
});
