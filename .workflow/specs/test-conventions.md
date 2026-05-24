---
title: "Test Conventions"
readMode: required
priority: medium
category: test
---
# Test Conventions

Auto-generated from project analysis. Update manually as patterns evolve.

## Framework
- Framework: Vitest
- Run command: `npm test` (vitest run --coverage)
- Watch mode: `npm run test:watch`

## Directory Structure
- Pattern: co-located (test files next to source)
- Example: `src/shared/configStore.test.ts` alongside `configStore.ts`

## Naming Conventions
- Test files: `*.test.ts` / `*.test.tsx`
- Describe blocks: module name (e.g., `describe("configStore", ...)`)
- Test names: behavior description (e.g., `it("creates complete default shortcuts", ...)`)

## Coverage
- Targets: 80% lines/functions/statements, 55% branches
- Enforced on: `src/shared/configStore.ts`
- Config: `vitest.config.ts`

## Patterns
- In-memory FileAccess for filesystem tests (no real I/O)
- jsdom environment for renderer tests
- No mocking of database — use real SQLite in-memory
- Assertions: Vitest built-in `expect` (no chai/jest-dom)

## Entries

