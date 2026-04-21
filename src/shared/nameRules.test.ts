import { buildModelName, ensureUniqueEntryName, normalizeEntryName } from "./nameRules";

describe("nameRules", () => {
  it("trims entry names", () => {
    expect(normalizeEntryName("  demo  ")).toBe("demo");
  });

  it("builds model names from provider and model id", () => {
    expect(buildModelName(" kimi ", " k2 ")).toBe("kimi/k2");
  });

  it("rejects blank model name parts", () => {
    expect(() => buildModelName("kimi", "   ")).toThrow(/Model provider and model ID are required/);
  });

  it("accepts the current name during uniqueness checks", () => {
    expect(
      ensureUniqueEntryName({
        kind: "Profile",
        name: "default",
        currentName: "default",
        existingNames: ["default", "work"],
      }),
    ).toBe("default");
  });

  it("rejects duplicate names", () => {
    expect(() =>
      ensureUniqueEntryName({
        kind: "Provider",
        name: "kimi",
        existingNames: ["kimi", "openai"],
      }),
    ).toThrow(/Provider already exists: kimi/);
  });

  it("rejects blank names", () => {
    expect(() =>
      ensureUniqueEntryName({
        kind: "MCP server",
        name: "   ",
        existingNames: [],
      }),
    ).toThrow(/MCP server name is required/);
  });
});
