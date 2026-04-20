import { buildMcpConfigDocument, parseMcpConfig } from "./mcpStore";

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

  it("serializes remote and stdio transports explicitly", () => {
    const document = buildMcpConfigDocument({
      mcpServers: {
        context7: {
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
          transport: "sse",
          url: "https://example.test/sse",
          headers: {},
          command: "",
          args: [],
          env: {},
        },
        chrome_devtools: {
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
});
