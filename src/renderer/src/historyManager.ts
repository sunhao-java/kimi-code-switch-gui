import type { AppState } from "@shared/types";

export interface HistoryEntry {
  timestamp: number;
  summary: string;
  state: AppState;
}

const MAX_ENTRIES = 10;
const entries: HistoryEntry[] = [];

export function pushSnapshot(state: AppState, summary: string): void {
  entries.unshift({
    timestamp: Date.now(),
    summary,
    state: structuredClone(state) as AppState,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function getHistory(): HistoryEntry[] {
  return entries;
}

export function undoLast(): AppState | null {
  const entry = entries.shift();
  return entry?.state ?? null;
}

export function clearHistory(): void {
  entries.length = 0;
}
