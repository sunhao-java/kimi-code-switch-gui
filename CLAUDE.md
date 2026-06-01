# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tauri (Rust + WebView) desktop app for managing `kimi-code-cli` configuration — providers, models, and profiles. Reads/writes TOML config files (`config.toml`, `config.profiles.toml`, `config.panel.toml`) from `~/.kimi/`. Supports zh-CN and en-US locales, dark/light themes. Migrated from Electron (see git history on `feat/migrate-to-tauri`).

## Commands

```bash
npm run dev             # Start Tauri dev (Rust backend + vite renderer with hot reload)
npm run build           # Build Tauri app (release bundle)
npm test                # Run tests with coverage (vitest run --coverage)
npm run dist:mac        # Build macOS dmg
npm run dist:win        # Build Windows nsis
npm run dev:web         # Renderer-only dev server (no Rust), for pure UI work
```

Run a single test file: `npx vitest run src/shared/configStore.test.ts`

## Architecture

**Architecture principle: thin Rust shell + business logic in the frontend.** The ~5300-line `src/shared/` business logic runs in the renderer; the Rust backend only exposes I/O and system-integration primitives. This let the migration reuse `src/shared/` with near-zero changes.

- **Rust backend** (`src-tauri/src/`) — Tauri v2 commands:
  - `fs_access.rs` — file I/O (read/write/ensure_dir/remove_file/remove_dir/list_dir/list_subdirs/hostname), resolves `~/` paths
  - `system.rs` — `exec_command` (run kimi/uv/osascript), `http_request` (reqwest; WebDAV/connectivity/GitHub/PyPI, bypasses browser CORS), `file_stat`/`read_file_slice` (log tail), `write_executable`
  - `usage.rs` — SQLite via `rusqlite` (`usage_query`/`usage_exec`/...); frontend passes SQL + named params
  - `tray.rs` — dynamic system tray; frontend passes menu JSON, clicks emit `tray://command`
- **Renderer** (`src/renderer/`) — React 18 SPA. Single `App.tsx` handles all tabs. No router.
  - `src/renderer/src/tauri/` — adapters bridging `window.kimiSwitch` to Rust commands. `kimiSwitch.ts` installs the global; `usageDb.ts`/`usageLogWatcher.ts`/`cli.ts`/`terminal.ts`/`webdav.ts`/`backup.ts`/`fileSnapshots.ts`/`tray.ts` port the former Electron-main logic to the frontend.
- **Shared layer** (`src/shared/`) — Pure logic (zero Node/Electron deps), reused as-is:
  - `types.ts` — all TS interfaces (`AppState`, `MainConfig`, `Profile`, `PanelSettings`, `PreviewBundle`, etc.)
  - `configStore.ts` — TOML parse/serialize (`@iarna/toml`), state mutations (`upsertProvider`/`applyProfile`/...), preview/diff. Core business logic.

## Key Patterns

- `window.kimiSwitch` is injected at runtime by `src/renderer/src/tauri/kimiSwitch.ts` (gated on `__TAURI_INTERNALS__` in `main.tsx`), exposing the same API surface the Electron preload used to.
- Path alias `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/src/*` (configured in `vite.config.ts` + tsconfigs)
- All state mutations in `configStore.ts` are pure functions taking/returning `AppState` — no side effects
- `FileAccess` interface abstracts file I/O; `tauri/fileAccess.ts` implements it via Rust commands, keeping `configStore` testable with in-memory FS
- i18n is a simple key-value lookup in `src/renderer/src/i18n.ts` — no external i18n library
- CSS uses custom properties for theming; `data-theme` attribute on `:root` switches dark/light
- Window is 1500×980 (also the min size) — the topbar layout assumes this width; titlebar uses `Transparent` + `trafficLightPosition {x:14,y:12}`

## Testing

- Vitest with jsdom environment
- Coverage targets: 80% lines/functions/statements, 55% branches (enforced on `src/shared/configStore.ts`)
- Tests use an in-memory `FileAccess` implementation — no real filesystem
- Test files live next to source: `configStore.test.ts` alongside `configStore.ts`

## Release

Tag push (`v*`) triggers `.github/workflows/release.yml`, which builds macOS (dmg, arm64 + x64) and Windows (nsis) bundles via `tauri-action`, then publishes a draft GitHub Release. Bundle config lives in `src-tauri/tauri.conf.json`.

## Workflow Automation (Agent SOP)

These are standing instructions — the agent must execute them without re-confirming scope each time.

### "提交代码" / "commit code" / "push 代码"

Execute end-to-end, no confirmation needed:
1. `git status` + `git diff` to inspect actual changes
2. Generate a commit message from the diff, following the existing repo style (see `git log` — lowercase conventional-commit prefixes like `feat:`, `fix:`, `chore:`, `ci:`, `docs:`)
3. `git commit` with that message
4. `git push` to remote

### "发布新版本" / "release a new version" / "cut a release"

1. **Version number resolution**
   - If user provided a version, use it (still enforcing `vX.Y.Z` format)
   - If not provided: `git fetch --tags` → `git tag -l "v*" --sort=-v:refname | head -1` → increment patch by 1
2. **Update version-bearing files**
   - `CHANGELOGS/{locale}.md` — add a new `## [X.Y.Z] - YYYY-MM-DD` section to **all 6 files** (`zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `de-DE`, `es-ES`), each with body translated for that language. Section structure (新增/变更/修复 → Added/Changed/Fixed → 追加/変更/修正 → Hinzugefügt/Geändert/Behoben → Añadido/Cambiado/Corregido) should mirror across files. **CHANGELOG.md** at the repo root is just an index pointing to the 6 files — do not write release content there.
   - `README.md` — update any "current version" references
   - `package.json` — bump `version` field
   - In-app version references in code (grep the previous version string; notably `src/renderer/src/aboutPage.tsx` `ABOUT_INFO.version`)
3. **Commit + push** — apply the commit SOP above (commit message describes the release bump, e.g. `chore: release v1.0.2`)
4. **Tag with release notes** — extract the new version's CHANGELOG section from the zh-CN file and use it as the annotated tag message. The GitHub Release body will be bilingual (zh-CN + en-US, joined by `---`) and is assembled by CI; the tag message just needs the human-author intent (zh-CN by convention):
   ```bash
   awk -v ver="X.Y.Z" '
     $0 ~ "^## \\[" ver "\\]" { capture = 1; next }
     capture && /^## \[/ { exit }
     capture { print }
   ' CHANGELOGS/zh-CN.md > /tmp/release-notes.md
   git tag -a vX.Y.Z -F /tmp/release-notes.md
   ```
   Tag format requirement still applies: lowercase `v` prefix + three numeric segments, strictly monotonic increasing; reject any deviation like `X.Y.Z` / `version-X.Y.Z` / `release-X.Y.Z`
5. **Push tag** — `git push origin vX.Y.Z` so the `v*` CI workflow can pick it up. The CI in `.github/workflows/release.yml` re-extracts the matching sections from `CHANGELOGS/zh-CN.md` + `CHANGELOGS/en-US.md`, combines them with a `---` divider, and overwrites the GitHub Release body via `gh release edit --notes-file`. Keep CHANGELOGS/ as the single source of truth.

### Safety rails

- Still honor the general Git Safety Protocol: no `--no-verify`, no force-push to main/master without explicit ask, never commit files that look like secrets (`.env`, `credentials.*`).
- If pre-commit hooks fail, fix the root cause and create a new commit — do not `--amend` (the commit didn't happen, amend would rewrite the previous commit).

