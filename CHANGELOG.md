# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project currently follows a simple `major.minor.patch` versioning scheme.

## [0.1.0] - 2026-04-19

### Added

- Initial Electron desktop application for managing `kimi-code-cli` configuration files.
- Editable Provider, Model, and Profile management workflow.
- Profile activation flow that synchronizes active defaults back into `config.toml`.
- Preview support for `config.toml`, `config.profiles.toml`, and `config.panel.toml`.
- Diff preview to inspect configuration changes before saving.
- Chinese and English interface support.
- Tray / menu bar integration with direct Profile switching.
- Window open strategy based on remembered display, active display, or random display.
- About page with repository, issue tracker, and author links.
- Electron Builder packaging for macOS and Windows installers.
- GitHub Actions release pipeline triggered by `v*` tags.

### Testing

- Added Vitest coverage for shared configuration store behavior.
