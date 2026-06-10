import { describe, expect, it } from "vitest";
import { ConfigResolver, ConfigTarget, parseConfigTarget } from "./configTarget";

describe("ConfigTarget", () => {
  describe("ConfigResolver", () => {
    it("resolves kimi-cli paths correctly", () => {
      const resolver = new ConfigResolver(ConfigTarget.KimiCli);
      expect(resolver.getConfigDir()).toBe(".kimi");
      expect(resolver.getConfigPath("config.toml")).toBe(".kimi/config.toml");
      expect(resolver.supportsProfiles()).toBe(false);
      expect(resolver.supportsPanel()).toBe(false);
      expect(resolver.supportsTui()).toBe(false);
      expect(resolver.getMcpConfigFile()).toBe("mcp.json");
      expect(resolver.getHomeEnvVar()).toBe("KIMI_HOME");
      expect(resolver.getDisplayName()).toBe("Kimi CLI");
    });

    it("resolves kimi-code paths correctly", () => {
      const resolver = new ConfigResolver(ConfigTarget.KimiCode);
      expect(resolver.getConfigDir()).toBe(".kimi-code");
      expect(resolver.getConfigPath("config.toml")).toBe(".kimi-code/config.toml");
      expect(resolver.supportsProfiles()).toBe(true);
      expect(resolver.supportsPanel()).toBe(true);
      expect(resolver.supportsTui()).toBe(true);
      expect(resolver.getMcpConfigFile()).toBe("mcp.json");
      expect(resolver.getHomeEnvVar()).toBe("KIMI_CODE_HOME");
      expect(resolver.getDisplayName()).toBe("Kimi Code");
    });
  });

  describe("parseConfigTarget", () => {
    it("parses kimi-cli correctly", () => {
      expect(parseConfigTarget("kimi-cli")).toBe(ConfigTarget.KimiCli);
      expect(parseConfigTarget(ConfigTarget.KimiCli)).toBe(ConfigTarget.KimiCli);
    });

    it("parses kimi-code correctly", () => {
      expect(parseConfigTarget("kimi-code")).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(ConfigTarget.KimiCode)).toBe(ConfigTarget.KimiCode);
    });

    it("defaults to kimi-code for unknown values", () => {
      expect(parseConfigTarget("unknown")).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(null)).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(undefined)).toBe(ConfigTarget.KimiCode);
    });
  });
});
