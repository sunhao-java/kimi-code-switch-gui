# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-11
**Commit:** 1e21f33
**Branch:** master

## OVERVIEW

Electron desktop app for managing kimi-code-cli providers, models, profiles, MCP servers, skills, backups, shortcuts, and update checks. Stack: Electron 35, React 18, TypeScript 5, electron-vite, Vitest, electron-builder.

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
npm run dev:electron
npm run build
npm test
npm run test:watch
npm run dist:mac
npm run dist:win
npm run clean
```

## RELEASE RULES

When the user asks to `提交代码`:

1. Inspect the actual changed files.
2. Generate the commit message from those changes.
3. Commit the relevant changed files.
4. Push to `origin master`.

Prefer this push command when GitHub SSH stalls:

```bash
GIT_SSH_COMMAND='ssh -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2' git push origin master
```

When the user asks to `发布新版本`:

1. If no version is provided, read the latest `vX.Y.Z` tag and increment patch.
2. Update `CHANGELOG.md`, `README.md`, `package.json`, and `ABOUT_INFO.version` in `src/renderer/src/aboutPage.tsx`.
3. Commit and push release changes.
4. Create a strictly increasing `vX.Y.Z` tag.
5. Push the tag so `.github/workflows/release.yml` builds installers.

## NOTES

- `src/main/index.ts`, `src/renderer/src/tabs/TabPanels.tsx`, and `src/renderer/src/i18n.ts` are large but intentionally central/data-heavy.
- `src/renderer/src/tabs/` contains only the router/context files; most feature components live one level up.
- LSP may be unavailable unless `typescript-language-server` is installed; use `rg` and AST/ripgrep fallbacks.
