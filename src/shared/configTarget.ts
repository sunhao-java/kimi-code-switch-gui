import type { ConfigTarget as ConfigTargetValue } from "./types";

export const ConfigTarget = {
  KimiCli: "kimi-cli",
  KimiCode: "kimi-code",
} as const;

export type ConfigTarget = ConfigTargetValue;

/**
 * 配置路径解析器
 */
export class ConfigResolver {
  constructor(public readonly target: ConfigTargetValue) {}

  /**
   * 获取配置根目录（相对于 HOME）
   */
  getConfigDir(): string {
    return this.target === ConfigTarget.KimiCli ? ".kimi" : ".kimi-code";
  }

  /**
   * 是否支持 profiles 配置
   */
  supportsProfiles(): boolean {
    return this.target === ConfigTarget.KimiCode;
  }

  /**
   * 是否支持 panel 配置
   */
  supportsPanel(): boolean {
    return this.target === ConfigTarget.KimiCode;
  }

  /**
   * 是否支持 tui.toml（kimi-code 独有）
   */
  supportsTui(): boolean {
    return this.target === ConfigTarget.KimiCode;
  }

  /**
   * MCP 配置文件名
   */
  getMcpConfigFile(): string {
    return "mcp.json";
  }

  /**
   * 获取环境变量名
   */
  getHomeEnvVar(): string {
    return this.target === ConfigTarget.KimiCli ? "KIMI_HOME" : "KIMI_CODE_HOME";
  }

  /**
   * 获取完整配置路径（相对于 HOME）
   */
  getConfigPath(filename: string): string {
    return `${this.getConfigDir()}/${filename}`;
  }

  /**
   * 获取配置目标的显示名称
   */
  getDisplayName(): string {
    return this.target === ConfigTarget.KimiCli ? "Kimi CLI" : "Kimi Code";
  }
}

/**
 * 将字符串转换为 ConfigTarget
 */
export function parseConfigTarget(value: unknown): ConfigTarget {
  if (value === ConfigTarget.KimiCli || value === "kimi-cli") {
    return ConfigTarget.KimiCli;
  }
  return ConfigTarget.KimiCode;
}
