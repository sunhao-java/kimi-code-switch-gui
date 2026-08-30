import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { McpServerConfig } from "@shared/types";

import { McpServerForm } from "./mcpComponents";

const remoteServer: McpServerConfig = {
  enabled: true,
  transport: "streamable-http",
  url: "https://mcp.example.com",
  headers: { Authorization: "Bearer token" },
  command: "",
  args: [],
  env: {},
};

describe("McpServerForm", () => {
  it("resets transport-specific fields when switching to stdio", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <McpServerForm
        locale="en-US"
        name="remote"
        nameEditable
        value={remoteServer}
        isTesting={false}
        onRunAction={vi.fn()}
        onChange={onChange}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(getByRole("radio", { name: /stdio/i }));

    expect(onChange).toHaveBeenCalledWith("remote", {
      enabled: true,
      transport: "stdio",
      url: "",
      headers: {},
      command: "",
      args: [],
      env: {},
      extra: undefined,
    });
  });
});
