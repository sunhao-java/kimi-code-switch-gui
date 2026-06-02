---
title: "Architecture Constraints"
readMode: required
priority: high
category: arch
---
# Architecture Constraints

Auto-generated from project structure. Update manually as architecture evolves.

## Module Structure
- Type: single-package (Tauri v2 app — thin Rust shell + frontend business logic)
- Key modules:
  - `src-tauri/src/` — Rust backend, exposes Tauri commands (I/O + system-integration primitives only):
    - `fs_access.rs` — file I/O (read/write/ensure_dir/list_dir/hostname, resolves `~/` paths)
    - `system.rs` — `exec_command`, `http_request` (reqwest), log tail, `write_executable`
    - `usage.rs` — SQLite via `rusqlite` (`usage_query`/`usage_exec`/...)
    - `tray.rs` — dynamic system tray (menu JSON in, `tray://command` events out)
  - `src/renderer/src/` — React SPA (single App.tsx, tab-based navigation, no router)
  - `src/renderer/src/tauri/` — adapters bridging `window.kimiSwitch` to Rust commands (kimiSwitch.ts, usageDb.ts, cli.ts, terminal.ts, webdav.ts, tray.ts, ...)
  - `src/shared/` — Pure logic (zero Node/Rust deps): types, configStore, utilities

## Layer Boundaries
- `shared/` → no imports from renderer or Tauri adapters (pure, host-agnostic)
- `src/renderer/src/tauri/` → may import types from `@shared/*`, bridges to Rust via `invoke()` / `listen()`
- `renderer/` → imports from `@shared/*` and `@renderer/*`, accesses backend via `window.kimiSwitch`
- `src-tauri/src/` → Rust I/O and system primitives only; no business logic (that lives in `src/shared`)

## Dependency Rules
- Renderer NEVER calls Rust commands directly — always via the `window.kimiSwitch` adapter surface
- `window.kimiSwitch` is injected at runtime (gated on `__TAURI_INTERNALS__`); adapters call `invoke()` for commands and `listen()` for backend events
- Shared layer has zero side effects — all functions are pure
- FileAccess interface abstracts filesystem (Tauri adapter in prod, in-memory for testing)

## Technology Constraints
- Runtime: Tauri v2 + Rust + system WebView
- Frontend module system: ESM (Vite)
- Strict mode: TypeScript strict (noEmit check in build)
- Backend storage: SQLite via Rust `rusqlite`
- Build: Tauri CLI + Vite (vite.config.ts → dist/)

## Entries

