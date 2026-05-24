# Changelog

This file records the project's notable changes. Format follows Keep a Changelog; the project uses `major.minor.patch` versioning.

## [1.1.9] - 2026-05-25

### Added

- About page now shows a "Release Notes" section that renders the current version's entry from `CHANGELOGS/{locale}.md`, with a "View all releases" link on the right that jumps directly to GitHub Releases.
- The update-check dialog now fetches and renders the new release's notes (from the GitHub Release body), so users can see what's coming before upgrading.

### Changed

- CHANGELOG is split per language into `CHANGELOGS/{zh-CN,zh-TW,en-US,ja-JP,de-DE,es-ES}.md`; the top-level `CHANGELOG.md` is now an index, and the GitHub Release body is composed bilingually (zh-CN + en-US) by CI.
- In-app changelog loading strategy: on the first launch after install/upgrade, the app fetches all 6 locale files from `raw.githubusercontent.com` once and caches them under `~/.kimi/.panel/changelog-cache/`, falling back to bundled files on failure; the cache is keyed by the current `app.getVersion()`.
- Update-check main process introduces `~/.kimi/.panel/release-cache.json` with `If-None-Match` ETag + a stale-body fallback, alleviating the unauthenticated GitHub API 60 req/h rate limit.
- Removed the hard-coded "Version History" block on the About page along with its nine i18n strings; the full history is now reached via the "View all releases" button.

### Fixed

- Fixed the update-check dialog "What's New" block where `MarkdownView` rendered the version twice: the inner panel header is now hidden and only the outer title remains.

## [1.1.8] - 2026-05-25

### Added

- Five new appearance themes: Forest, Sakura, Mint, Cosmos, and Amber, each with paired light/dark palettes.
- The Skill detail page now renders SKILL.md as markdown by default; new `</>` / `Eye` icons next to the copy button toggle between rendered view and a line-numbered source view.
- When Usage Insights is disabled, the empty dashboard now shows a "Go to settings to enable" shortcut button that jumps directly to Settings → Usage Insights.

### Changed

- Usage Insights data directory moved to `~/.kimi/.panel/usage/`. The legacy `~/.kimi/usage/` directory is migrated on startup; existing data at the new location is never overwritten.
- Pre-release cleanup: removed the unused `mockttp` dependency and related dead code, pruning 159 transitive packages and shrinking the installer by an estimated 30–50 MB.
- Tightened packaging: explicitly declared `asarUnpack` for the `better-sqlite3` native module and added `postinstall: electron-builder install-app-deps` so CI and fresh checkouts work out of the box.

### Fixed

- Fixed new themes silently reverting to the default: both `parseAppearanceTheme` and the preload initialization whitelist were missing the new theme keys, causing selection to be normalized back or flash to aurora on cold start.

## [1.1.7] - 2026-05-16

### Fixed

- Restored `scripts/render_homebrew_cask.py`, which the release pipeline depends on, fixing the Homebrew tap update stage that could no longer render the cask.

## [1.1.6] - 2026-05-16

### Added

- Added Kimi CLI update check and upgrade entry, plus Provider template picker, favorites, custom templates, global search, quick switch, config import/export, Profile diff, and change history.

### Changed

- Split main-process IPC and renderer style modules; strengthened external-config change detection and pre-save conflict handling.

### Fixed

- Fixed cross-machine backup restores leaving only the default Profile because the Profile path was not migrated.
- Fixed the tray-icon toggle in the top status bar persisting only the setting without immediately creating or removing the tray icon.
- Fixed Chromium CoreVideo display-link log noise on macOS, the global-search interaction in config lists, and CI failures caused by missing test dependencies in the error-boundary suite.

## [1.1.5] - 2026-05-10

### Fixed

- Fixed iTerm2 launch failures in Homebrew builds caused by reliance on `System Events` keystrokes; switched to native iTerm2 AppleScript writes.

## [1.1.4] - 2026-05-10

### Added

- Persisted sidebar expanded/collapsed state in panel settings; the panel restores the previous sidebar state on next launch.

## [1.1.3] - 2026-05-09

### Fixed

- Fixed a preload crash in packaged builds where `documentElement` could be null during initial theme setup.
- Fixed the cascading `Electron preload API is unavailable` startup error caused by the preload crash above.

## [1.1.2] - 2026-05-09

### Added

- Added an "Open Kimi in Terminal" entry on the active Profile area at the top of Profiles, launching the CLI with the currently active Profile.
- Added a hover terminal entry on each Profile row that generates a temporary config and launches Kimi with that Profile without changing the active state.
- Settings page now exposes a terminal application choice (system Terminal vs. iTerm2).
- README now includes multi-page screenshots and richer feature walkthroughs.

### Changed

- Terminal launches now consistently use `kimi --config-file <path>`, with per-Profile temporary configs written under `~/.kimi/.panel/tmp/terminal/`.
- Terminal.app and iTerm2 now open in a new tab and run via paste + Enter for more reliable command execution.

## [1.1.1] - 2026-05-07

### Added

- Settings page now supports shortcut management: recording, enable/disable, reset, and conflict warnings for both global and window shortcuts.
- Backup snapshots now include `shortcuts.json`, preserving shortcut settings across restores.
- README expanded with sections on shortcuts, Skills, update check, and backup restore.

### Changed

- Continued splitting renderer `App.tsx`: state derivation, config persistence, shortcut binding, backup actions, preview refresh, unsaved-change interception, and tab panels each moved to their own modules.
- Split main-process modules: file access, CLI environment, WebDAV, shortcuts, and update check, simplifying the main entry file.
- Refined update-check dialog states and the GitHub Release fallback flow.

### Fixed

- Fixed update-check dialog copy and version-label issues in certain states.
- Fixed potential regressions in page navigation, config loading, and empty-state boundaries introduced by the module split.

## [1.1.0] - 2026-04-26

### Added

- About page gained a GitHub Release update-check capability, with guidance tailored to Homebrew, manual, or development install sources.
- The About-page version number now shows an update marker once a new version is detected, until the user finishes upgrading.
- The update-check dialog now supports copying the Homebrew upgrade command, jumping to the GitHub Release, and surfacing GitHub rate-limit hints.

### Changed

- Split renderer mega-files: About page, dialogs, code display, overview panel, Skills workspace, top quick controls, common layout, and form widgets all moved to separate modules.
- Hardened external-link opening policy with an explicit `https:` / `mailto:` whitelist.

### Fixed

- Fixed page render failures caused by missing icon imports after the split.
- Fixed `AppState | null` type-boundary issues across save, preview refresh, Skills refresh, and unsaved-change interception flows.
- Fixed the general-settings group rejecting conditionally rendered `null` children.

## [1.0.4] - 2026-04-24

### Added

- Tray menu now offers quick language and theme switching: choose between Chinese / English and Auto / Light / Dark directly from the tray.
- Backup module now supports restoring configurations from either a local directory or a WebDAV remote.

### Changed

- Refined the Skills workspace: adjusted pagination, detail-dialog summary layout, and skill card sizing for a more focused browsing experience.
- Improved Skills frontmatter parsing, broadening compatibility with multi-line descriptions and block scalars.

## [1.0.3] - 2026-04-23

### Changed

- Redesigned Skills as a focused two-column workspace with grid/list toggle, a detail dialog for skills, and adaptive right-pane height.
- Settings page added a UI font-size option, with reading, normalization, and persistence handled end-to-end.
- Simplified Skills scan sources by removing extra-directory and project-directory custom entries; auto discovery is now the single strategy.

### Fixed

- Fixed runtime crashes on multiple pages caused by missing icon imports in the dropdown component.
- Fixed the Skills page content area not filling the remaining viewport height.

## [1.0.2] - 2026-04-22

### Added

- Settings page now lets users view backup records from local directories and WebDAV remotes.
- Backup record list gained a delete action, leaving a unified entry point for the upcoming restore flow.

### Fixed

- Fixed MCP configuration in `config.panel.toml` accumulating `extra.extra` recursion and misplaced `enabled` fields after repeated enable/disable cycles.
- Fixed indentation drift on MCP sub-table headers when writing the panel config, preventing fields like `headers` from leaking out of their section.
- Fixed the MCP import dialog incorrectly treating the default example as "dirty" when the user pressed `Esc`.

### Docs

- Rewrote the README project intro, covering `mcp.json`, backups, status-bar quick actions, and config-viewing capabilities.

## [1.0.1] - 2026-04-21

### Changed

- Polished settings groups, top stat cards, overview list, and custom dropdown styles.
- Strengthened MCP management: JSON import, enable/disable persistence, panel retention, and config-file filtering.
- Refreshed app, tray, and frontend brand logos with the new transparent light/dark assets, and rebuilt the macOS `icon.icns`.
- Homebrew cask render script now warns about macOS quarantine attributes causing startup issues.

## [1.0.0] - 2026-04-20

### Fixed

- Fixed GitHub Actions release workflow failures where `electron-builder` triggered an implicit publish for tag builds and broke the macOS / Windows installer jobs.
- Adjusted GitHub Release authentication and repository lookup in the release workflow to avoid `gh release` depending on local `.git` context.

### Added

- Initial Electron desktop release for managing `kimi-code-cli` configuration.
- Visual editing and management flows for Providers, Models, and Profiles.
- Activating a Profile automatically syncs the default selections back to `config.toml`.
- Preview support for `config.toml`, `config.profiles.toml`, and `config.panel.toml`.
- Pre-save diff for configuration changes.
- Bilingual interface (Chinese and English).
- Status bar / tray integration with direct Profile switching.
- Window opening strategies: remembered display, currently active display, or random display.
- About page links to the repository, issues, and the author.
- Electron Builder installer builds for macOS and Windows.
- GitHub Actions release pipeline triggered by `v*` tags.

### Tests

- Added Vitest coverage for the shared config-store logic.
