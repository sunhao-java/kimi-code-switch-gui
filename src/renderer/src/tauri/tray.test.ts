import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState } from "@shared/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ exit: vi.fn() }));
vi.mock("@shared/configStore", () => ({
  applyProfile: vi.fn(),
  loadAppState: vi.fn(),
  saveAppState: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import { applyProfile, loadAppState, saveAppState } from "@shared/configStore";

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);
const mockedExit = vi.mocked(exit);
const mockedApplyProfile = vi.mocked(applyProfile);
const mockedLoadAppState = vi.mocked(loadAppState);
const mockedSaveAppState = vi.mocked(saveAppState);

type TrayHandler = (e: { payload: string }) => Promise<void> | void;
type TrayModule = typeof import("./tray");

interface MenuItemSpec {
  id?: string;
  label?: string;
  separator?: boolean;
  checked?: boolean;
  submenu?: MenuItemSpec[];
}

// setupTray caches its `unlisten` at module scope and only registers the listener once,
// so each test re-imports a fresh module to reset that cache. The listen callback is
// captured via mockImplementation regardless of which test triggers the registration.
let capturedHandler: TrayHandler | null = null;
let tray: TrayModule;

function createState(overrides: Partial<AppState["panelSettings"]> = {}): AppState {
  return {
    activeProfile: "work",
    profiles: {
      default: { name: "default", label: "Default" },
      work: { name: "work", label: "" },
    },
    panelSettings: {
      tray_icon: true,
      locale: "zh-CN",
      theme: "dark",
      ...overrides,
    },
  } as unknown as AppState;
}

/** Pulls the menu array passed to the most recent set_tray invoke with enabled:true. */
function lastMenu(): MenuItemSpec[] {
  const call = [...mockedInvoke.mock.calls]
    .reverse()
    .find((c) => c[0] === "set_tray" && (c[1] as { enabled: boolean }).enabled);
  if (!call) throw new Error("no enabled set_tray call");
  return (call[1] as { menu: MenuItemSpec[] }).menu;
}

function findSubmenu(menu: MenuItemSpec[], label: string): MenuItemSpec[] {
  const item = menu.find((m) => m.label === label);
  if (!item?.submenu) throw new Error(`submenu not found: ${label}`);
  return item.submenu;
}

beforeEach(async () => {
  mockedInvoke.mockReset();
  mockedInvoke.mockResolvedValue(undefined as unknown as never);
  mockedExit.mockReset();
  mockedApplyProfile.mockReset();
  mockedLoadAppState.mockReset();
  mockedSaveAppState.mockReset();

  capturedHandler = null;
  mockedListen.mockReset();
  mockedListen.mockImplementation((_event: string, cb: unknown) => {
    capturedHandler = cb as TrayHandler;
    return Promise.resolve(vi.fn());
  });

  // Fresh module per test so the module-level `unlisten` cache is cleared.
  vi.resetModules();
  tray = await import("./tray");
});

describe("buildMenu (observed via set_tray payload)", () => {
  it("disables the tray when tray_icon is off", async () => {
    await tray.setupTray(() => createState({ tray_icon: false }), vi.fn());
    expect(mockedInvoke).toHaveBeenCalledWith("set_tray", { enabled: false, menu: [], tooltip: null });
  });

  it("disables the tray when there is no state", async () => {
    await tray.setupTray(() => null, vi.fn());
    expect(mockedInvoke).toHaveBeenCalledWith("set_tray", { enabled: false, menu: [], tooltip: null });
  });

  it("builds a menu with show/profile/language/theme/quit and a tooltip", async () => {
    await tray.setupTray(() => createState(), vi.fn());
    const menu = lastMenu();
    const ids = menu.map((m) => m.id ?? (m.separator ? "<sep>" : `<group:${m.label}>`));
    expect(ids).toContain("show-window");
    expect(ids).toContain("quit");
    expect(menu.filter((m) => m.separator)).toHaveLength(2);
  });

  it("marks the active profile checked and renders label+name", async () => {
    await tray.setupTray(() => createState(), vi.fn());
    const profiles = findSubmenu(lastMenu(), "切换 Profile");
    const work = profiles.find((p) => p.id === "profile:work");
    const def = profiles.find((p) => p.id === "profile:default");
    expect(work?.checked).toBe(true);
    expect(def?.checked).toBe(false);
    expect(def?.label).toBe("Default (default)"); // label present -> "label (name)"
    expect(work?.label).toBe("work"); // empty label -> bare name
  });

  it("marks the active locale checked among all six locales", async () => {
    await tray.setupTray(() => createState({ locale: "ja-JP" }), vi.fn());
    const languages = findSubmenu(lastMenu(), "言語"); // ja-JP label for "language"
    expect(languages).toHaveLength(6);
    expect(languages.find((l) => l.id === "locale:ja-JP")?.checked).toBe(true);
    expect(languages.find((l) => l.id === "locale:zh-CN")?.checked).toBe(false);
  });

  it("marks the active theme checked", async () => {
    await tray.setupTray(() => createState({ theme: "light" }), vi.fn());
    const themes = findSubmenu(lastMenu(), "切换主题");
    expect(themes.find((t) => t.id === "theme:light")?.checked).toBe(true);
    expect(themes.find((t) => t.id === "theme:dark")?.checked).toBe(false);
    expect(themes.find((t) => t.id === "theme:auto")?.checked).toBe(false);
  });

  it("falls back to en-US labels for an unknown locale", async () => {
    await tray.setupTray(() => createState({ locale: "xx-YY" as AppState["panelSettings"]["locale"] }), vi.fn());
    const menu = lastMenu();
    expect(menu.find((m) => m.id === "show-window")?.label).toBe("Show Window");
  });
});

describe("tray://command action routing", () => {
  async function dispatch(action: string, getState: () => AppState | null, onReload = vi.fn()): Promise<void> {
    await tray.setupTray(getState, onReload);
    if (!capturedHandler) throw new Error("listen handler was not registered");
    await capturedHandler({ payload: action });
  }

  it("show-window invokes show_main_window", async () => {
    await dispatch("show-window", () => createState());
    expect(mockedInvoke).toHaveBeenCalledWith("show_main_window");
  });

  it("quit exits the process", async () => {
    await dispatch("quit", () => createState());
    expect(mockedExit).toHaveBeenCalledWith(0);
  });

  it("profile:<name> applies the profile, persists, reloads and rebuilds the tray", async () => {
    const state = createState();
    mockedLoadAppState.mockResolvedValue(createState());
    const onReload = vi.fn();
    await dispatch("profile:default", () => state, onReload);

    expect(mockedApplyProfile).toHaveBeenCalledWith(state, "default");
    expect(mockedSaveAppState).toHaveBeenCalled();
    expect(mockedLoadAppState).toHaveBeenCalled();
    expect(onReload).toHaveBeenCalled();
  });

  it("locale:<loc> mutates locale, saves and rebuilds", async () => {
    const state = createState();
    const onReload = vi.fn();
    await dispatch("locale:en-US", () => state, onReload);
    expect(state.panelSettings.locale).toBe("en-US");
    expect(mockedSaveAppState).toHaveBeenCalled();
    expect(onReload).toHaveBeenCalled();
  });

  it("theme:<value> mutates theme, saves and rebuilds", async () => {
    const state = createState();
    await dispatch("theme:light", () => state);
    expect(state.panelSettings.theme).toBe("light");
    expect(mockedSaveAppState).toHaveBeenCalled();
  });

  it("ignores commands when state is unavailable at dispatch time", async () => {
    let current: AppState | null = createState();
    await tray.setupTray(() => current, vi.fn());
    if (!capturedHandler) throw new Error("listen handler was not registered");
    mockedInvoke.mockClear();
    current = null;
    await capturedHandler({ payload: "show-window" });
    expect(mockedInvoke).not.toHaveBeenCalledWith("show_main_window");
  });
});

describe("teardownTray", () => {
  it("disables the tray", async () => {
    await tray.teardownTray();
    expect(mockedInvoke).toHaveBeenCalledWith("set_tray", { enabled: false, menu: [], tooltip: null });
  });
});
