import { normalizeEntryName, ensureUniqueEntryName, buildModelName } from "@shared/nameRules";
import type { AppState, Locale, ModelConfig } from "@shared/types";
import { t } from "./i18n";

export function getApi() {
  return typeof window !== "undefined" ? window.kimiSwitch : undefined;
}

export function getMcpAction(
  api: ReturnType<typeof getApi>,
  action: "test" | "auth" | "reset-auth",
): ((name: string) => Promise<{ ok: true; stdout: string; stderr: string }>) | null {
  if (!api) {
    return null;
  }
  if (action === "test") {
    return typeof api.testMcpServer === "function" ? api.testMcpServer : null;
  }
  if (action === "auth") {
    return typeof api.authMcpServer === "function" ? api.authMcpServer : null;
  }
  return typeof api.resetMcpServerAuth === "function" ? api.resetMcpServerAuth : null;
}

export function getMcpActionNotice(locale: Locale, action: "test" | "auth" | "reset-auth"): string {
  if (action === "test") {
    return t(locale, "mcpTestSuccess");
  }
  if (action === "auth") {
    return t(locale, "mcpAuthStarted");
  }
  return t(locale, "mcpResetSuccess");
}

export function isEqualValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function collectDirtyKeys<T>(
  current: Record<string, T>,
  saved: Record<string, T>,
): Set<string> {
  const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
  return new Set(
    [...keys].filter((key) => !isEqualValue(current[key] ?? null, saved[key] ?? null)),
  );
}

export function isDraftEntry<T>(savedEntries: Record<string, T> | undefined, name: string): boolean {
  return Boolean(name) && !savedEntries?.[name];
}

export function createUniqueName(baseName: string, existingNames: string[]): string {
  const normalizedBaseName = normalizeEntryName(baseName) || "item";
  if (!existingNames.includes(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let index = 2;
  while (existingNames.includes(`${normalizedBaseName}-${index}`)) {
    index += 1;
  }
  return `${normalizedBaseName}-${index}`;
}

export function updateModelReferences(state: AppState, currentName: string, nextName: string): void {
  if (currentName === nextName) {
    return;
  }
  for (const profile of Object.values(state.profiles)) {
    if (profile.default_model === currentName) {
      profile.default_model = nextName;
    }
  }
  if (state.mainConfig.default_model === currentName) {
    state.mainConfig.default_model = nextName;
  }
}

export function renameModelInState(
  state: AppState,
  currentName: string,
  nextModel: ModelConfig,
): string {
  const nextName = buildModelName(nextModel.provider, nextModel.model);
  if (currentName !== nextName && state.mainConfig.models[nextName]) {
    throw new Error(`Model already exists: ${nextName}`);
  }

  const nextModels = { ...state.mainConfig.models };
  delete nextModels[currentName];
  nextModels[nextName] = nextModel;
  state.mainConfig.models = nextModels;
  updateModelReferences(state, currentName, nextName);
  return nextName;
}

export function renameProviderInState(
  state: AppState,
  currentName: string,
  nextNameInput: string,
  nextProvider: {
    type: string;
    base_url: string;
    api_key: string;
  },
): string {
  const nextName = ensureUniqueEntryName({
    kind: "Provider",
    name: nextNameInput,
    currentName,
    existingNames: Object.keys(state.mainConfig.providers),
  });

  const dependentModels = Object.entries(state.mainConfig.models).filter(([, model]) => model.provider === currentName);
  const dependentModelNames = new Set(dependentModels.map(([modelName]) => modelName));
  const nextModelEntries = dependentModels.map(([modelName, model]) => {
    const nextModelName = buildModelName(nextName, model.model);
    return {
      currentName: modelName,
      nextName: nextModelName,
      value: {
        ...model,
        provider: nextName,
      },
    };
  });

  const seenNames = new Set<string>();
  for (const entry of nextModelEntries) {
    if (seenNames.has(entry.nextName)) {
      throw new Error(`Model already exists: ${entry.nextName}`);
    }
    seenNames.add(entry.nextName);
    if (
      entry.currentName !== entry.nextName &&
      state.mainConfig.models[entry.nextName] &&
      !dependentModelNames.has(entry.nextName)
    ) {
      throw new Error(`Model already exists: ${entry.nextName}`);
    }
  }

  const nextProviders = { ...state.mainConfig.providers };
  delete nextProviders[currentName];
  nextProviders[nextName] = nextProvider;
  state.mainConfig.providers = nextProviders;

  const nextModels = { ...state.mainConfig.models };
  for (const entry of nextModelEntries) {
    delete nextModels[entry.currentName];
  }
  for (const entry of nextModelEntries) {
    nextModels[entry.nextName] = entry.value;
    updateModelReferences(state, entry.currentName, entry.nextName);
  }
  state.mainConfig.models = nextModels;

  return nextName;
}

export function getResourceLabel(
  locale: Locale,
  resource: "provider" | "model" | "profile" | "mcp",
): string {
  if (locale === "zh-CN") {
    if (resource === "provider") return "提供方";
    if (resource === "model") return "模型";
    if (resource === "profile") return "Profile";
    return "MCP";
  }
  if (locale === "zh-TW") {
    if (resource === "provider") return "提供者";
    if (resource === "model") return "模型";
    if (resource === "profile") return "Profile";
    return "MCP";
  }
  if (locale === "ja-JP") {
    if (resource === "provider") return "プロバイダー";
    if (resource === "model") return "モデル";
    if (resource === "profile") return "Profile";
    return "MCP";
  }
  if (locale === "de-DE") {
    if (resource === "provider") return "Provider";
    if (resource === "model") return "Modell";
    if (resource === "profile") return "Profil";
    return "MCP";
  }
  if (locale === "es-ES") {
    if (resource === "provider") return "proveedor";
    if (resource === "model") return "modelo";
    if (resource === "profile") return "perfil";
    return "MCP";
  }
  if (resource === "provider") return "provider";
  if (resource === "model") return "model";
  if (resource === "profile") return "profile";
  return "MCP";
}
