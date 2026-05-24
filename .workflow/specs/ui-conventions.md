---
title: "UI Conventions"
readMode: optional
priority: medium
category: ui
---
# UI Conventions

Auto-generated from project analysis. Update manually as patterns evolve.

## Framework
- React 18 (functional components + hooks)
- No router (single-page tab-based navigation)
- Icons: Lucide React

## Styling
- System: Custom CSS properties (tokens.css → components.css → layout.css)
- Theming: `data-theme` attribute on `:root` (dark/light)
- Theme colors: CSS variables `--primary-rgb`, `--primary-2-rgb`, etc.
- No Tailwind, no CSS-in-JS
- Glass panel effect: `.glass-panel` class with backdrop-filter
- Border radius: 20px (cards), 28px (panels), 12px (buttons/inputs)

## Component Patterns
- Single App.tsx orchestrates all state
- TabPanels receives props from App (no context/redux)
- Form components: Field, SelectField, ShortcutRecorderField (in formControls.tsx)
- Layout components: SplitLayout, EmptyState (in layoutComponents.tsx)
- Toast: global via useToast hook + ToastContainer

## File Organization
- Components: `src/renderer/src/*.tsx` (flat, no nested folders except tabs/)
- Styles: `src/renderer/src/*.css` (one per feature domain)
- Hooks: `src/renderer/src/use*.ts`
- Options/constants: `src/renderer/src/appOptions.ts`

## Entries

