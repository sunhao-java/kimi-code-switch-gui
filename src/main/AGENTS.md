# MAIN PROCESS GUIDE

## OVERVIEW

Electron main-process code owns app lifecycle, BrowserWindow/tray behavior, IPC handlers, native integrations, safeStorage, and file/WebDAV operations.

## STRUCTURE

```
src/main/
|-- index.ts   # window lifecycle, tray, backup scheduling, all IPC handlers
`-- modules/   # pure service modules consumed by index.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add or change IPC | `index.ts` `registerIpcHandlers` | Keep preload and renderer API in sync. |
| Config writes / conflict checks | `index.ts` `saveStateWithSafety` | Uses file snapshots before writing. |
| Tray/window lifecycle | `index.ts` | `mainWindow`, `tray`, display restore, close behavior. |
| Backup orchestration | `index.ts`, `modules/backupRestore.ts`, `modules/webdav.ts` | Local and WebDAV flows share metadata conventions. |
| CLI and MCP subprocesses | `modules/cli.ts` | `kimi` commands and connectivity checks. |
| Terminal launch | `modules/terminal.ts` | Covered by `terminal.test.ts`; preserve shell quoting and AppleScript rules. |
| Global shortcuts | `modules/shortcuts.ts`, `@shared/shortcutStore` | Main registers normalized shared actions. |
| Update checks | `modules/updates.ts` | GitHub Releases API plus release-page fallback. |

## CONVENTIONS

- `src/main/index.ts` is intentionally the IPC registry; service logic belongs in `src/main/modules/` when it can be isolated.
- Module files export named functions, use shared types from `@shared/types`, and avoid classes.
- Keep async IPC handlers returning typed plain objects or shared result unions.
- Encrypt WebDAV passwords with `safeStorage` before persistence and decrypt only for runtime use.
- Use `resolveHome` and `fileAccess` wrappers for user paths instead of ad hoc filesystem handling.
- Background/change backup timers are centralized in `index.ts`; do not create competing timers in modules.

## ANTI-PATTERNS

- Do not register IPC directly in service modules.
- Do not expose raw filesystem paths or secrets to renderer preview surfaces without shared redaction.
- Do not shell-concatenate unquoted paths; terminal code has explicit quoting helpers and tests.
- Do not bypass `detectExternalChangeConflict` for writes to managed config files.

## TESTS

- Main module tests live beside modules, currently `src/main/modules/terminal.test.ts`.
- If extracting behavior from `index.ts` into a module, add colocated Vitest coverage for shell/file/edge cases.
