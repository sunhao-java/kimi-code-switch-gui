import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildConfigDocument } from "@shared/configStore";
import type { AppState } from "@shared/types";

const EXTRA_CLI_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  join(homedir(), ".local", "bin"),
  join(homedir(), ".cargo", "bin"),
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

export async function runKimiConnectivityTest(state: AppState, modelName: string): Promise<{ ok: true; stdout: string; stderr: string }> {
  const configDocument = buildConfigDocument(state);
  const { stdout, stderr } = await execFileAsync(
    "kimi",
    [
      "--config",
      configDocument,
      "--model",
      modelName,
      "--quiet",
      "--print",
      "--command",
      "Reply with exactly OK.",
    ],
    {
      env: getCliEnv(),
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return {
    ok: true,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}
