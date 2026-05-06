import { compareReleaseVersions, normalizeReleaseVersion } from "./versionUtils";

describe("versionUtils", () => {
  describe("normalizeReleaseVersion", () => {
    it("strips leading v", () => {
      expect(normalizeReleaseVersion("v1.2.3")).toBe("1.2.3");
    });

    it("trims whitespace", () => {
      expect(normalizeReleaseVersion("  v2.0.0  ")).toBe("2.0.0");
    });

    it("preserves version without leading v", () => {
      expect(normalizeReleaseVersion("3.4.5")).toBe("3.4.5");
    });
  });

  describe("compareReleaseVersions", () => {
    it("returns 0 for equal versions", () => {
      expect(compareReleaseVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareReleaseVersions("v1.0.0", "1.0.0")).toBe(0);
    });

    it("returns positive when left > right", () => {
      expect(compareReleaseVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
      expect(compareReleaseVersions("1.2.3", "1.2.2")).toBeGreaterThan(0);
    });

    it("returns negative when left < right", () => {
      expect(compareReleaseVersions("1.0.0", "2.0.0")).toBeLessThan(0);
      expect(compareReleaseVersions("1.2.2", "1.2.3")).toBeLessThan(0);
    });

    it("handles different segment counts", () => {
      expect(compareReleaseVersions("1.2", "1.2.3")).toBeLessThan(0);
      expect(compareReleaseVersions("2", "1.9.9")).toBeGreaterThan(0);
    });

    it("handles non-numeric segments gracefully", () => {
      expect(compareReleaseVersions("v1.2.alpha", "1.2.0")).toBe(0);
    });

    it("handles development versions correctly", () => {
      expect(compareReleaseVersions("1.1.0", "1.0.4")).toBeGreaterThan(0);
      expect(compareReleaseVersions("0.9.0", "1.0.0")).toBeLessThan(0);
    });
  });
});
