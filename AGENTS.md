# Repository Guidelines

## Project Structure & Module Organization

This repository is an Electron desktop app built with React and TypeScript.

- `src/main/`: Electron main process, tray behavior, window lifecycle, IPC handlers.
- `src/preload/`: preload bridge exposed to the renderer.
- `src/renderer/src/`: React UI, styles, i18n, and static assets.
- `src/shared/`: config parsing, state transforms, name rules, and shared types.
- `src/shared/*.test.ts`: Vitest unit tests for shared logic.
- `resources/`: packaged app resources such as icons.
- `out/` and `release/`: generated build artifacts; do not edit by hand.

## Build, Test, and Development Commands

- `npm run dev:electron`: run the Electron app locally with hot reload.
- `npm run build`: type-check and build main, preload, and renderer bundles.
- `npm test`: run Vitest once with coverage output.
- `npm run test:watch`: run tests in watch mode during development.
- `npm run dist:mac`: build macOS installers (`dmg`, `zip`).
- `npm run dist:win`: build Windows installers (`nsis`, `portable`).
- `npm run clean`: remove `out/` and `release/`.

## Coding Style & Naming Conventions

Use TypeScript with the existing project style: 2-space indentation, semicolons, double quotes, and explicit types on public/shared APIs. Keep React components and helpers in PascalCase and utility functions in camelCase. Match existing file patterns such as `configStore.ts`, `mcpStore.ts`, and `nameRules.ts`. Prefer small, boring functions over broad abstractions.

## Testing Guidelines

Vitest is the test runner and coverage is collected with `@vitest/coverage-v8`. Add or update tests for any change under `src/shared/`, especially config parsing, state transforms, and error cases. Name tests alongside the source file, for example `mcpStore.test.ts`. Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines

Recent history follows short imperative commits such as `feat: improve config editors and MCP management` and `fix: save settings changes immediately`. Prefer Conventional Commit prefixes like `feat:`, `fix:`, and `chore:`. PRs should include a clear summary, linked issue if applicable, test/build results, and screenshots or GIFs for renderer changes.

## Security & Configuration Tips

Do not commit real API keys, WebDAV passwords, or user-specific config files from `~/.kimi/`. Treat previewed TOML/JSON content as sensitive. When editing persistence or backup logic, verify both local and WebDAV flows before merge.

## Agent Release Rules

When the user asks to `提交代码`:

1. Inspect the files currently changed in the repository.
2. Generate a commit message from the actual content of those changes.
3. Commit the relevant changed files with that message.
4. Push the commit to the remote repository.

When the user asks to `发布新版本`:

1. If no version is provided, read the latest existing Git tag.
2. Increment the version using a three-part tag in the form `vX.Y.Z`.
3. Update `CHANGELOG.md` with the new release entry.
4. Update the current version shown in `README.md`.
5. Update version-related content in the app About page.
6. Generate a commit message from the actual repository changes.
7. Commit and push the release changes.
8. Create a tag using the new version number.
9. Push the tag to the remote repository.

Tag rules:

- Tags must start with `v`.
- Tags must contain exactly three numeric segments, for example `v1.0.0`.
- Version numbers must always increase and never go backwards.
