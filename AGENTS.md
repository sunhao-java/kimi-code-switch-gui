# AGENTS.md

本文件给 Codex/Claude 等代码代理使用，描述当前仓库的真实架构、常用命令和操作边界。回复用户时默认使用简体中文；代码标识、命令、路径和错误日志保持原文。

## Project Overview

Tauri v2 桌面应用，用于管理 `kimi-code-cli` 的 providers、models、profiles、MCP servers、skills、backups、shortcuts、usage insights 和更新检查。应用读写 `~/.kimi/` 下的 TOML/JSON 配置，并将面板设置迁移到 `~/.kimi/.panel/app.db` 的 SQLite 结构化表中。

当前技术栈：Tauri 2 + Rust、React 18、TypeScript 5、Vite 6、Vitest、rusqlite、reqwest。项目已经从 Electron 迁移到 Tauri；不要再按 Electron 目录和 IPC 模型实现新功能。

核心架构原则：**thin Rust shell + business logic in renderer/shared**。`src/shared/` 中的业务逻辑保持纯 TypeScript，Rust 后端只暴露文件 I/O、系统集成、SQLite、托盘、全局快捷键等原子能力。

## Structure

```text
kimi-code-switch-gui/
|-- src-tauri/                 # Tauri v2 Rust backend, capabilities, bundle config
|   |-- src/
|   |   |-- lib.rs             # Tauri plugin/state/command registry
|   |   |-- fs_access.rs       # read/write/list/remove/hostname, resolves ~/ paths
|   |   |-- system.rs          # exec_command/http_request/file_stat/read_file_slice/write_executable
|   |   |-- usage.rs           # SQLite bridge for usage/config_history/panel_settings
|   |   |-- panel_settings_store.rs
|   |   |-- config_history.rs
|   |   |-- mcp_servers_store.rs
|   |   |-- tray.rs
|   |   `-- shortcuts.rs       # Rust-side global shortcut registration/window toggle
|   `-- tauri.conf.json
|-- src/renderer/src/          # React SPA, state hooks, tabs, i18n, CSS, Tauri adapters
|   |-- tauri/                 # Renderer adapters over Rust commands/plugins
|   |-- tabs/                  # Tab router/context; feature components mostly live one level up
|   |-- App.tsx
|   |-- useAppHandlers.tsx
|   |-- i18n.ts
|   `-- styles.css
|-- src/shared/                # Pure config/state/parser/redaction/shortcut logic
|-- resources/                 # App icons/assets
|-- docs/images/               # README screenshots
|-- .github/workflows/         # tag-triggered release workflow
|-- dist/                      # Generated Vite output; do not edit
|-- src-tauri/target/          # Generated Rust/Tauri build output; do not edit
`-- coverage/                  # Generated Vitest coverage output; do not edit
```

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Tauri command/plugin registration | `src-tauri/src/lib.rs` | Central Rust registry for commands and managed state. |
| File I/O | `src-tauri/src/fs_access.rs`, `src/renderer/src/tauri/fileAccess.ts` | `FileAccess` adapter keeps shared config code testable. |
| External processes/HTTP/log tail | `src-tauri/src/system.rs`, `src/renderer/src/tauri/cli.ts`, `terminal.ts` | `reqwest` bypasses browser CORS; command execution stays in Rust. |
| SQLite usage/config stores | `src-tauri/src/usage.rs`, `panel_settings_store.rs`, `config_history.rs` | Panel settings are structured columns plus JSON columns. |
| Tray behavior | `src-tauri/src/tray.rs`, `src/renderer/src/tauri/tray.ts` | Frontend sends menu JSON; Rust emits `tray://command`. |
| Global shortcuts | `src-tauri/src/shortcuts.rs`, `src/shared/shortcutStore.ts` | Window show/hide global shortcut is registered and handled in Rust. |
| Runtime bridge | `src/renderer/src/tauri/kimiSwitch.ts`, `src/renderer/src/main.tsx` | Injects `window.kimiSwitch` in Tauri runtime. |
| App shell/state orchestration | `src/renderer/src/App.tsx`, `src/renderer/src/useAppHandlers.tsx` | Central UI state and action composition. |
| Tab content | `src/renderer/src/tabs/TabPanels.tsx` plus feature files in `src/renderer/src/` | `tabs/` is not a per-feature folder tree. |
| Config parsing/serialization | `src/shared/configStore.ts` | TOML documents, profiles, panel settings, mutations. |
| MCP JSON parsing | `src/shared/mcpStore.ts`, `src-tauri/src/mcp_servers_store.rs` | JSON parser plus SQLite-backed MCP store. |
| Preview redaction/doctor | `src/shared/configSafety.ts` | Secrets must stay masked before preview/report display. |
| i18n | `src/renderer/src/i18n.ts` | Simple key-value lookup, no external i18n library. |
| CSS/theme | `src/renderer/src/styles.css` | CSS variables and `data-theme`; appearance themes use custom tokens. |
| Release workflow | `.github/workflows/release.yml` | Builds installers and publishes release on `v*` tags. |

## Key Symbols

| Symbol / File | Role |
|---------------|------|
| `kimiSwitchTauri` | Renderer implementation of the `window.kimiSwitch` API surface. |
| `installKimiSwitchTauri` | Runtime injection before React render in Tauri. |
| `sync_window_toggle_shortcut` | Rust command syncing configured window toggle shortcut. |
| `ShortcutRuntimeState` | Rust state tracking registered shortcut and window toggle behavior. |
| `set_tray` / `show_main_window` / `set_dock_icon_visibility` | Native tray/window commands. |
| `loadAppState` / `saveAppState` | Shared state load/save over injected `FileAccess`. |
| `createDefaultPanelSettings` | Default panel settings source, including shortcuts and tray behavior. |
| `SHORTCUT_ACTIONS` | Canonical shortcut catalog and default accelerators. |
| `ABOUT_INFO.version` | In-app version string updated during releases. |

## Conventions

- ESM everywhere: `package.json` has `"type": "module"`; TS configs use `moduleResolution: "Bundler"`.
- Root `tsconfig.json` is references only. Use `npx tsc --noEmit` for type checks.
- Aliases: `@shared/*` -> `src/shared/*`; `@renderer/*` -> `src/renderer/src/*`.
- Use 2-space TypeScript, semicolons, double quotes, PascalCase React components, camelCase helpers, explicit public/shared types.
- Shared logic uses small exported functions and plain records, not classes.
- State/config transforms belong in `src/shared/` unless they require native/Tauri capabilities.
- Renderer feature code should call `window.kimiSwitch` or the established `src/renderer/src/tauri/*` adapters; avoid scattering raw `invoke()` calls through UI components.
- `FileAccess` abstracts config filesystem I/O; tests should prefer in-memory implementations over real `~/.kimi/` files.
- i18n remains a simple key-value lookup in `src/renderer/src/i18n.ts`; add all supported locales when adding user-facing keys.
- CSS theming uses custom properties and root `data-theme`; preserve the mechanism when changing visual behavior.
- Main window is designed around a 1500 x 980 baseline/minimum; topbar and dense settings layouts assume this width.
- Keep tests next to source files and run focused Vitest files while iterating.
- Rust backend should stay thin: expose native primitives and keep business decisions in shared TS unless a feature must survive hidden renderer state.

## Shortcut And Window Rules

- Global window show/hide shortcuts must be registered and handled in `src-tauri/src/shortcuts.rs`, not in renderer JS. Hidden windows should not depend on WebView callback delivery.
- Shortcut definitions/defaults live in `src/shared/shortcutStore.ts`; add/update tests in `src/shared/shortcutStore.test.ts`.
- The default show/hide shortcut is currently `Command+Shift+H` and enabled by default.
- Close-to-tray/Dock visibility behavior crosses `kimiSwitch.ts`, `tray.ts`, and Rust tray/shortcut commands; update both sides when changing that behavior.

## Anti-Patterns

- Do not edit generated `dist/`, `src-tauri/target/`, `coverage/`, old `out/`, or old `release/`; regenerate them.
- Do not add new Electron main/preload code paths. `src/main/`, `src/preload/`, Electron IPC, `electron-vite`, and `electron-builder` are stale migration history unless explicitly reintroduced.
- Do not add renderer direct filesystem access or Node/Electron imports.
- Do not add Tauri commands on only one side. Update Rust command registration, renderer adapter/types, and call sites together.
- Do not weaken redaction in `src/shared/configSafety.ts`; preview and doctor surfaces may contain secrets.
- Do not put config parse/serialize/mutation rules in renderer-only files.
- Do not use Terminal.app AppleScript via `System Events` keystrokes or clipboard paste. Use direct `do script`/iTerm-safe approaches; tests assert against this class of failure.
- Do not commit real `~/.kimi/` configs, API keys, WebDAV credentials, `.env`, `credentials.*`, or unredacted preview output.

## Commands

```bash
npm run dev             # Start Tauri dev app (Rust backend + Vite renderer)
npm run dev:web         # Renderer-only Vite server; no Rust/Tauri commands
npm run build:web       # Build renderer only
npm run build           # Build Tauri release bundle
npm test                # Vitest with coverage
npm run test:watch      # Vitest watch mode
npm run dist:mac        # Build macOS dmg
npm run dist:win        # Build Windows nsis
npm run clean           # Remove dist
npx tsc --noEmit        # Type check
npx vitest run src/shared/configStore.test.ts
cargo check             # From src-tauri/
cargo test              # From src-tauri/
```

## Verification Guidance

- Narrow shared logic change: run the focused Vitest file plus `npx tsc --noEmit`.
- Renderer UI/adapter change: run focused Vitest if present, `npx tsc --noEmit`, and `npm run build:web`.
- Rust command/backend change: run `cargo check` or `cargo test` from `src-tauri/`; run `npm run build` when bundle integration matters.
- Release/package-risk change: run `npm run build` before handoff.

## Git Operations

When the user asks `提交代码` / `commit code` / `push 代码`, execute end-to-end without asking for confirmation:

1. Run `git status` and `git diff` to inspect actual changes.
2. Generate a commit message from the diff, following existing repo style from `git log`; prefer lowercase conventional prefixes such as `feat:`, `fix:`, `chore:`, `ci:`, `docs:`.
3. Stage only files relevant to the current task. Never use `git add .` when unrelated WIP exists.
4. Commit with that message.
5. Push to `origin master`.

Prefer this push command when SSH stalls:

```bash
GIT_SSH_COMMAND='ssh -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2' git push origin master
```

Safety rails:

- Never use `--no-verify`.
- Never force-push to `main` or `master` without an explicit user request.
- Treat pre-existing uncommitted changes as intentional WIP from the user or another tool.
- If the task conflicts with existing uncommitted changes, stop and report the conflict instead of overwriting.
- If pre-commit hooks fail, fix the root cause and commit again; do not use `git commit --amend` for this failure path.

## Release Rules

When the user asks `发布新版本`:

1. If a version is provided, accept only lowercase `vX.Y.Z`. If no version is provided, run `git fetch --tags`, read the latest `v*` tag, and increment patch.
2. Update all version-bearing files:
   - `CHANGELOGS/{locale}.md`: add a new `## [X.Y.Z] - YYYY-MM-DD` section to all 6 files: `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `de-DE`, `es-ES`. Translate body content and mirror section structure across languages.
   - `CHANGELOG.md`: keep as changelog index only; do not write release body there.
   - `README.md`: update current-version references.
   - `package.json`: bump `version`.
   - In-app version references: grep previous version string, notably `ABOUT_INFO.version` in `src/renderer/src/aboutPage.tsx`.
3. Commit and push release changes using the commit SOP; message like `chore: release v1.0.2`.
4. Create an annotated, strictly increasing `vX.Y.Z` tag. Extract the new zh-CN changelog section as tag message:

   ```bash
   awk -v ver="X.Y.Z" '
     $0 ~ "^## \\[" ver "\\]" { capture = 1; next }
     capture && /^## \[/ { exit }
     capture { print }
   ' CHANGELOGS/zh-CN.md > /tmp/release-notes.md
   git tag -a vX.Y.Z -F /tmp/release-notes.md
   ```

5. Push the tag with `git push origin vX.Y.Z`. CI re-extracts zh-CN and en-US release notes from `CHANGELOGS/` and combines them with `---`.

## Notes

- `src/renderer/src/tabs/TabPanels.tsx` and `src/renderer/src/i18n.ts` are large but intentionally central/data-heavy.
- `src/renderer/src/tabs/` contains routing/context; most tab feature components live one level up.
- LSP may be unavailable unless `typescript-language-server` is installed; use `rg` and CodeGraph/ripgrep fallbacks.
