# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop app for managing `kimi-code-cli` configuration — providers, models, and profiles. Reads/writes TOML config files (`config.toml`, `config.profiles.toml`, `config.panel.toml`) from `~/.kimi/`. Supports zh-CN and en-US locales, dark/light themes.

## Commands

```bash
npm run dev:electron    # Start Electron dev server with hot reload
npm run build           # Type-check + build (tsc --noEmit && electron-vite build)
npm test                # Run tests with coverage (vitest run --coverage)
npm run dist:mac        # Build macOS installers (dmg + zip)
npm run dist:win        # Build Windows installers (nsis + portable)
```

Run a single test file: `npx vitest run src/shared/configStore.test.ts`

## Architecture

Three-process Electron app built with `electron-vite`:

- **Main** (`src/main/index.ts`) — Electron main process. Registers IPC handlers (`app:load-state`, `app:save-state`, `app:preview-state`, `app:default-settings`, `dialog:pick-file`). Owns file system access via a `FileAccess` adapter that resolves `~/` paths.
- **Preload** (`src/preload/index.ts`) — Bridges IPC to renderer via `contextBridge.exposeInMainWorld("kimiSwitch", api)`. The renderer accesses it as `window.kimiSwitch`.
- **Renderer** (`src/renderer/`) — React 18 SPA. Single `App.tsx` component handles all tabs (overview, profiles, providers, models, preview, settings). No router.

**Shared layer** (`src/shared/`) — Pure logic shared across all processes:
- `types.ts` — All TypeScript interfaces (`AppState`, `MainConfig`, `Profile`, `PanelSettings`, `PreviewBundle`, etc.)
- `configStore.ts` — TOML parsing/serialization (`@iarna/toml`), state mutations (`upsertProvider`, `upsertModel`, `applyProfile`, etc.), preview/diff generation. This is the core business logic — all config manipulation goes through here.

## Key Patterns

- Path alias `@shared/*` maps to `src/shared/*` (configured in both tsconfig files and electron.vite.config.ts)
- Path alias `@renderer/*` maps to `src/renderer/src/*` (renderer only)
- All state mutations in `configStore.ts` are pure functions that take and return `AppState` — no side effects
- `FileAccess` interface abstracts file I/O, making `configStore` testable with in-memory FS
- The renderer gets state via IPC (`window.kimiSwitch.loadState()`) and sends mutations back via `window.kimiSwitch.saveState()`
- i18n is a simple key-value lookup in `src/renderer/src/i18n.ts` — no external i18n library
- CSS uses custom properties for theming; `data-theme` attribute on `:root` switches between dark/light

## Testing

- Vitest with jsdom environment
- Coverage targets: 80% lines/functions/statements, 55% branches (enforced on `src/shared/configStore.ts`)
- Tests use an in-memory `FileAccess` implementation — no real filesystem
- Test files live next to source: `configStore.test.ts` alongside `configStore.ts`

## Release

Tag push (`v*`) triggers GitHub Actions workflow that builds macOS (dmg/zip) and Windows (nsis/portable) installers via `electron-builder`, then publishes to GitHub Releases.
