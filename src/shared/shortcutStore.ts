import type { LocalizedText, ShortcutAction, ShortcutBinding, ShortcutScope } from "./types";

export interface ShortcutActionDefinition {
  action: ShortcutAction;
  scope: ShortcutScope;
  defaultAccelerator: string;
  defaultEnabled: boolean;
  label: LocalizedText;
}

export interface ShortcutConflict {
  accelerator: string;
  scope: ShortcutScope;
  actions: ShortcutAction[];
}

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  {
    action: "window.toggle",
    scope: "global",
    defaultAccelerator: "CommandOrControl+Shift+K",
    defaultEnabled: true,
    label: {
      "zh-CN": "显示/隐藏主窗口",
      "zh-TW": "顯示/隱藏主視窗",
      "en-US": "Show / Hide Window",
      "ja-JP": "メインウィンドウを表示/非表示",
      "de-DE": "Hauptfenster anzeigen/ausblenden",
      "es-ES": "Mostrar/Ocultar ventana principal",
    },
  },
  {
    action: "profile.next",
    scope: "global",
    defaultAccelerator: "",
    defaultEnabled: false,
    label: {
      "zh-CN": "切换到下一个 Profile",
      "zh-TW": "切換到下一個 Profile",
      "en-US": "Next Profile",
      "ja-JP": "次の Profile へ切り替え",
      "de-DE": "Zum nächsten Profil wechseln",
      "es-ES": "Cambiar al perfil siguiente",
    },
  },
  {
    action: "profile.previous",
    scope: "global",
    defaultAccelerator: "",
    defaultEnabled: false,
    label: {
      "zh-CN": "切换到上一个 Profile",
      "zh-TW": "切換到上一個 Profile",
      "en-US": "Previous Profile",
      "ja-JP": "前の Profile へ切り替え",
      "de-DE": "Zum vorherigen Profil wechseln",
      "es-ES": "Cambiar al perfil anterior",
    },
  },
  {
    action: "app.reloadConfig",
    scope: "window",
    defaultAccelerator: "CommandOrControl+R",
    defaultEnabled: true,
    label: {
      "zh-CN": "重新加载配置",
      "zh-TW": "重新載入設定",
      "en-US": "Reload Config",
      "ja-JP": "設定を再読み込み",
      "de-DE": "Konfiguration neu laden",
      "es-ES": "Recargar configuración",
    },
  },
  {
    action: "app.save",
    scope: "window",
    defaultAccelerator: "CommandOrControl+S",
    defaultEnabled: true,
    label: {
      "zh-CN": "保存全部",
      "zh-TW": "全部儲存",
      "en-US": "Save All",
      "ja-JP": "すべて保存",
      "de-DE": "Alles speichern",
      "es-ES": "Guardar todo",
    },
  },
  {
    action: "tab.overview",
    scope: "window",
    defaultAccelerator: "CommandOrControl+1",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到总览",
      "zh-TW": "切換到總覽",
      "en-US": "Switch to Overview",
      "ja-JP": "概要へ切り替え",
      "de-DE": "Zur Übersicht wechseln",
      "es-ES": "Cambiar a Resumen",
    },
  },
  {
    action: "tab.profiles",
    scope: "window",
    defaultAccelerator: "CommandOrControl+2",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到 Profiles",
      "zh-TW": "切換到 Profiles",
      "en-US": "Switch to Profiles",
      "ja-JP": "Profiles へ切り替え",
      "de-DE": "Zu Profilen wechseln",
      "es-ES": "Cambiar a Perfiles",
    },
  },
  {
    action: "tab.providers",
    scope: "window",
    defaultAccelerator: "CommandOrControl+3",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到 Providers",
      "zh-TW": "切換到 Providers",
      "en-US": "Switch to Providers",
      "ja-JP": "Providers へ切り替え",
      "de-DE": "Zu Providern wechseln",
      "es-ES": "Cambiar a Proveedores",
    },
  },
  {
    action: "tab.models",
    scope: "window",
    defaultAccelerator: "CommandOrControl+4",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到 Models",
      "zh-TW": "切換到 Models",
      "en-US": "Switch to Models",
      "ja-JP": "Models へ切り替え",
      "de-DE": "Zu Modellen wechseln",
      "es-ES": "Cambiar a Modelos",
    },
  },
  {
    action: "tab.mcp",
    scope: "window",
    defaultAccelerator: "CommandOrControl+5",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到 MCP",
      "zh-TW": "切換到 MCP",
      "en-US": "Switch to MCP",
      "ja-JP": "MCP へ切り替え",
      "de-DE": "Zu MCP wechseln",
      "es-ES": "Cambiar a MCP",
    },
  },
  {
    action: "tab.skills",
    scope: "window",
    defaultAccelerator: "CommandOrControl+6",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到 Skills",
      "zh-TW": "切換到 Skills",
      "en-US": "Switch to Skills",
      "ja-JP": "Skills へ切り替え",
      "de-DE": "Zu Skills wechseln",
      "es-ES": "Cambiar a Skills",
    },
  },
  {
    action: "tab.settings",
    scope: "window",
    defaultAccelerator: "CommandOrControl+7",
    defaultEnabled: true,
    label: {
      "zh-CN": "切换到设置",
      "zh-TW": "切換到設定",
      "en-US": "Switch to Settings",
      "ja-JP": "設定へ切り替え",
      "de-DE": "Zu Einstellungen wechseln",
      "es-ES": "Cambiar a Ajustes",
    },
  },
];

export const SHORTCUT_ACTION_SET = new Set<ShortcutAction>(
  SHORTCUT_ACTIONS.map((definition) => definition.action),
);

export function createDefaultShortcuts(): Record<ShortcutAction, ShortcutBinding> {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [
      definition.action,
      {
        action: definition.action,
        accelerator: definition.defaultAccelerator,
        enabled: definition.defaultEnabled,
        scope: definition.scope,
      },
    ]),
  ) as Record<ShortcutAction, ShortcutBinding>;
}

export function normalizeShortcuts(value: unknown): Record<ShortcutAction, ShortcutBinding> {
  const defaults = createDefaultShortcuts();
  if (!isRecord(value)) {
    return defaults;
  }

  for (const definition of SHORTCUT_ACTIONS) {
    const raw = value[definition.action];
    if (!isRecord(raw)) {
      continue;
    }

    const accelerator = typeof raw.accelerator === "string"
      ? sanitizeAccelerator(raw.accelerator)
      : defaults[definition.action].accelerator;
    defaults[definition.action] = {
      action: definition.action,
      accelerator,
      enabled: Boolean(accelerator.trim()) && (typeof raw.enabled === "boolean" ? raw.enabled : defaults[definition.action].enabled),
      scope: definition.scope,
    };
  }

  return defaults;
}

export function resetShortcutBinding(action: ShortcutAction): ShortcutBinding {
  const defaults = createDefaultShortcuts();
  return defaults[action];
}

export function getShortcutConflicts(shortcuts: Record<ShortcutAction, ShortcutBinding>): ShortcutConflict[] {
  const groups = new Map<string, ShortcutAction[]>();

  for (const binding of Object.values(shortcuts)) {
    if (!binding.enabled || !binding.accelerator.trim() || !isValidAccelerator(binding.accelerator)) {
      continue;
    }
    const key = `${binding.scope}:${normalizeAccelerator(binding.accelerator).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), binding.action]);
  }

  return [...groups.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([key, actions]) => {
      const [scope, accelerator] = key.split(":");
      return {
        accelerator,
        scope: scope as ShortcutScope,
        actions,
      };
    });
}

export function isShortcutAction(value: string): value is ShortcutAction {
  return SHORTCUT_ACTION_SET.has(value as ShortcutAction);
}

export function normalizeAccelerator(value: string): string {
  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("+");
}

export function sanitizeAccelerator(value: string): string {
  const accelerator = normalizeAccelerator(value);
  return isValidAccelerator(accelerator) ? accelerator : "";
}

export function isValidAccelerator(value: string): boolean {
  const accelerator = normalizeAccelerator(value);
  return !accelerator || /^[\x20-\x7E]+$/.test(accelerator);
}

export function formatAcceleratorForPlatform(accelerator: string, platform: NodeJS.Platform | string = getRuntimePlatform()): string {
  if (!accelerator.trim()) {
    return "";
  }

  const isMac = platform === "darwin";
  const isWindows = platform === "win32";
  return accelerator
    .split("+")
    .map((part) => {
      if (!isMac) {
        if (part === "CommandOrControl" || part === "Control") return "Ctrl";
        if (part === "Command" || part === "Super") return isWindows ? "Win" : "Super";
        return part;
      }
      if (part === "CommandOrControl" || part === "Command") return "⌘";
      if (part === "Control") return "⌃";
      if (part === "Alt" || part === "Option") return "⌥";
      if (part === "Shift") return "⇧";
      return part;
    })
    .join("+");
}

export function getBrowserShortcutPlatform(): string {
  if (typeof navigator === "undefined") {
    return getRuntimePlatform();
  }
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "darwin";
  }
  if (platform.includes("win") || userAgent.includes("windows")) {
    return "win32";
  }
  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRuntimePlatform(): string {
  return typeof process !== "undefined" ? process.platform : "";
}
