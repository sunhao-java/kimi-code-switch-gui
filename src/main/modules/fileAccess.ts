import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

export const resolveHome = (value: string): string =>
  value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;

export const fileAccess = {
  async readText(path: string): Promise<string | null> {
    try {
      return await readFile(resolveHome(path), "utf-8");
    } catch (error) {
      if (isMissingPathError(error)) {
        return null;
      }
      throw error;
    }
  },
  async writeText(path: string, content: string): Promise<void> {
    await writeFile(resolveHome(path), content, "utf-8");
  },
  async ensureDir(path: string): Promise<void> {
    await mkdir(resolveHome(path), { recursive: true });
  },
};

export const skillFileAccess = {
  async readText(path: string): Promise<string | null> {
    try {
      return await readFile(resolveHome(path), "utf-8");
    } catch (error) {
      if (isMissingPathError(error)) {
        return null;
      }
      throw error;
    }
  },
  async listDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    try {
      const entries = await readdir(resolveHome(path), { withFileTypes: true });
      return await Promise.all(
        entries.map(async (entry) => ({
          name: entry.name,
          isDirectory: await isDirectoryEntry(resolveHome(path), entry),
        })),
      );
    } catch (error) {
      if (isMissingPathError(error) || isNotDirectoryError(error)) {
        return [];
      }
      throw error;
    }
  },
  async pathExists(path: string): Promise<boolean> {
    try {
      await stat(resolveHome(path));
      return true;
    } catch (error) {
      if (isMissingPathError(error)) {
        return false;
      }
      throw error;
    }
  },
};

function isMissingPathError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isNotDirectoryError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOTDIR";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

export async function isDirectoryEntry(
  rootPath: string,
  entry: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean },
): Promise<boolean> {
  if (entry.isDirectory()) {
    return true;
  }
  if (!entry.isSymbolicLink()) {
    return false;
  }
  try {
    return (await stat(resolve(rootPath, entry.name))).isDirectory();
  } catch {
    return false;
  }
}
