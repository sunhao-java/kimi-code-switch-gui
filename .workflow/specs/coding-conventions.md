---
title: "Coding Conventions"
readMode: required
priority: high
category: coding
---
# Coding Conventions

Auto-generated from project analysis. Update manually as patterns evolve.

## Formatting
- Indentation: 2 spaces
- Line length: not configured (no prettier/editorconfig)
- Trailing commas: ES5 style (arrays, objects)
- Semicolons: yes (required)

## Naming
- Variables/functions: camelCase
- Classes/types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Files: camelCase (e.g., configStore.ts, useShortcuts.ts)
- CSS classes: kebab-case (e.g., insights-dashboard, summary-card)

## Imports
- Style: named imports (no default exports except React components)
- Path aliases: `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/src/*`
- Order: node built-ins, external packages, @shared/*, relative
- Type imports: use `import type { ... }` for type-only imports

## Patterns
- Pure functions for state mutations (configStore pattern)
- IPC registration: `registerXxxIpc(ipcMain, ctx)` with typed context interface
- React hooks: custom hooks in separate files (useToast.ts, useShortcuts.ts)
- CSS: custom properties via tokens.css, no Tailwind
- i18n: simple key-value lookup function `t(locale, key)`
- Error handling: IPC handlers return `{ ok: true, ... } | { ok: false, error: string }`

## Entries

