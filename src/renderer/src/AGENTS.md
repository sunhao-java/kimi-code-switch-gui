# RENDERER GUIDE

## OVERVIEW

React renderer for the Kimi configuration console. It owns UI state, tab composition, i18n, dialogs, CSS theme tokens, and calls the preload bridge for all native work.

## STRUCTURE

```
src/renderer/src/
|-- main.tsx              # React StrictMode bootstrap
|-- App.tsx               # app shell and top-level composition
|-- useAppHandlers.tsx    # central state/action hook
|-- use*Actions.ts        # persistence, backup, safety, preview, shortcuts, mutations
|-- tabs/                 # TabPanels router and AppContext type only
|-- styles.css            # global tokens, themes, layout, controls
`-- assets/               # dark/light logo PNGs
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add tab or nav item | `appOptions.ts`, `tabs/TabPanels.tsx`, `App.tsx` | Keep `TabId`, `TAB_ITEMS`, routing, shortcuts aligned. |
| Add renderer state/action | `useAppHandlers.tsx` plus focused `use*` hook | Avoid pushing more unrelated logic into `App.tsx`. |
| Persist or preview state | `useAppPersistence.ts`, `usePreviewAndSkills.ts` | Native work goes through `getApi()`. |
| Edit provider/model/profile/MCP forms | `tabComponents.tsx`, `tabs/TabPanels.tsx` | Shared transforms live under `@shared/`. |
| i18n copy | `i18n.ts`, `localeText.ts` | `zh-CN` is base; `zh-TW` often derives through `toTraditionalChinese`. |
| Theme/style changes | `styles.css` | Use existing CSS variables and `data-theme` / `data-appearance-theme`. |
| About/version UI | `aboutPage.tsx` | `ABOUT_INFO.version` must match release version. |

## CONVENTIONS

- Renderer uses local React hooks and prop composition; there is no Redux/Zustand store.
- `App.tsx` should stay a composition shell. Put derived data in `appDerivedData.ts`, helpers in `appHelpers.ts`, options in `appOptions.ts`.
- Use `getApi()` for `window.kimiSwitch`; never import Electron or Node APIs in renderer components.
- Tab content is not split per tab directory. `tabs/TabPanels.tsx` routes, while feature components live at the renderer root.
- Keep UI strings in `i18n.ts` or local dictionaries when scoped like About-page text.
- Use shared parsers/transforms from `@shared` for config semantics instead of duplicating renderer-only rules.
- Preserve CSS-token theming: dark/light mode plus `aurora`, `ocean`, `violet`, `sunset` appearance themes.

## ANTI-PATTERNS

- Do not put filesystem, CLI, WebDAV, or Electron logic in renderer files.
- Do not hard-code colors outside the token system unless the surrounding CSS already does.
- Do not update only visible text for new locales; keep all supported `Locale` keys covered.
- Do not add a new tab without checking shortcut actions and primary selection behavior.

## TESTS

- Renderer tests currently focus on pure logic such as `primarySelections.test.ts`.
- Prefer extracting pure selection/derivation logic for tests; component-level testing dependencies exist but are not the dominant pattern.
