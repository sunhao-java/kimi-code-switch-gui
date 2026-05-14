import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";
import { access } from "node:fs/promises";

import type { AppState, FileSnapshotBundle, ManagedFileId } from "@shared/types";
import {
  captureSnapshotForPaths,
  detectChangeReason,
  fingerprintFile,
  resolveManagedPaths,
} from "./fileSnapshots";

const DEBOUNCE_MS = 1500;
const POLL_INTERVAL_MS = 3000;
const WATCHER_RECHECK_MS = 10000;
const SELF_WRITE_GRACE_MS = POLL_INTERVAL_MS + DEBOUNCE_MS;

interface FileWatchState {
  watcher: FSWatcher | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  recheckTimer: ReturnType<typeof setTimeout> | null;
}

const fileStates = new Map<ManagedFileId, FileWatchState>();
const debounceTimers = new Map<ManagedFileId, ReturnType<typeof setTimeout>>();
const selfWriteGuards = new Set<ManagedFileId>();
const selfWriteTimers = new Map<ManagedFileId, ReturnType<typeof setTimeout>>();

let lastSnapshot: FileSnapshotBundle | null = null;
let currentCallback: ((changed: ManagedFileId[]) => void) | null = null;
let currentPaths: Record<ManagedFileId, string> | null = null;

export async function startWatching(
  state: AppState,
  onExternalChange: (changed: ManagedFileId[]) => void,
): Promise<void> {
  stopWatching();
  currentCallback = onExternalChange;
  currentPaths = resolveManagedPaths(state);
  lastSnapshot = await captureSnapshotForPaths(currentPaths);

  for (const [id, filePath] of Object.entries(currentPaths) as Array<[ManagedFileId, string]>) {
    setupFileWatch(id, filePath);
  }
}

export function stopWatching(): void {
  for (const fs of fileStates.values()) {
    fs.watcher?.close();
    if (fs.pollTimer) clearInterval(fs.pollTimer);
    if (fs.recheckTimer) clearTimeout(fs.recheckTimer);
  }
  fileStates.clear();

  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  for (const timer of selfWriteTimers.values()) {
    clearTimeout(timer);
  }
  selfWriteTimers.clear();
  selfWriteGuards.clear();

  lastSnapshot = null;
  currentCallback = null;
  currentPaths = null;
}

export function markSelfWrite(fileId: ManagedFileId): void {
  selfWriteGuards.add(fileId);
  const existing = selfWriteTimers.get(fileId);
  if (existing) clearTimeout(existing);
  selfWriteTimers.set(
    fileId,
    setTimeout(() => {
      selfWriteGuards.delete(fileId);
      selfWriteTimers.delete(fileId);
    }, SELF_WRITE_GRACE_MS),
  );
}

export async function updateBaseline(): Promise<void> {
  if (!currentPaths) return;
  try {
    lastSnapshot = await captureSnapshotForPaths(currentPaths);
  } catch {
    // ignore
  }
}

function setupFileWatch(id: ManagedFileId, filePath: string): void {
  const state: FileWatchState = { watcher: null, pollTimer: null, recheckTimer: null };
  fileStates.set(id, state);

  tryAttachWatcher(id, filePath, state);
  startPolling(id, filePath, state);
}

function tryAttachWatcher(id: ManagedFileId, filePath: string, state: FileWatchState): void {
  try {
    const watcher = watch(filePath, () => handleWatchEvent(id));
    watcher.on("close", () => {
      state.watcher = null;
      scheduleReattach(id, filePath, state);
    });
    watcher.on("error", () => {
      watcher.close();
    });
    state.watcher = watcher;
  } catch {
    state.watcher = null;
    scheduleReattach(id, filePath, state);
  }
}

function scheduleReattach(id: ManagedFileId, filePath: string, state: FileWatchState): void {
  if (state.recheckTimer) return;
  state.recheckTimer = setTimeout(() => {
    state.recheckTimer = null;
    if (!state.watcher && currentPaths) {
      tryAttachWatcher(id, filePath, state);
    }
  }, WATCHER_RECHECK_MS);
}

function startPolling(id: ManagedFileId, filePath: string, state: FileWatchState): void {
  state.pollTimer = setInterval(() => {
    void verifyChange(id, filePath);
  }, POLL_INTERVAL_MS);
}

function handleWatchEvent(id: ManagedFileId): void {
  const filePath = currentPaths?.[id];
  if (!filePath) return;

  const existing = debounceTimers.get(id);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    id,
    setTimeout(() => {
      debounceTimers.delete(id);
      void verifyChange(id, filePath);
    }, DEBOUNCE_MS),
  );
}

async function verifyChange(id: ManagedFileId, filePath: string): Promise<void> {
  if (!lastSnapshot || !currentCallback) return;
  if (selfWriteGuards.has(id)) return;

  try {
    const actual = await fingerprintFile(id, filePath);
    const expected = lastSnapshot.files[id];
    if (!expected) return;

    const reason = detectChangeReason(expected, actual);
    if (!reason) return;

    lastSnapshot = {
      ...lastSnapshot,
      files: { ...lastSnapshot.files, [id]: actual },
    };

    currentCallback([id]);
  } catch {
    // fingerprint read failed — ignore
  }
}
