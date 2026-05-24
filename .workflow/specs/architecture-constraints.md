---
title: "Architecture Constraints"
readMode: required
priority: high
category: arch
---
# Architecture Constraints

Auto-generated from project structure. Update manually as architecture evolves.

## Module Structure
- Type: single-package (Electron app with electron-vite)
- Key modules:
  - `src/main/` — Electron main process (IPC handlers, file I/O, system integration)
  - `src/main/modules/` — Feature-specific IPC modules (terminal, fileWatcher, usageDb, etc.)
  - `src/preload/` — Context bridge (exposes IPC to renderer via `window.kimiSwitch`)
  - `src/renderer/src/` — React SPA (single App.tsx, tab-based navigation)
  - `src/renderer/src/tabs/` — Tab panel components
  - `src/shared/` — Pure logic shared across all processes (types, stores, utilities)

## Layer Boundaries
- `shared/` → no imports from main/preload/renderer (pure, process-agnostic)
- `main/modules/` → may import from `@shared/*`, never from renderer/preload
- `preload/` → imports types from `@shared/*`, bridges IPC
- `renderer/` → imports from `@shared/*` and `@renderer/*`, accesses main via `window.kimiSwitch`

## Dependency Rules
- Renderer NEVER imports from main or preload directly
- All cross-process communication via IPC (ipcMain.handle / ipcRenderer.invoke)
- Shared layer has zero side effects — all functions are pure
- FileAccess interface abstracts filesystem (enables in-memory testing)

## Technology Constraints
- Runtime: Electron 35 + Node.js (native modules via electron-rebuild)
- Module system: ESM (electron-vite handles CJS interop)
- Strict mode: TypeScript strict (noEmit check in build)
- Native deps: better-sqlite3 (requires electron-rebuild)
- Build: electron-vite (vite for renderer, esbuild for main/preload)

## Entries

