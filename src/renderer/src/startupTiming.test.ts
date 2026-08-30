import { describe, expect, it, beforeEach } from "vitest";

import { recordStartupTiming } from "./startupTiming";

describe("startupTiming", () => {
  beforeEach(() => {
    delete (globalThis as { __kimiStartupTimings?: unknown }).__kimiStartupTimings;
  });

  it("keeps only the most recent timing entries", () => {
    for (let index = 0; index < 105; index += 1) {
      recordStartupTiming(`startup:${index}`, 0);
    }

    const entries = (globalThis as typeof globalThis & {
      __kimiStartupTimings?: Array<{ label: string }>;
    }).__kimiStartupTimings;
    expect(entries).toHaveLength(100);
    expect(entries?.[0]?.label).toBe("startup:5");
    expect(entries?.[99]?.label).toBe("startup:104");
  });
});
