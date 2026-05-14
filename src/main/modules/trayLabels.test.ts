import { describe, expect, it } from "vitest";
import { getTrayLabels } from "./trayLabels";

describe("getTrayLabels", () => {
  it("returns Chinese labels for zh-CN", () => {
    const labels = getTrayLabels("zh-CN");
    expect(labels.quit).toBe("退出");
    expect(labels.showWindow).toBe("显示/隐藏窗口");
    expect(labels.switchProfile).toBe("切换 Profile");
  });

  it("returns English labels for en-US", () => {
    const labels = getTrayLabels("en-US");
    expect(labels.quit).toBe("Quit");
    expect(labels.showWindow).toBe("Show / Hide Window");
    expect(labels.switchProfile).toBe("Switch Profile");
  });

  it("returns Japanese labels for ja-JP", () => {
    const labels = getTrayLabels("ja-JP");
    expect(labels.quit).toBe("終了");
    expect(labels.themeDark).toBe("ダーク");
  });

  it("falls back to en-US for unknown locale", () => {
    const labels = getTrayLabels("fr-FR" as never);
    expect(labels.quit).toBe("Quit");
    expect(labels.showWindow).toBe("Show / Hide Window");
  });

  it("returns all 8 label keys for every supported locale", () => {
    const keys = ["showWindow", "switchProfile", "switchLanguage", "switchTheme", "themeAuto", "themeLight", "themeDark", "quit"];
    for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE", "es-ES"] as const) {
      const labels = getTrayLabels(locale);
      for (const key of keys) {
        expect(labels[key as keyof typeof labels]).toBeTruthy();
      }
    }
  });
});
