import { describe, it, expect } from 'vitest';
import {
  getProviderReferences,
  getModelReferences,
  canDeleteProvider,
  canDeleteModel,
  getCascadePreview,
} from './configRelations';
import type { AppState, ModelConfig, Profile } from './types';

// 辅助函数：创建测试用 AppState
function createTestState(
  models: Record<string, ModelConfig> = {},
  profiles: Record<string, Profile> = {}
): AppState {
  return {
    mainConfig: {
      default_model: 'test-model',
      default_thinking: false,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: 'vscode',
      theme: 'aurora',
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models,
      providers: {},
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: profiles,
    panelSettings: {
      locale: 'zh-CN',
      theme: 'auto',
      appearance: 'aurora',
      fontSize: 'standard',
      displayOpenMode: 'active-display',
      closeBehavior: 'quit',
      enableShortcuts: true,
      enableTray: true,
      enableTerminal: true,
      terminalApp: 'system-terminal',
      backupFrequency: 'daily',
      backupDestinationType: 'local',
      backupStrategy: 'manual',
    },
    skills: {},
    mcpConfig: { mcpServers: {} },
    backupSettings: {
      local: { destination: '' },
      webdav: { url: '', username: '', password: '' },
    },
    shortcuts: [],
  } as AppState;
}

describe('configRelations', () => {
  describe('getProviderReferences', () => {
    it('应该返回空数组当 state 为空时', () => {
      const state = createTestState();
      const result = getProviderReferences(state, 'provider1');
      expect(result).toEqual([]);
    });

    it('应该返回空数组当没有 Model 引用该 Provider 时', () => {
      const models = {
        model1: { provider: 'provider1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const state = createTestState(models);
      const result = getProviderReferences(state, 'provider2');
      expect(result).toEqual([]);
    });

    it('应该返回单个 Model 当有 1 个引用时', () => {
      const models = {
        model1: { provider: 'provider1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const state = createTestState(models);
      const result = getProviderReferences(state, 'provider1');
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('provider1');
    });

    it('应该返回多个 Model 当有多个引用时', () => {
      const models = {
        model1: { provider: 'provider1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
        model2: { provider: 'provider1', model: 'gpt-3.5', max_context_size: 4096, capabilities: [] },
        model3: { provider: 'provider2', model: 'claude', max_context_size: 100000, capabilities: [] },
      };
      const state = createTestState(models);
      const result = getProviderReferences(state, 'provider1');
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.provider === 'provider1')).toBe(true);
    });
  });

  describe('getModelReferences', () => {
    it('应该返回空数组当 state 为空时', () => {
      const state = createTestState();
      const result = getModelReferences(state, 'model1');
      expect(result).toEqual([]);
    });

    it('应该返回空数组当没有 Profile 引用该 Model 时', () => {
      const profiles = {
        profile1: {
          name: 'profile1',
          label: 'Profile 1',
          default_model: 'model1',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'aurora',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
      };
      const state = createTestState({}, profiles);
      const result = getModelReferences(state, 'model2');
      expect(result).toEqual([]);
    });

    it('应该返回单个 Profile 当有 1 个引用时', () => {
      const profiles = {
        profile1: {
          name: 'profile1',
          label: 'Profile 1',
          default_model: 'model1',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'aurora',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
      };
      const state = createTestState({}, profiles);
      const result = getModelReferences(state, 'model1');
      expect(result).toHaveLength(1);
      expect(result[0].default_model).toBe('model1');
    });

    it('应该返回多个 Profile 当有多个引用时', () => {
      const profiles = {
        profile1: {
          name: 'profile1',
          label: 'Profile 1',
          default_model: 'model1',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'aurora',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
        profile2: {
          name: 'profile2',
          label: 'Profile 2',
          default_model: 'model1',
          default_thinking: true,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'ocean',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
        profile3: {
          name: 'profile3',
          label: 'Profile 3',
          default_model: 'model2',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'violet',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
      };
      const state = createTestState({}, profiles);
      const result = getModelReferences(state, 'model1');
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.default_model === 'model1')).toBe(true);
    });
  });

  describe('canDeleteProvider', () => {
    it('应该返回 canDelete=true 当没有引用时', () => {
      const state = createTestState();
      const result = canDeleteProvider(state, 'provider1');
      expect(result.canDelete).toBe(true);
      expect(result.references).toEqual([]);
    });

    it('应该返回 canDelete=false 当有引用时', () => {
      const models = {
        model1: { provider: 'provider1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const state = createTestState(models);
      const result = canDeleteProvider(state, 'provider1');
      expect(result.canDelete).toBe(false);
      expect(result.references).toHaveLength(1);
    });

    it('应该返回所有引用的 Model', () => {
      const models = {
        model1: { provider: 'provider1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
        model2: { provider: 'provider1', model: 'gpt-3.5', max_context_size: 4096, capabilities: [] },
      };
      const state = createTestState(models);
      const result = canDeleteProvider(state, 'provider1');
      expect(result.canDelete).toBe(false);
      expect(result.references).toHaveLength(2);
    });
  });

  describe('canDeleteModel', () => {
    it('应该返回 canDelete=true 当没有引用时', () => {
      const state = createTestState();
      const result = canDeleteModel(state, 'model1');
      expect(result.canDelete).toBe(true);
      expect(result.references).toEqual([]);
    });

    it('应该返回 canDelete=false 当有引用时', () => {
      const profiles = {
        profile1: {
          name: 'profile1',
          label: 'Profile 1',
          default_model: 'model1',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'aurora',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
      };
      const state = createTestState({}, profiles);
      const result = canDeleteModel(state, 'model1');
      expect(result.canDelete).toBe(false);
      expect(result.references).toHaveLength(1);
    });

    it('应该返回所有引用的 Profile', () => {
      const profiles = {
        profile1: {
          name: 'profile1',
          label: 'Profile 1',
          default_model: 'model1',
          default_thinking: false,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'aurora',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
        profile2: {
          name: 'profile2',
          label: 'Profile 2',
          default_model: 'model1',
          default_thinking: true,
          default_yolo: false,
          default_plan_mode: false,
          default_editor: 'vscode',
          theme: 'ocean',
          show_thinking_stream: false,
          merge_all_available_skills: false,
        },
      };
      const state = createTestState({}, profiles);
      const result = canDeleteModel(state, 'model1');
      expect(result.canDelete).toBe(false);
      expect(result.references).toHaveLength(2);
    });
  });

  describe('getCascadePreview', () => {
    const makeProfile = (name: string, model: string): Profile => ({
      name,
      label: name,
      default_model: model,
      default_thinking: false,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: '',
      theme: 'dark',
      show_thinking_stream: false,
      merge_all_available_skills: false,
    });

    it('删除无依赖的 Provider 返回空影响', () => {
      const state = createTestState();
      const result = getCascadePreview(state, { type: 'provider', name: 'p1' });
      expect(result.affectedModels).toEqual([]);
      expect(result.affectedProfiles).toEqual([]);
      expect(result.isCurrentActive).toBe(false);
      expect(result.suggestedFallbackProfile).toBeNull();
    });

    it('删除有 Model 依赖的 Provider 返回 affectedModels', () => {
      const models: Record<string, ModelConfig> = {
        'm1': { provider: 'p1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
        'm2': { provider: 'p1', model: 'gpt-3.5', max_context_size: 4096, capabilities: [] },
        'm3': { provider: 'p2', model: 'claude', max_context_size: 100000, capabilities: [] },
      };
      const state = createTestState(models);
      const result = getCascadePreview(state, { type: 'provider', name: 'p1' });
      expect(result.affectedModels).toHaveLength(2);
      expect(result.affectedModels.map((m) => m.name)).toEqual(['m1', 'm2']);
    });

    it('删除 Provider 时级联找到受影响的 Profile', () => {
      const models: Record<string, ModelConfig> = {
        'm1': { provider: 'p1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const profiles: Record<string, Profile> = {
        'daily': makeProfile('daily', 'm1'),
        'safe': makeProfile('safe', 'm3'),
      };
      const state = createTestState(models, profiles);
      const result = getCascadePreview(state, { type: 'provider', name: 'p1' });
      expect(result.affectedModels).toHaveLength(1);
      expect(result.affectedProfiles).toHaveLength(1);
      expect(result.affectedProfiles[0].name).toBe('daily');
    });

    it('检测当前激活配置受影响并建议备选', () => {
      const models: Record<string, ModelConfig> = {
        'm1': { provider: 'p1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const profiles: Record<string, Profile> = {
        'daily': makeProfile('daily', 'm1'),
        'safe': makeProfile('safe', 'm3'),
      };
      const state = createTestState(models, profiles);
      state.activeProfile = 'daily';
      const result = getCascadePreview(state, { type: 'provider', name: 'p1' });
      expect(result.isCurrentActive).toBe(true);
      expect(result.suggestedFallbackProfile).toBe('safe');
    });

    it('无备选配置时 suggestedFallbackProfile 为 null', () => {
      const models: Record<string, ModelConfig> = {
        'm1': { provider: 'p1', model: 'gpt-4', max_context_size: 8192, capabilities: [] },
      };
      const profiles: Record<string, Profile> = {
        'daily': makeProfile('daily', 'm1'),
      };
      const state = createTestState(models, profiles);
      state.activeProfile = 'daily';
      const result = getCascadePreview(state, { type: 'provider', name: 'p1' });
      expect(result.isCurrentActive).toBe(true);
      expect(result.suggestedFallbackProfile).toBeNull();
    });

    it('删除 Model 仅返回受影响的 Profile', () => {
      const profiles: Record<string, Profile> = {
        'daily': makeProfile('daily', 'm1'),
        'exp': makeProfile('exp', 'm1'),
        'safe': makeProfile('safe', 'm2'),
      };
      const state = createTestState({}, profiles);
      const result = getCascadePreview(state, { type: 'model', name: 'm1' });
      expect(result.affectedModels).toEqual([]);
      expect(result.affectedProfiles).toHaveLength(2);
      expect(result.affectedProfiles.map((p) => p.name).sort()).toEqual(['daily', 'exp']);
    });
  });
});
