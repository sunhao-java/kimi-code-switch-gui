import {
  createDefaultShortcuts,
  formatAcceleratorForPlatform,
  getShortcutConflicts,
  isValidAccelerator,
  normalizeShortcuts,
  resetShortcutBinding,
  sanitizeAccelerator,
} from "./shortcutStore";

describe("shortcutStore", () => {
  it("creates complete default shortcuts", () => {
    const shortcuts = createDefaultShortcuts();
    expect(Object.keys(shortcuts)).not.toContain("window.show");
    expect(Object.keys(shortcuts)).not.toContain("window.hide");
    expect(shortcuts["window.toggle"].accelerator).toBe("CommandOrControl+Shift+K");
    expect(shortcuts["window.toggle"].scope).toBe("global");
    expect(shortcuts["app.save"].accelerator).toBe("CommandOrControl+S");
    expect(shortcuts["tab.settings"].accelerator).toBe("CommandOrControl+8");
  });

  it("normalizes missing and partial shortcut settings", () => {
    const shortcuts = normalizeShortcuts({
      "app.save": {
        accelerator: " CommandOrControl + Shift + S ",
        enabled: false,
      },
      "unknown.action": {
        accelerator: "CommandOrControl+X",
        enabled: true,
      },
    });

    expect(shortcuts["app.save"].accelerator).toBe("CommandOrControl+Shift+S");
    expect(shortcuts["app.save"].enabled).toBe(false);
    expect(shortcuts["app.save"].scope).toBe("window");
    expect(shortcuts["window.toggle"].accelerator).toBe("CommandOrControl+Shift+K");
  });

  it("drops non-ASCII shortcut accelerators", () => {
    const shortcuts = normalizeShortcuts({
      "window.toggle": {
        accelerator: "Alt+Μ",
        enabled: true,
      },
    });

    expect(shortcuts["window.toggle"].accelerator).toBe("");
    expect(shortcuts["window.toggle"].enabled).toBe(false);
    expect(sanitizeAccelerator("Alt+Μ")).toBe("");
    expect(isValidAccelerator("Alt+M")).toBe(true);
    expect(isValidAccelerator("Alt+Μ")).toBe(false);
  });

  it("resets a shortcut binding to its default value", () => {
    expect(resetShortcutBinding("app.reloadConfig")).toEqual({
      action: "app.reloadConfig",
      accelerator: "CommandOrControl+R",
      enabled: true,
      scope: "window",
    });
  });

  it("detects conflicts within the same scope", () => {
    const shortcuts = createDefaultShortcuts();
    shortcuts["tab.overview"] = {
      ...shortcuts["tab.overview"],
      accelerator: "CommandOrControl+S",
    };

    expect(getShortcutConflicts(shortcuts)).toEqual([
      {
        accelerator: "commandorcontrol+s",
        scope: "window",
        actions: ["app.save", "tab.overview"],
      },
    ]);
  });

  it("does not report disabled or cross-scope duplicate accelerators", () => {
    const shortcuts = createDefaultShortcuts();
    shortcuts["window.toggle"] = {
      ...shortcuts["window.toggle"],
      accelerator: "CommandOrControl+S",
    };
    shortcuts["tab.overview"] = {
      ...shortcuts["tab.overview"],
      accelerator: "CommandOrControl+S",
      enabled: false,
    };

    expect(getShortcutConflicts(shortcuts)).toEqual([]);
  });

  it("formats accelerators for macOS and non-macOS platforms", () => {
    expect(formatAcceleratorForPlatform("CommandOrControl+Shift+K", "darwin")).toBe("⌘+⇧+K");
    expect(formatAcceleratorForPlatform("CommandOrControl+Shift+K", "win32")).toBe("Ctrl+Shift+K");
    expect(formatAcceleratorForPlatform("Super+Shift+K", "win32")).toBe("Win+Shift+K");
    expect(formatAcceleratorForPlatform("Super+Shift+K", "linux")).toBe("Super+Shift+K");
    expect(formatAcceleratorForPlatform("Command+Shift+K", "darwin")).toBe("⌘+⇧+K");
  });
});
