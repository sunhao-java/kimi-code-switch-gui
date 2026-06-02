import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelSettings } from "@shared/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  buildWebDavUrl,
  deleteWebDavPath,
  ensureWebDavCollection,
  getWebDavAuthHeader,
  getWebDavBaseUrl,
  getWebDavPathSegments,
  pruneWebDavBackups,
  readWebDavManifest,
  testWebDavConnection,
  uploadWebDavFile,
} from "./webdav";

const mockedInvoke = vi.mocked(invoke);

function settings(overrides: Partial<PanelSettings> = {}): PanelSettings {
  return {
    backup_webdav_url: "https://dav.example.com/remote.php/dav/",
    backup_webdav_username: "alice",
    backup_webdav_password: "secret",
    backup_webdav_path: "/kimi/backups/",
    backup_retention_count: 2,
    ...overrides,
  } as unknown as PanelSettings;
}

interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

function httpReply(status: number, body = ""): HttpResponse {
  return { status, ok: status >= 200 && status < 300, body };
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("webdav URL helpers", () => {
  it("builds auth header from username/password (Basic base64)", () => {
    expect(getWebDavAuthHeader(settings())).toBe(`Basic ${btoa("alice:secret")}`);
  });

  it("trims trailing slashes from the base url", () => {
    expect(getWebDavBaseUrl(settings({ backup_webdav_url: "https://dav.example.com/dav///" } as Partial<PanelSettings>)))
      .toBe("https://dav.example.com/dav");
  });

  it("throws when base url is empty", () => {
    expect(() => getWebDavBaseUrl(settings({ backup_webdav_url: "   " } as Partial<PanelSettings>))).toThrow(/required/);
  });

  it("splits path into trimmed non-empty segments and appends extras", () => {
    expect(getWebDavPathSegments(settings(), ["snap one"])).toEqual(["kimi", "backups", "snap one"]);
  });

  it("encodes segments when building a full url", () => {
    expect(buildWebDavUrl(settings(), ["snap one"]))
      .toBe("https://dav.example.com/remote.php/dav/kimi/backups/snap%20one");
  });
});

describe("ensureWebDavCollection", () => {
  it("issues MKCOL per path segment with auth header", async () => {
    mockedInvoke.mockResolvedValue(httpReply(201));
    const result = await ensureWebDavCollection(settings(), ["snap"]);

    expect(result).toBe("https://dav.example.com/remote.php/dav/kimi/backups/snap");
    // 3 segments: kimi / backups / snap
    expect(mockedInvoke).toHaveBeenCalledTimes(3);
    const firstCall = mockedInvoke.mock.calls[0];
    expect(firstCall[0]).toBe("http_request");
    expect(firstCall[1]).toMatchObject({
      method: "MKCOL",
      headers: { Authorization: `Basic ${btoa("alice:secret")}` },
    });
  });

  it("treats 405 (already exists) as success", async () => {
    mockedInvoke.mockResolvedValue(httpReply(405));
    await expect(ensureWebDavCollection(settings(), ["snap"])).resolves.toContain("/snap");
  });

  it("throws on an unexpected MKCOL status", async () => {
    mockedInvoke.mockResolvedValue(httpReply(500));
    await expect(ensureWebDavCollection(settings(), ["snap"])).rejects.toThrow(/MKCOL failed: 500/);
  });
});

describe("uploadWebDavFile / deleteWebDavPath", () => {
  it("PUTs content and rejects on non-ok status", async () => {
    mockedInvoke.mockResolvedValue(httpReply(201));
    await uploadWebDavFile(settings(), "https://dav.example.com/f.toml", "body");
    expect(mockedInvoke).toHaveBeenCalledWith("http_request", expect.objectContaining({
      method: "PUT",
      url: "https://dav.example.com/f.toml",
      body: "body",
    }));

    mockedInvoke.mockResolvedValue(httpReply(500));
    await expect(uploadWebDavFile(settings(), "https://dav.example.com/f.toml", "body")).rejects.toThrow(/upload failed: 500/);
  });

  it("tolerates 404 on delete but rejects other errors", async () => {
    mockedInvoke.mockResolvedValue(httpReply(404));
    await expect(deleteWebDavPath(settings(), "https://x")).resolves.toBeUndefined();

    mockedInvoke.mockResolvedValue(httpReply(500));
    await expect(deleteWebDavPath(settings(), "https://x")).rejects.toThrow(/delete failed: 500/);
  });
});

describe("readWebDavManifest", () => {
  it("returns [] on 404", async () => {
    mockedInvoke.mockResolvedValue(httpReply(404));
    await expect(readWebDavManifest(settings(), "https://x/.kimi-backups.json")).resolves.toEqual([]);
  });

  it("parses and filters malformed entries", async () => {
    mockedInvoke.mockResolvedValue(httpReply(200, JSON.stringify({
      backups: [
        { name: "a", createdAt: "2026-01-01" },
        { name: "b" },
        { createdAt: "2026-01-02" },
        "junk",
      ],
    })));
    await expect(readWebDavManifest(settings(), "https://x/.kimi-backups.json"))
      .resolves.toEqual([{ name: "a", createdAt: "2026-01-01" }]);
  });

  it("throws on a non-404 error status", async () => {
    mockedInvoke.mockResolvedValue(httpReply(500));
    await expect(readWebDavManifest(settings(), "https://x")).rejects.toThrow(/manifest read failed: 500/);
  });
});

describe("pruneWebDavBackups", () => {
  it("deletes entries beyond retention and re-uploads the kept manifest", async () => {
    mockedInvoke.mockResolvedValue(httpReply(204));
    const entries = [
      { name: "backup-3", createdAt: "2026-01-03" },
      { name: "backup-1", createdAt: "2026-01-01" },
      { name: "backup-2", createdAt: "2026-01-02" },
    ];
    await pruneWebDavBackups(settings({ backup_retention_count: 2 } as Partial<PanelSettings>), "https://x/.kimi-backups.json", entries);

    const calls = mockedInvoke.mock.calls.map((c) => c[1] as { method: string });
    // 1 DELETE (oldest beyond retention) + 1 PUT (manifest)
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    const put = calls.find((c) => c.method === "PUT") as { body: string };
    const kept = (JSON.parse(put.body) as { backups: Array<{ name: string }> }).backups.map((b) => b.name);
    expect(kept).toEqual(["backup-3", "backup-2"]);
  });
});

describe("testWebDavConnection error mapping", () => {
  it("returns ok on a successful PROPFIND", async () => {
    mockedInvoke.mockResolvedValue(httpReply(207));
    const result = await testWebDavConnection(settings());
    expect(result.ok).toBe(true);
    expect(mockedInvoke.mock.calls[0][1]).toMatchObject({ method: "PROPFIND" });
  });

  it("creates the collection when PROPFIND returns 404", async () => {
    mockedInvoke
      .mockResolvedValueOnce(httpReply(404)) // PROPFIND
      .mockResolvedValue(httpReply(201)); // MKCOL chain
    const result = await testWebDavConnection(settings());
    expect(result.ok).toBe(true);
    expect(result.target).toContain("/backups");
  });

  it("maps 401 to a friendly auth error", async () => {
    mockedInvoke.mockResolvedValue(httpReply(401));
    await expect(testWebDavConnection(settings())).rejects.toThrow(/认证失败 \(401\)/);
  });

  it("maps 403 to a friendly auth error", async () => {
    mockedInvoke.mockResolvedValue(httpReply(403));
    await expect(testWebDavConnection(settings())).rejects.toThrow(/认证失败 \(403\)/);
  });

  it("maps 429 to a friendly rate-limit error containing '429'", async () => {
    mockedInvoke.mockResolvedValue(httpReply(429));
    await expect(testWebDavConnection(settings())).rejects.toThrow(/429/);
    await expect(testWebDavConnection(settings())).rejects.toThrow(/限流/);
  });

  it("falls back to a generic error for other non-ok statuses", async () => {
    mockedInvoke.mockResolvedValue(httpReply(500));
    await expect(testWebDavConnection(settings())).rejects.toThrow(/test failed: 500/);
  });
});
