export interface StartupTimingEntry {
  label: string;
  durationMs: number;
  at: number;
}

const MAX_STARTUP_TIMING_ENTRIES = 100;

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
  const entries = sink.__kimiStartupTimings ?? (sink.__kimiStartupTimings = []);
  entries.push({ label, durationMs, at: Date.now() });
  if (entries.length > MAX_STARTUP_TIMING_ENTRIES) {
    entries.splice(0, entries.length - MAX_STARTUP_TIMING_ENTRIES);
  }
  return durationMs;
}
