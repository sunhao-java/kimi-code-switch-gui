import { useEffect } from "react";

import { getBrowserShortcutPlatform, normalizeAccelerator } from "@shared/shortcutStore";
import type { ShortcutAction, ShortcutBinding } from "@shared/types";

import type { TabId } from "./appOptions";

const TAB_ACTIONS: Partial<Record<ShortcutAction, TabId>> = {
  "tab.overview": "overview",
  "tab.profiles": "profiles",
  "tab.providers": "providers",
  "tab.models": "models",
  "tab.mcp": "mcp",
  "tab.skills": "skills",
  "tab.insights": "insights",
  "tab.settings": "settings",
};

const ALLOW_IN_EDITABLE: Set<ShortcutAction> = new Set(["app.globalSearch"]);

export function useShortcuts(options: {
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  onSave: () => void;
  onReload: () => void;
  onRefresh: () => void;
  onNavigate: (tab: TabId) => void;
  onGlobalSearch: () => void;
}): void {
  useEffect(() => {
    const bindings = new Map<string, ShortcutAction>();
    for (const binding of Object.values(options.shortcuts)) {
      if (binding.scope !== "window" || !binding.enabled || !binding.accelerator.trim()) {
        continue;
      }
      bindings.set(normalizeAccelerator(binding.accelerator).toLowerCase(), binding.action);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      if (document.body.dataset.shortcutRecording === "true") return;

      const action = eventToAcceleratorCandidates(event)
        .map((accelerator) => bindings.get(accelerator.toLowerCase()))
        .find(Boolean);
      if (!action) return;

      if (isEditableTarget(event.target) && !ALLOW_IN_EDITABLE.has(action)) {
        return;
      }

      event.preventDefault();
      executeShortcutAction(action, options);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options]);
}

export function eventToAccelerator(event: KeyboardEvent): string {
  return eventToAcceleratorCandidates(event)[0] ?? "";
}

function eventToAcceleratorCandidates(event: KeyboardEvent): string[] {
  const parts: string[] = [];
  const isMac = getBrowserShortcutPlatform() === "darwin";
  if (event.metaKey) parts.push(isMac ? "Command" : "Super");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = normalizeKey(event.key, event.code);
  if (key && !["Meta", "Control", "Alt", "Shift"].includes(key)) {
    parts.push(key);
  } else {
    return [];
  }

  const explicitAccelerator = parts.join("+");
  const portableParts = parts.map((part) => {
    if (isMac && part === "Command") return "CommandOrControl";
    if (!isMac && part === "Control") return "CommandOrControl";
    return part;
  });
  const portableAccelerator = portableParts.join("+");
  return portableAccelerator === explicitAccelerator
    ? [explicitAccelerator]
    : [explicitAccelerator, portableAccelerator];
}

function executeShortcutAction(
  action: ShortcutAction,
  options: {
    onSave: () => void;
    onReload: () => void;
    onRefresh: () => void;
    onNavigate: (tab: TabId) => void;
    onGlobalSearch: () => void;
  },
): void {
  if (action === "app.save") {
    options.onSave();
    return;
  }
  if (action === "app.reloadConfig") {
    options.onReload();
    return;
  }
  if (action === "app.globalSearch") {
    options.onGlobalSearch();
    return;
  }
  if (action === "app.refresh") {
    options.onRefresh();
    return;
  }

  const tab = TAB_ACTIONS[action];
  if (tab) {
    options.onNavigate(tab);
  }
}

function normalizeKey(key: string, code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (key === " ") return "Space";
  if (key.length === 1 && /^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  if (key.startsWith("Arrow")) return key.replace("Arrow", "");
  if (/^F\d{1,2}$/.test(key)) return key;
  return /^[\x20-\x7E]+$/.test(key) ? key : "";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}
