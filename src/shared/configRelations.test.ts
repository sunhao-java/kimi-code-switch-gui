import { describe, it, expect } from 'vitest';
import {
  getProviderReferences,
  getModelReferences,
  canDeleteProvider,
  canDeleteModel,
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
});
