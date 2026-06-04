export interface SourcePreset {
  id: string;
  name: string;
  description: string;
  defaultEndpoint: string;
  providerType: string;
  authType: 'bearer' | 'x-api-key' | 'none';
  commonModels: string[];
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'ChatGPT / GPT-4 / GPT-4o',
    defaultEndpoint: 'https://api.openai.com/v1',
    providerType: 'openai',
    authType: 'bearer',
    commonModels: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4 / Claude 3.5',
    defaultEndpoint: 'https://api.anthropic.com',
    providerType: 'anthropic',
    authType: 'x-api-key',
    commonModels: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-sonnet-20241022'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama',
    defaultEndpoint: 'http://localhost:11434',
    providerType: 'ollama',
    authType: 'none',
    commonModels: ['llama3', 'qwen2', 'mistral', 'codellama'],
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'Microsoft Azure hosted OpenAI',
    defaultEndpoint: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
    providerType: 'azure',
    authType: 'bearer',
    commonModels: ['gpt-4o', 'gpt-4', 'gpt-35-turbo'],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Self-hosted or other API endpoint',
    defaultEndpoint: '',
    providerType: 'kimi',
    authType: 'bearer',
    commonModels: [],
  },
];
