import type { AppState } from "@shared/types";
import { createLineDiff } from "@shared/configStore";
import { buildManagedDocuments, redactDocumentText } from "@shared/configSafety";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  summary: string;
  state: AppState;
  details: HistoryDetail[];
}

export interface HistoryDetail {
  id: string;
  title: string;
  diff: string;
  changeCount: number;
}

const MAX_ENTRIES = 10;
const entries: HistoryEntry[] = [];

export function pushSnapshot(state: AppState, summary: string): void {
  const timestamp = Date.now();
  entries.unshift({
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    summary,
    state: structuredClone(state) as AppState,
    details: [],
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function pushChangeSnapshot(previousState: AppState, nextState: AppState, summary: string): void {
  const details = createHistoryDetails(previousState, nextState);
  if (details.length === 0) {
    return;
  }
  pushSnapshotWithDetails(previousState, summary, details);
}

export function getHistory(currentState?: AppState): HistoryEntry[] {
  if (!currentState) {
    return entries.map(cloneEntry);
  }
  return entries.map((entry) => ({
    ...cloneEntry(entry),
    details: entry.details.length > 0 ? entry.details : createHistoryDetails(entry.state, currentState),
  }));
}

export function undoLast(): AppState | null {
  const entry = entries.shift();
  return entry ? structuredClone(entry.state) as AppState : null;
}

export function restoreHistoryEntry(entryId: string): AppState | null {
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) {
    return null;
  }
  const [entry] = entries.splice(index, 1);
  entries.splice(0, index);
  return entry ? structuredClone(entry.state) as AppState : null;
}

export function clearHistory(): void {
  entries.length = 0;
}

function pushSnapshotWithDetails(state: AppState, summary: string, details: HistoryDetail[]): void {
  const timestamp = Date.now();
  entries.unshift({
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    summary,
    state: structuredClone(state) as AppState,
    details,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

function createHistoryDetails(previousState: AppState, nextState: AppState): HistoryDetail[] {
  const previousDocuments = buildManagedDocuments(previousState);
  const nextDocuments = buildManagedDocuments(nextState);
  const titles: Record<keyof typeof previousDocuments, string> = {
    config: "config.toml",
    panel: "config.panel.json",
    mcp: "mcp.json",
  };

  return (Object.keys(previousDocuments) as Array<keyof typeof previousDocuments>)
    .map((id) => {
      const diff = createLineDiff(
        redactDocumentText(previousDocuments[id]).text,
        redactDocumentText(nextDocuments[id]).text,
      );
      return {
        id,
        title: titles[id],
        diff,
        changeCount: diff.split("\n").filter((line) => line.startsWith("+ ") || line.startsWith("- ")).length,
      };
    })
    .filter((detail) => detail.changeCount > 0);
}

function cloneEntry(entry: HistoryEntry): HistoryEntry {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    summary: entry.summary,
    state: structuredClone(entry.state) as AppState,
    details: entry.details.map((detail) => ({ ...detail })),
  };
}
