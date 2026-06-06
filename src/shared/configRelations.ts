/**
 * 配置关系工具函数模块
 * 提供 Provider/Model/Profile 之间的引用关系计算和删除前检查
 */

import type { AppState, ModelConfig, Profile } from './types';

/**
 * 获取引用指定 Provider 的所有 Model
 * @param state 应用状态
 * @param providerName Provider 名称
 * @returns 引用该 Provider 的 ModelConfig 数组
 */
export function getProviderReferences(
  state: AppState,
  providerName: string
): ModelConfig[] {
  if (!state?.mainConfig?.models) {
    return [];
  }

  return Object.values(state.mainConfig.models).filter(
    (model) => model.provider === providerName
  );
}

/**
 * 获取引用指定 Model 的所有 Profile
 * @param state 应用状态
 * @param modelName Model 名称
 * @returns 引用该 Model 的 Profile 数组
 */
export function getModelReferences(
  state: AppState,
  modelName: string
): Profile[] {
  if (!state?.profiles) {
    return [];
  }

  return Object.values(state.profiles).filter(
    (profile) => profile.default_model === modelName
  );
}

/**
 * 检查是否可以删除 Provider
 * @param state 应用状态
 * @param providerName Provider 名称
 * @returns { canDelete: boolean, references: ModelConfig[] }
 */
export function canDeleteProvider(
  state: AppState,
  providerName: string
): { canDelete: boolean; references: ModelConfig[] } {
  const references = getProviderReferences(state, providerName);
  return {
    canDelete: references.length === 0,
    references,
  };
}

/**
 * 检查是否可以删除 Model
 * @param state 应用状态
 * @param modelName Model 名称
 * @returns { canDelete: boolean, references: Profile[] }
 */
export function canDeleteModel(
  state: AppState,
  modelName: string
): { canDelete: boolean; references: Profile[] } {
  const references = getModelReferences(state, modelName);
  return {
    canDelete: references.length === 0,
    references,
  };
}

export interface CascadeImpact {
  affectedModels: Array<{ name: string; model: ModelConfig }>;
  affectedProfiles: Array<{ name: string; profile: Profile }>;
  isCurrentActive: boolean;
  suggestedFallbackProfile: string | null;
}

export function getCascadePreview(
  state: AppState,
  target: { type: 'provider' | 'model'; name: string },
): CascadeImpact {
  if (!state?.mainConfig?.models || !state?.profiles) {
    return { affectedModels: [], affectedProfiles: [], isCurrentActive: false, suggestedFallbackProfile: null };
  }

  const affectedModels: CascadeImpact['affectedModels'] = [];
  const affectedProfiles: CascadeImpact['affectedProfiles'] = [];

  if (target.type === 'provider') {
    for (const [name, model] of Object.entries(state.mainConfig.models)) {
      if (model.provider === target.name) {
        affectedModels.push({ name, model });
      }
    }
    const affectedModelNames = new Set(affectedModels.map((m) => m.name));
    for (const [name, profile] of Object.entries(state.profiles)) {
      if (affectedModelNames.has(profile.default_model)) {
        affectedProfiles.push({ name, profile });
      }
    }
  } else {
    for (const [name, profile] of Object.entries(state.profiles)) {
      if (profile.default_model === target.name) {
        affectedProfiles.push({ name, profile });
      }
    }
  }

  const isCurrentActive = affectedProfiles.some((p) => p.name === state.activeProfile);

  let suggestedFallbackProfile: string | null = null;
  if (isCurrentActive) {
    const affectedNames = new Set(affectedProfiles.map((p) => p.name));
    const fallback = Object.keys(state.profiles).find((n) => !affectedNames.has(n));
    suggestedFallbackProfile = fallback ?? null;
  }

  return { affectedModels, affectedProfiles, isCurrentActive, suggestedFallbackProfile };
}
