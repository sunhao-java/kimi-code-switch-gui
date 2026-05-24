---
title: "Quality Rules"
readMode: required
priority: medium
category: quality
---
# Quality Rules

## Build Gate
- `tsc --noEmit` must pass (zero type errors)
- `electron-vite build` must succeed
- No esbuild transform errors

## Test Gate
- `npm test` (vitest run --coverage) must pass all tests
- Coverage thresholds: 80% lines/functions/statements, 55% branches on configStore.ts

## Code Quality
- No `any` type (use `unknown` + type narrowing)
- No `@ts-ignore` / `@ts-expect-error` without justification
- No unused imports or variables (TypeScript strict)
- IPC handlers must return typed `{ ok: true, ... } | { ok: false, error: string }`

## Entries

