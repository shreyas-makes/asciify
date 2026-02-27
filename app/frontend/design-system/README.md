# Asciify Design System

This folder is the source of truth for visual decisions in the app.

## Brand Palette

- `black`: `#000000`
- `porcelain`: `#FFFFFC`
- `khaki-beige`: `#BEB7A4`
- `vivid-tangerine`: `#FF7F11`
- `red`: `#FF1B1C`

## Rules

- Use semantic CSS tokens from `app/frontend/entrypoints/application.css`.
- Use class recipes from `design-system/index.ts` instead of hardcoding style fragments.
- Use `vivid-tangerine` for primary actions and emphasis.
- Use `red` only for destructive and error states.
- Keep surfaces tactile: strong borders and offset shadows.
- Keep body typography in Space Grotesk and monospace output/canvas in JetBrains Mono.

## Component Suggestions

- Page wrappers: `designClasses.page`
- Main cards and shells: `designClasses.panel` / `designClasses.panelStrong`
- Inset utility blocks: `designClasses.inset`
- Buttons:
  - neutral: `designClasses.buttonSoft`
  - primary: `designClasses.buttonStrong`
  - dark-surface neutral: `designClasses.buttonDark`

## Migration Checklist

- No page-level hardcoded brand hex values in `className` strings.
- Shared layout components (header/sidebar/content) use semantic tokens.
- Landing and dashboard use matching surface and action treatments.
