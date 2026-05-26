# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-11
**Commit:** 1e21f33
**Branch:** master

## OVERVIEW

Electron desktop app for managing kimi-code-cli providers, models, profiles, MCP servers, skills, backups, shortcuts, and update checks. It reads and writes TOML config files from `~/.kimi/` and supports zh-CN/en-US locales plus dark/light themes. Stack: Electron 35, React 18, TypeScript 5, electron-vite, Vitest, electron-builder.

## STRUCTURE

```
kimi-code-switch-gui/
|-- src/main/          # Electron lifecycle, tray, IPC handlers, native/file/WebDAV services
|-- src/preload/       # contextBridge API and initial renderer theme injection
|-- src/renderer/src/  # React UI, state hooks, tabs, i18n, CSS theme tokens
|-- src/shared/        # typed config transforms, parsers, redaction, shortcuts, skills
|-- resources/         # packaged app icons and extra resources
|-- docs/images/       # README screenshots only
|-- .github/workflows/ # tag-triggered release workflow
|-- out/               # generated electron-vite build output; do not edit
|-- release/           # generated electron-builder installers; do not edit
`-- coverage/          # generated Vitest coverage output; do not edit
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Runtime window/tray/IPC behavior | `src/main/index.ts` | Central registry for all `ipcMain.handle(...)` channels. |
| Main-process native services | `src/main/modules/` | Terminal, CLI, backups, WebDAV, file snapshots, shortcuts, updates. |
| Renderer bridge contract | `src/preload/index.ts` | `window.kimiSwitch` API mirrors main IPC channels. |
| UI composition and app shell | `src/renderer/src/App.tsx` | Thin shell around `useAppHandlers`, dialogs, topbar, tabs. |
| Renderer state orchestration | `src/renderer/src/useAppHandlers.tsx` | Composes persistence, safety, backup, preview, shortcuts, mutation hooks. |
| Tab content | `src/renderer/src/tabs/TabPanels.tsx` plus parent-level feature files | `tabs/` is not a per-tab module tree. |
| CSS/theme behavior | `src/renderer/src/styles.css` | CSS variables drive dark/light and appearance themes. |
| Config parsing and writes | `src/shared/configStore.ts` | TOML documents, profiles, panel settings, state transforms. |
| MCP JSON parsing | `src/shared/mcpStore.ts` | Strict JSON parser plus serializer that omits disabled servers. |
| Preview redaction/doctor reports | `src/shared/configSafety.ts` | Secrets are masked before preview/report surfaces. |
| Shortcut definitions | `src/shared/shortcutStore.ts` | Source of global/window shortcut actions and normalization. |
| Release workflow | `.github/workflows/release.yml` | Runs tests, creates GitHub release, builds macOS/Windows installers. |

## CODE MAP

| Symbol / File | Type | Location | Role |
|---------------|------|----------|------|
| `registerIpcHandlers` | function | `src/main/index.ts` | Registers app, backup, MCP, skills, dialog IPC channels. |
| `saveStateWithSafety` | function | `src/main/index.ts` | Snapshot conflict gate before writing managed config files. |
| `api` / `KimiSwitchApi` | bridge object/type | `src/preload/index.ts` | Typed renderer-accessible API exposed via `contextBridge`. |
| `useAppHandlers` | hook | `src/renderer/src/useAppHandlers.tsx` | Central renderer state and action aggregator. |
| `TabPanels` | component | `src/renderer/src/tabs/TabPanels.tsx` | Routes tab-specific panels and edit forms. |
| `ABOUT_INFO.version` | constant | `src/renderer/src/aboutPage.tsx` | In-app version string updated during releases. |
| `AppState` | interface | `src/shared/types.ts` | Shared persisted state contract across all processes. |
| `buildConfigDocument` | function | `src/shared/configStore.ts` | Serializes kimi CLI TOML config. |
| `parseMcpConfigStrict` | function | `src/shared/mcpStore.ts` | Validates raw MCP JSON config. |
| `redactAppStateSecrets` | function | `src/shared/configSafety.ts` | Masks API keys, auth headers, passwords, URLs before display. |
| `SHORTCUT_ACTIONS` | constant | `src/shared/shortcutStore.ts` | Canonical shortcut catalog. |

## CONVENTIONS

- ESM everywhere: `package.json` has `"type": "module"`; TypeScript configs use `moduleResolution: "Bundler"`.
- Root `tsconfig.json` is references only. Main/preload/shared compile through `tsconfig.node.json`; renderer/shared through `tsconfig.web.json`.
- Aliases: `@shared/*` works in main, preload, renderer, tests; `@renderer/*` works in renderer and tests.
- Build command is `tsc --noEmit && electron-vite build`; do not bypass the TypeScript check.
- Renderer HTML entry is `src/renderer/index.html`, configured explicitly in `electron.vite.config.ts`.
- Vitest runs in `jsdom`, includes `src/**/*.test.ts(x)`, and only collects coverage from `src/shared/**/*.ts` with 80/80/55/80 thresholds.
- Use 2-space TypeScript with semicolons, double quotes, PascalCase React components, camelCase helpers, explicit public/shared types.
- Shared logic uses small exported functions and plain records, not classes.
- All config manipulation should go through shared pure state helpers, especially `src/shared/configStore.ts`; renderer code should not own config transforms.
- `FileAccess` abstracts filesystem I/O for config code and tests should prefer in-memory implementations over real `~/.kimi/` files.
- i18n is a simple key-value lookup in `src/renderer/src/i18n.ts`; do not introduce an external i18n library without a clear need.
- CSS theming uses custom properties and root `data-theme`; preserve that mechanism when changing appearance behavior.
- Keep tests next to source files and use focused single-file Vitest runs while iterating.

## ANTI-PATTERNS (THIS PROJECT)

- Do not edit `out/`, `release/`, or `coverage/`; regenerate them.
- Do not commit real `~/.kimi/` configs, API keys, WebDAV credentials, or unredacted preview output.
- Do not add renderer direct filesystem/Electron imports; go through `window.kimiSwitch` in preload.
- Do not add IPC channels only on one side. Update `src/main/index.ts`, `src/preload/index.ts`, and renderer call sites together.
- Do not weaken redaction in `src/shared/configSafety.ts`; preview and doctor surfaces may contain user secrets.
- Do not add config transforms in renderer-only files; put parse/serialize/state rules under `src/shared/` with tests.
- Do not use Terminal.app AppleScript via System Events or clipboard keystrokes; terminal tests assert against that.

## COMMANDS

```bash
npm run dev:electron    # Start Electron dev server with hot reload
npm run build           # Type-check + build (tsc --noEmit && electron-vite build)
npm test                # Run Vitest with coverage
npm run test:watch      # Run Vitest in watch mode
npm run dist:mac        # Build macOS installers (dmg + zip)
npm run dist:win        # Build Windows installers (nsis + portable)
npm run clean
npx vitest run src/shared/configStore.test.ts  # Run a single test file
```

## RELEASE RULES

When the user asks to `提交代码`:

Execute end-to-end without asking for confirmation:

1. Run `git status` and `git diff` to inspect the actual changed files.
2. Generate the commit message from the diff, following existing repo style from `git log`; prefer lowercase conventional-commit prefixes such as `feat:`, `fix:`, `chore:`, `ci:`, and `docs:`.
3. Stage only files relevant to the current task.
4. Commit with that message.
5. Push to `origin master`.

Prefer this push command when GitHub SSH stalls:

```bash
GIT_SSH_COMMAND='ssh -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2' git push origin master
```

When the user asks to `发布新版本`:

1. If a version is provided, use it only if it matches lowercase `vX.Y.Z`. If no version is provided, run `git fetch --tags`, read the latest `v*` tag, and increment the patch version.
2. Update all version-bearing files:
   - `CHANGELOGS/{locale}.md`: add a new `## [X.Y.Z] - YYYY-MM-DD` section to all 6 files: `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `de-DE`, `es-ES`. Translate the body for each language and mirror the section structure across files.
   - `CHANGELOG.md`: keep it as the changelog index only; do not write release body content there.
   - `README.md`: update any current-version references.
   - `package.json`: bump the `version` field.
   - In-app version references: grep the previous version string, notably `ABOUT_INFO.version` in `src/renderer/src/aboutPage.tsx`.
3. Commit and push release changes using the commit SOP above; use a message such as `chore: release v1.0.2`.
4. Create an annotated, strictly increasing `vX.Y.Z` tag. Extract the new section from `CHANGELOGS/zh-CN.md` as the tag message:
   ```bash
   awk -v ver="X.Y.Z" '
     $0 ~ "^## \\[" ver "\\]" { capture = 1; next }
     capture && /^## \[/ { exit }
     capture { print }
   ' CHANGELOGS/zh-CN.md > /tmp/release-notes.md
   git tag -a vX.Y.Z -F /tmp/release-notes.md
   ```
5. Push the tag with `git push origin vX.Y.Z` so `.github/workflows/release.yml` builds installers and publishes the GitHub Release. CI re-extracts zh-CN and en-US sections from `CHANGELOGS/` and combines them with `---`.

Release safety rails:

- Do not use `--no-verify`.
- Do not force-push to `main` or `master` without an explicit user request.
- Never commit files that look like secrets, including `.env` and `credentials.*`.
- If pre-commit hooks fail, fix the root cause and commit again; do not use `git commit --amend` for this failure path.

## NOTES

- `src/main/index.ts`, `src/renderer/src/tabs/TabPanels.tsx`, and `src/renderer/src/i18n.ts` are large but intentionally central/data-heavy.
- `src/renderer/src/tabs/` contains only the router/context files; most feature components live one level up.
- LSP may be unavailable unless `typescript-language-server` is installed; use `rg` and AST/ripgrep fallbacks.
