import { describe, expect, it } from "vitest";
import { ConfigResolver, ConfigTarget, parseConfigTarget } from "./configTarget";

describe("ConfigTarget", () => {
  describe("ConfigResolver", () => {
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
    it("parses kimi-code correctly", () => {
      expect(parseConfigTarget("kimi-code")).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(ConfigTarget.KimiCode)).toBe(ConfigTarget.KimiCode);
    });

    it("always resolves historical and unknown values to kimi-code", () => {
      expect(parseConfigTarget("kimi-cli")).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget("unknown")).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(null)).toBe(ConfigTarget.KimiCode);
      expect(parseConfigTarget(undefined)).toBe(ConfigTarget.KimiCode);
    });
  });
});
