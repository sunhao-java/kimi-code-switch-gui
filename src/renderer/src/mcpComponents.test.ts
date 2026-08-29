import { describe, expect, it } from "vitest";

import type { McpServerConfig } from "@shared/types";

import {
  formatListLines,
  formatRecordLines,
  isRemoteMcpTransport,
  parseListLines,
  parseRecordLines,
  switchMcpTransport,
} from "./mcpComponents";

const stdioServer: McpServerConfig = {
  enabled: true,
  transport: "stdio",
  url: "",
  headers: {},
  command: "node",
  args: ["server.js", "--verbose"],
  env: { TOKEN: "secret" },
  extra: { timeout: 30 },
};

describe("MCP line parsing", () => {
  it("trims and removes empty list lines", () => {
    expect(parseListLines(" server.js \n\n --verbose \n")).toEqual(["server.js", "--verbose"]);
    expect(formatListLines(["server.js", "--verbose"])).toBe("server.js\n--verbose");
  });

  it("parses equals and colon record separators without truncating values", () => {
    expect(parseRecordLines("Authorization=Bearer token=value\nX-Trace: abc:def\ninvalid"))
      .toEqual({ Authorization: "Bearer token=value", "X-Trace": "abc:def" });
  });

  it("formats records as one key-value pair per line", () => {
    expect(formatRecordLines({ Authorization: "Bearer token", "X-Trace": "abc" }))
      .toBe("Authorization=Bearer token\nX-Trace=abc");
  });
});

describe("MCP transport switching", () => {
  it("returns the same object when the transport is unchanged", () => {
    expect(switchMcpTransport(stdioServer, "stdio")).toBe(stdioServer);
  });

  it("clears transport-specific fields while preserving common metadata", () => {
    expect(switchMcpTransport(stdioServer, "streamable-http")).toEqual({
      enabled: true,
      transport: "streamable-http",
      url: "",
      headers: {},
      command: "",
      args: [],
      env: {},
      extra: { timeout: 30 },
    });
  });

  it("treats every non-stdio transport as remote", () => {
    expect(isRemoteMcpTransport("stdio")).toBe(false);
    expect(isRemoteMcpTransport("streamable-http")).toBe(true);
    expect(isRemoteMcpTransport("sse")).toBe(true);
  });
});
