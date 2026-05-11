# SHARED LOGIC GUIDE

## OVERVIEW

Shared TypeScript layer for typed app state, config parsing/serialization, validation, redaction, name rules, shortcuts, skills discovery, and version comparison.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| App state contract | `types.ts` | Source of cross-process unions/interfaces. |
| Kimi TOML config | `configStore.ts` | Defaults, load/save, profiles, panel settings, preview diffs. |
| MCP JSON config | `mcpStore.ts` | Strict parser, normalized transports, serializer. |
| Secret redaction / doctor | `configSafety.ts` | Preview bundle, managed documents, risk reports. |
| Entry names | `nameRules.ts` | Normalize and ensure provider/model/profile/MCP uniqueness. |
| Shortcuts | `shortcutStore.ts` | Action catalog, conflict detection, platform formatting. |
| Skill scanning | `skillsStore.ts` | Skill path groups, metadata parsing, summaries. |
| Release version comparison | `versionUtils.ts` | Normalize and compare `vX.Y.Z` / semver-like strings. |

## CONVENTIONS

- Shared code must stay runtime-neutral: no Electron, DOM, or renderer-specific imports.
- Export plain functions, constants, and types; keep helpers private unless used outside the file.
- Prefer parse/build pairs: `parse*Document` validates input, `build*Document` serializes output with stable formatting.
- Use `unknown` plus local type guards for untrusted TOML/JSON/YAML-like content.
- Preserve unknown config sections where current data model allows pass-through records.
- Keep defaults centralized in this layer so main and renderer do not drift.
- Add or update colocated `*.test.ts` for any behavior change here; coverage is collected only for `src/shared/**/*.ts`.

## ANTI-PATTERNS

- Do not add UI labels or renderer formatting here unless the value is a cross-process type/contract.
- Do not expose raw secrets in preview structures. Use `configSafety` redaction helpers.
- Do not silently drop unknown MCP server keys; `mcpStore.ts` keeps extras where possible.
- Do not change default paths such as `~/.kimi/config.toml`, `~/.kimi/.panel`, or `~/.kimi/mcp.json` without migration tests.
- Do not weaken shortcut conflict detection; both global and window scopes use this catalog.

## TESTS

- `configStore.test.ts`: profiles, providers/models, panel settings, preview diffs, migrations.
- `configSafety.test.ts`: redaction, doctor reports, managed document safety.
- `mcpStore.test.ts`: strict JSON parsing, transport normalization, import alias handling.
- `shortcutStore.test.ts`: defaults, accelerator validation, conflicts, platform labels.
- `skillsStore.test.ts`: discovery path parsing and skill metadata extraction.
- `versionUtils.test.ts`: release version normalization and ordering.
