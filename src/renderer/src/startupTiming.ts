export interface StartupTimingEntry {
  label: string;
  durationMs: number;
  at: number;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function timingSink(): { __kimiStartupTimings?: StartupTimingEntry[] } {
  return globalThis as typeof globalThis & { __kimiStartupTimings?: StartupTimingEntry[] };
}

export function startupTimingNow(): number {
  return now();
}

export function recordStartupTiming(label: string, startedAt: number): number {
  const durationMs = Math.round((now() - startedAt) * 10) / 10;
  const sink = timingSink();
  sink.__kimiStartupTimings = [
    ...(sink.__kimiStartupTimings ?? []),
    {
      label,
      durationMs,
      at: Date.now(),
    },
  ];
  return durationMs;
}
