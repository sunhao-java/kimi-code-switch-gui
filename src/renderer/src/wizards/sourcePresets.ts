export interface SourcePreset {
  id: string;
  name: string;
  description: string;
  defaultEndpoint: string;
  /** 必须是 kimi-code-cli 认识的 provider type（见 appOptions.PROVIDER_TYPE_OPTIONS）。 */
  providerType: "kimi" | "openai_legacy" | "openai_responses" | "anthropic" | "gemini" | "vertexai";
  /** 仅用于向导 UI：决定是否显示 API Key 输入及其占位符；真实鉴权方式由 providerType 隐含。 */
  authType: "bearer" | "x-api-key" | "none";
  commonModels: string[];
  /** 该来源典型的上下文上限，作为新建 Model 的默认值（用户可后续在高级配置调整）。 */
  defaultContextSize: number;
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT / GPT-4 / GPT-4o",
    defaultEndpoint: "https://api.openai.com/v1",
    providerType: "openai_responses",
    authType: "bearer",
    commonModels: ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
    defaultContextSize: 128000,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4 / Claude 3.5",
    defaultEndpoint: "https://api.anthropic.com",
    providerType: "anthropic",
    authType: "x-api-key",
    commonModels: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-3-5-sonnet-20241022"],
    defaultContextSize: 200000,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models via Ollama",
    defaultEndpoint: "http://localhost:11434/v1",
    providerType: "openai_legacy",
    authType: "none",
    commonModels: ["llama3", "qwen2", "mistral", "codellama"],
    defaultContextSize: 32000,
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    description: "Microsoft Azure hosted OpenAI",
    defaultEndpoint: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    providerType: "openai_legacy",
    authType: "bearer",
    commonModels: ["gpt-4o", "gpt-4", "gpt-35-turbo"],
    defaultContextSize: 128000,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Self-hosted or other OpenAI-compatible endpoint",
    defaultEndpoint: "",
    providerType: "openai_legacy",
    authType: "bearer",
    commonModels: [],
    defaultContextSize: 128000,
  },
];
