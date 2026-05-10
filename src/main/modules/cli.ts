import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AppState, ModelConfig, ProfileConnectivityTestResult, ProviderConfig } from "@shared/types";

const EXTRA_CLI_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  join(homedir(), ".local", "bin"),
  join(homedir(), ".cargo", "bin"),
  join(homedir(), ".npm-global", "bin"),
  join(homedir(), ".volta", "bin"),
  join(homedir(), ".fnm", "aliases", "default", "bin"),
  "/usr/local/share/npm/bin",
];

const execFileAsync = promisify(execFile);

export function getCliEnv(): NodeJS.ProcessEnv {
  const pathEntries = new Set(
    [process.env.PATH ?? "", ...EXTRA_CLI_PATHS]
      .flatMap((value) => value.split(delimiter))
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return {
    ...process.env,
    PATH: [...pathEntries].join(delimiter),
  };
}

export interface CliVersionResult {
  version: string;
  installed: boolean;
}

export async function getCliVersion(): Promise<CliVersionResult> {
  try {
    const { stdout } = await execFileAsync("kimi", ["--version"], {
      env: getCliEnv(),
      windowsHide: true,
      timeout: 3000,
    });
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return { version: match ? match[1] : stdout.trim(), installed: true };
  } catch {
    return { version: "", installed: false };
  }
}

export async function runKimiMcpCommand(args: string[]): Promise<{ ok: true; stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("kimi", ["mcp", ...args], {
    env: getCliEnv(),
    windowsHide: true,
  });
  return {
    ok: true,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

export async function runKimiConnectivityTest(state: AppState, modelName: string): Promise<ProfileConnectivityTestResult> {
  const model = state.mainConfig.models[modelName];
  if (!model) {
    throw new Error(`Model not found: ${modelName}`);
  }
  const providerName = model.provider;
  const provider = state.mainConfig.providers[providerName];
  if (!provider) {
    throw new Error(`Provider not found: ${providerName}`);
  }
  if (!provider.base_url.trim()) {
    throw new Error(`Provider base URL is required: ${providerName}`);
  }
  if (!provider.api_key.trim()) {
    throw new Error(`Provider API key is required: ${providerName}`);
  }
  const prompt = "hi";
  const startedAt = performance.now();
  const request = buildConnectivityRequest(provider, model, prompt);
  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  const { text, firstTokenMs } = await readConnectivityResponse(response, startedAt, request.kind);
  const totalMs = Math.max(0, Math.round(performance.now() - startedAt));
  if (!response.ok) {
    throw new Error(`Connectivity test failed: HTTP ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
  }
  return {
    ok: true,
    stdout: text.trim(),
    stderr: "",
    profileName: state.activeProfile,
    modelName,
    providerName,
    providerType: provider.type,
    prompt,
    endpoint: request.endpoint,
    firstTokenMs,
    totalMs,
    status: response.status,
  };
}

type ConnectivityRequestKind = "chat-completions" | "responses" | "anthropic";

interface ConnectivityRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  kind: ConnectivityRequestKind;
}

function buildConnectivityRequest(provider: ProviderConfig, model: ModelConfig, prompt: string): ConnectivityRequest {
  const providerType = provider.type || "openai_legacy";
  if (providerType === "anthropic") {
    return {
      endpoint: joinUrlPath(provider.base_url, "/v1/messages"),
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: model.model,
        max_tokens: 64,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      },
      kind: "anthropic",
    };
  }

  if (providerType === "openai_responses") {
    return {
      endpoint: joinUrlPath(provider.base_url, "/responses"),
      headers: buildBearerHeaders(provider.api_key),
      body: {
        model: model.model,
        input: prompt,
        stream: true,
      },
      kind: "responses",
    };
  }

  return {
    endpoint: joinUrlPath(provider.base_url, "/chat/completions"),
    headers: buildBearerHeaders(provider.api_key),
    body: {
      model: model.model,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    },
    kind: "chat-completions",
  };
}

function buildBearerHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function joinUrlPath(baseUrl: string, suffix: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  if (new RegExp(`${escapeRegExp(suffix)}$`).test(trimmedBase)) {
    return trimmedBase;
  }
  return `${trimmedBase}${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readConnectivityResponse(
  response: Response,
  startedAt: number,
  kind: ConnectivityRequestKind,
): Promise<{ text: string; firstTokenMs: number }> {
  if (!response.body) {
    const text = await response.text();
    return {
      text: extractConnectivityText(text, kind),
      firstTokenMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let output = "";
  let firstTokenMs = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;
    const parsed = parseStreamBuffer(buffer, kind);
    buffer = parsed.remaining;
    if (parsed.text) {
      output += parsed.text;
      if (!firstTokenMs) {
        firstTokenMs = Math.max(0, Math.round(performance.now() - startedAt));
      }
    }
  }

  const tail = decoder.decode();
  if (tail) {
    rawText += tail;
    buffer += tail;
  }
  const parsedTail = parseStreamBuffer(`${buffer}\n\n`, kind);
  if (parsedTail.text) {
    output += parsedTail.text;
    if (!firstTokenMs) {
      firstTokenMs = Math.max(0, Math.round(performance.now() - startedAt));
    }
  }

  const text = output || extractConnectivityText(rawText, kind);
  return {
    text,
    firstTokenMs: firstTokenMs || Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

function parseStreamBuffer(buffer: string, kind: ConnectivityRequestKind): { text: string; remaining: string } {
  const events = buffer.split(/\r?\n\r?\n/);
  const remaining = events.pop() ?? "";
  const text = events
    .map((event) => parseStreamEvent(event, kind))
    .join("");
  return { text, remaining };
}

function parseStreamEvent(event: string, kind: ConnectivityRequestKind): string {
  const dataLines = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  return dataLines.map((line) => parseStreamPayload(line, kind)).join("");
}

function parseStreamPayload(payload: string, kind: ConnectivityRequestKind): string {
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    if (kind === "anthropic") {
      return readStringPath(value, ["delta", "text"]) ?? "";
    }
    if (kind === "responses") {
      return readStringPath(value, ["delta"])
        ?? readStringPath(value, ["content", 0, "text"])
        ?? readStringPath(value, ["response", "output_text", "delta"])
        ?? "";
    }
    return readStringPath(value, ["choices", 0, "delta", "content"]) ?? "";
  } catch {
    return "";
  }
}

function extractConnectivityText(rawText: string, kind: ConnectivityRequestKind): string {
  try {
    const value = JSON.parse(rawText) as Record<string, unknown>;
    if (kind === "anthropic") {
      return readStringPath(value, ["content", 0, "text"]) ?? rawText;
    }
    if (kind === "responses") {
      return readStringPath(value, ["output_text"]) ?? readStringPath(value, ["output", 0, "content", 0, "text"]) ?? rawText;
    }
    return readStringPath(value, ["choices", 0, "message", "content"]) ?? rawText;
  } catch {
    return rawText;
  }
}

function readStringPath(value: unknown, path: Array<string | number>): string | null {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return null;
      current = current[key];
    } else {
      if (!current || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return typeof current === "string" ? current : null;
}
