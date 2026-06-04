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
  /** 品牌徽标背景色。 */
  brandColor: string;
  /** 徽标显示字符（首字母）。 */
  iconLabel: string;
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: "kimi",
    name: "Kimi 官方",
    description: "Moonshot AI · 月之暗面",
    defaultEndpoint: "https://api.moonshot.cn/v1",
    providerType: "kimi",
    authType: "bearer",
    commonModels: ["kimi-k2-0905-preview", "kimi-k2-0711-preview", "kimi-latest", "moonshot-v1-128k", "moonshot-v1-32k"],
    defaultContextSize: 128000,
    brandColor: "#16161a",
    iconLabel: "K",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT · GPT 系列",
    defaultEndpoint: "https://api.openai.com/v1",
    providerType: "openai_responses",
    authType: "bearer",
    commonModels: ["gpt-5.5", "gpt-5", "gpt-4.1", "o3", "o4-mini"],
    defaultContextSize: 128000,
    brandColor: "#10a37f",
    iconLabel: "O",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 系列",
    defaultEndpoint: "https://api.anthropic.com",
    providerType: "anthropic",
    authType: "x-api-key",
    commonModels: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7", "claude-sonnet-4-5"],
    defaultContextSize: 200000,
    brandColor: "#d97757",
    iconLabel: "A",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "深度求索 · OpenAI 兼容",
    defaultEndpoint: "https://api.deepseek.com/v1",
    providerType: "openai_legacy",
    authType: "bearer",
    commonModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3.2", "deepseek-r1", "deepseek-coder"],
    defaultContextSize: 64000,
    brandColor: "#4d6bfe",
    iconLabel: "D",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    description: "智谱 AI · OpenAI 兼容",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4",
    providerType: "openai_legacy",
    authType: "bearer",
    commonModels: ["glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4-plus", "glm-z1-air"],
    defaultContextSize: 128000,
    brandColor: "#3859ff",
    iconLabel: "G",
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
    brandColor: "#6b7280",
    iconLabel: "C",
  },
];
