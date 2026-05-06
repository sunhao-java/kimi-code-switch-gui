import { globalShortcut } from "electron";

import { isValidAccelerator, normalizeShortcuts } from "@shared/shortcutStore";
import type { AppState, ShortcutAction } from "@shared/types";

export interface GlobalShortcutHandlers {
  toggleWindow: () => void;
  activateNextProfile: () => void;
  activatePreviousProfile: () => void;
}

const registeredAccelerators = new Set<string>();

export function registerGlobalShortcuts(state: AppState, handlers: GlobalShortcutHandlers): void {
  unregisterGlobalShortcuts();

  const shortcuts = normalizeShortcuts(state.panelSettings.shortcuts);
  for (const binding of Object.values(shortcuts)) {
    if (binding.scope !== "global" || !binding.enabled || !binding.accelerator.trim()) {
      continue;
    }

    const handler = getGlobalShortcutHandler(binding.action, handlers);
    if (!handler) {
      continue;
    }

    if (!isValidAccelerator(binding.accelerator)) {
      console.warn(`Skip invalid global shortcut: ${binding.action} (${binding.accelerator})`);
      continue;
    }

    let registered = false;
    try {
      registered = globalShortcut.register(binding.accelerator, handler);
    } catch (error) {
      console.warn(`Failed to register global shortcut: ${binding.action} (${binding.accelerator})`, error);
      continue;
    }
    if (registered) {
      registeredAccelerators.add(binding.accelerator);
    } else {
      console.warn(`Failed to register global shortcut: ${binding.action} (${binding.accelerator})`);
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  for (const accelerator of registeredAccelerators) {
    globalShortcut.unregister(accelerator);
  }
  registeredAccelerators.clear();
}

function getGlobalShortcutHandler(
  action: ShortcutAction,
  handlers: GlobalShortcutHandlers,
): (() => void) | null {
  switch (action) {
    case "window.toggle":
      return handlers.toggleWindow;
    case "profile.next":
      return handlers.activateNextProfile;
    case "profile.previous":
      return handlers.activatePreviousProfile;
    case "app.reloadConfig":
    case "app.save":
    case "tab.overview":
    case "tab.profiles":
    case "tab.providers":
    case "tab.models":
    case "tab.mcp":
    case "tab.skills":
    case "tab.settings":
      return null;
  }
}
