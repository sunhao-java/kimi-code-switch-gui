import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState } from "@shared/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { evaluateCliCompatibility, getCliVersion, MIN_CLI_VERSION, runKimiConnectivityTest, runKimiMcpCommand, runProvidersHealthCheck, upgradeKimiCli } from "./cli";

const mockedInvoke = vi.mocked(invoke);

function exec(code: number, stdout = "", stderr = ""): { code: number; stdout: string; stderr: string } {
  return { code, stdout, stderr };
}
function http(status: number, body = ""): { status: number; ok: boolean; body: string } {
  return { status, ok: status >= 200 && status < 300, body };
}

function connectivityState(providerType = "openai_legacy"): AppState {
  return {
    activeProfile: "work",
    mainConfig: {
      models: { "p/m": { provider: "p", model: "m-1" } },
      providers: { p: { type: providerType, base_url: "https://api.example.com/v1", api_key: "sk-1" } },
    },
  } as unknown as AppState;
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("getCliVersion", () => {
  it("extracts the semver from kimi --version stdout", async () => {
    mockedInvoke.mockResolvedValue(exec(0, "kimi-cli 1.4.2\n") as unknown as never);
    const result = await getCliVersion();
    expect(result).toEqual({ version: "1.4.2", installed: true });
    expect(mockedInvoke).toHaveBeenCalledWith("exec_command", { program: "kimi", args: ["--version"], timeoutMs: 3000 });
  });

  it("reports not installed when the command fails", async () => {
    mockedInvoke.mockResolvedValue(exec(127, "", "command not found") as unknown as never);
    await expect(getCliVersion()).resolves.toEqual({ version: "", installed: false });
  });

  it("checks PyPI for the latest version and flags an available update", async () => {
    mockedInvoke
      .mockResolvedValueOnce(exec(0, "1.0.0") as unknown as never) // kimi --version
      .mockResolvedValueOnce(http(200, JSON.stringify({ info: { version: "2.0.0" } })) as unknown as never); // PyPI
    const result = await getCliVersion({ checkLatest: true });
    expect(result.latestVersion).toBe("2.0.0");
    expect(result.hasUpdate).toBe(true);
  });

  it("does not flag an update when already current", async () => {
    mockedInvoke
      .mockResolvedValueOnce(exec(0, "2.0.0") as unknown as never)
      .mockResolvedValueOnce(http(200, JSON.stringify({ info: { version: "2.0.0" } })) as unknown as never);
    const result = await getCliVersion({ checkLatest: true });
    expect(result.hasUpdate).toBe(false);
  });

  it("tolerates a failing PyPI request and returns the local result", async () => {
    mockedInvoke
      .mockResolvedValueOnce(exec(0, "1.0.0") as unknown as never)
      .mockResolvedValueOnce(http(500) as unknown as never);
    const result = await getCliVersion({ checkLatest: true });
    expect(result).toMatchObject({ version: "1.0.0", installed: true });
    expect(result.latestVersion).toBeUndefined();
  });
});

describe("upgradeKimiCli / runKimiMcpCommand", () => {
  it("upgrades via uv tool upgrade and trims output", async () => {
    mockedInvoke.mockResolvedValue(exec(0, " done \n", " warn \n") as unknown as never);
    await expect(upgradeKimiCli()).resolves.toEqual({ ok: true, stdout: "done", stderr: "warn" });
    expect(mockedInvoke).toHaveBeenCalledWith("exec_command", {
      program: "uv",
      args: ["tool", "upgrade", "kimi-cli", "--no-cache"],
      timeoutMs: 120000,
    });
  });

  it("throws when upgrade exits non-zero", async () => {
    mockedInvoke.mockResolvedValue(exec(1, "", "boom") as unknown as never);
    await expect(upgradeKimiCli()).rejects.toThrow(/boom/);
  });

  it("forwards mcp subcommand args to kimi mcp", async () => {
    mockedInvoke.mockResolvedValue(exec(0, "ok", "") as unknown as never);
    await runKimiMcpCommand(["list"]);
    expect(mockedInvoke).toHaveBeenCalledWith("exec_command", expect.objectContaining({
      program: "kimi",
      args: ["mcp", "list"],
    }));
  });
});

describe("runKimiConnectivityTest", () => {
  it("validates model/provider existence before sending", async () => {
    const bad = connectivityState();
    await expect(runKimiConnectivityTest(bad, "missing")).rejects.toThrow(/Model not found/);
  });

  it("builds an OpenAI chat-completions request and extracts the assistant message", async () => {
    mockedInvoke.mockResolvedValue(http(200, JSON.stringify({ choices: [{ message: { content: "hello" } }] })) as unknown as never);
    const result = await runKimiConnectivityTest(connectivityState("openai_legacy"), "p/m");

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("hello");
    expect(result.status).toBe(200);
    const call = mockedInvoke.mock.calls.find((c) => c[0] === "http_request")![1] as {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://api.example.com/v1/chat/completions");
    expect(call.headers.authorization).toBe("Bearer sk-1");
    expect(JSON.parse(call.body)).toMatchObject({ model: "m-1" });
  });

  it("builds an anthropic request with x-api-key + version headers", async () => {
    mockedInvoke.mockResolvedValue(http(200, JSON.stringify({ content: [{ text: "hi there" }] })) as unknown as never);
    const result = await runKimiConnectivityTest(connectivityState("anthropic"), "p/m");
    expect(result.stdout).toBe("hi there");
    const call = mockedInvoke.mock.calls.find((c) => c[0] === "http_request")![1] as {
      url: string;
      headers: Record<string, string>;
    };
    // base_url already ends with /v1, and joinUrlPath only skips when the suffix matches the tail,
    // so "/v1/messages" is appended verbatim onto the configured base.
    expect(call.url).toBe("https://api.example.com/v1/v1/messages");
    expect(call.headers["x-api-key"]).toBe("sk-1");
    expect(call.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws a descriptive error when the upstream returns non-ok", async () => {
    mockedInvoke.mockResolvedValue(http(401, "unauthorized") as unknown as never);
    await expect(runKimiConnectivityTest(connectivityState(), "p/m")).rejects.toThrow(/HTTP 401/);
  });
});

describe("evaluateCliCompatibility", () => {
  it("returns unknown when not installed", () => {
    expect(evaluateCliCompatibility({ version: "", installed: false })).toBe("unknown");
  });

  it("returns unknown when the version is not a clean semver", () => {
    expect(evaluateCliCompatibility({ version: "dev", installed: true })).toBe("unknown");
  });

  it("flags versions below the minimum as outdated", () => {
    expect(evaluateCliCompatibility({ version: "0.9.0", installed: true })).toBe("outdated");
  });

  it("treats the minimum version and above as compatible", () => {
    expect(evaluateCliCompatibility({ version: MIN_CLI_VERSION, installed: true })).toBe("compatible");
    expect(evaluateCliCompatibility({ version: "9.9.9", installed: true })).toBe("compatible");
  });
});

describe("runProvidersHealthCheck", () => {
  function healthState(): AppState {
    return {
      activeProfile: "work",
      mainConfig: {
        default_model: "ok/m",
        models: {
          "ok/m": { provider: "ok", model: "m-1" },
          "limited/m": { provider: "limited", model: "m-2" },
          "broken/m": { provider: "broken", model: "m-3" },
          "nokey/m": { provider: "nokey", model: "m-4" },
        },
        providers: {
          ok: { type: "openai_legacy", base_url: "https://ok.example.com/v1", api_key: "sk-ok" },
          limited: { type: "openai_legacy", base_url: "https://limited.example.com/v1", api_key: "sk-l" },
          broken: { type: "openai_legacy", base_url: "https://broken.example.com/v1", api_key: "sk-b" },
          nomodel: { type: "openai_legacy", base_url: "https://nm.example.com/v1", api_key: "sk-n" },
          nokey: { type: "openai_legacy", base_url: "https://nk.example.com/v1", api_key: "" },
        },
      },
    } as unknown as AppState;
  }

  it("probes every provider independently and reports per-item results", async () => {
    mockedInvoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
      const url = String(args.url ?? "");
      if (url.includes("ok.example.com")) return Promise.resolve(http(200, "{}") as unknown as never);
      if (url.includes("limited.example.com")) return Promise.resolve(http(429, "slow down") as unknown as never);
      if (url.includes("broken.example.com")) return Promise.reject(new Error("connection refused")) as unknown as never;
      return Promise.resolve(http(500, "boom") as unknown as never);
    });

    const results = await runProvidersHealthCheck(healthState());
    const byName = Object.fromEntries(results.map((r) => [r.providerName, r]));

    expect(byName.ok.ok).toBe(true);
    expect(byName.ok.reason).toBe("ok");
    expect(byName.limited.ok).toBe(false);
    expect(byName.limited.reason).toBe("rate-limited");
    expect(byName.broken.ok).toBe(false);
    expect(byName.broken.reason).toBe("network-error");
    expect(byName.nomodel.reason).toBe("no-model");
    expect(byName.nokey.reason).toBe("missing-api-key");
  });
});
