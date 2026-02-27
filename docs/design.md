# Asciify Design System Source of Truth

This document is the canonical reference for Asciify visual design decisions.

## 1. Brand Palette (Authoritative)

- `black`: `#000000`
- `porcelain`: `#FFFFFC`
- `khaki-beige`: `#BEB7A4`
- `vivid-tangerine`: `#FF7F11`
- `red`: `#FF1B1C`

## 2. Semantic Token Rules

All UI styling must flow through semantic tokens defined in `app/frontend/entrypoints/application.css`.

### Core semantic tokens

- `--app-bg`: app page background
- `--app-ink`: primary text color
- `--app-muted`: subdued text color
- `--surface-1`: default panel background
- `--surface-2`: inset / secondary panel background
- `--surface-strong`: dark panel background for canvas-heavy sections
- `--surface-strong-ink`: text on strong surfaces
- `--line`: default border
- `--line-strong`: emphasized border
- `--accent`: primary action color (maps to vivid-tangerine)
- `--danger`: destructive/error color (maps to red)

### Strict token policy

- Do not introduce hardcoded brand hex values in page components.
- Prefer semantic tokens over raw color values in all class names.
- Tailwind/theme variables should map to semantic tokens only.

## 3. Typography Rules

- Primary UI font: `Space Grotesk`
- Monospace content (ASCII/canvas/code): `JetBrains Mono`
- Kicker/eyebrow labels: uppercase + tracking via design class recipe

## 4. Shared Design Classes

Use `designClasses` from `app/frontend/design-system/index.ts`.

- `page`: full-page background + foreground baseline
- `shell`: top-level shell containers
- `panel`: default tactile panel
- `panelStrong`: dark/high-emphasis panel
- `kicker`: tiny uppercase section pre-title
- `sectionTitle`: section heading style
- `muted`: subdued text
- `inset`: nested/inset content block
- `buttonSoft`: neutral secondary button
- `buttonStrong`: primary CTA button
- `buttonDark`: button style on strong/dark surfaces
- `canvasWrap`: outer ASCII canvas surface
- `canvasBoard`: inner scrollable canvas board

## 5. Interaction Color Semantics

- Use `vivid-tangerine` (`--accent`) for primary actions only.
- Use `red` (`--danger`) for destructive/error only.
- Avoid using `red` for non-destructive emphasis.

## 6. Component and Page Alignment Rules

- Landing page and dashboard must use the same panel, border, and action language.
- Authenticated shell surfaces (sidebar/header/content) must use shared design tokens/classes.
- New pages must start from `designClasses.page` and `designClasses.panel` defaults.

## 7. Implementation References

- Global tokens and component-layer classes:
  - `app/frontend/entrypoints/application.css`
- Typed design system exports:
  - `app/frontend/design-system/index.ts`
- Design guidance in component folder:
  - `app/frontend/design-system/README.md`

## 8. Acceptance Checklist for Future UI Changes

- No page-level hardcoded brand hex values in class strings.
- Primary/destructive action colors follow semantics.
- Layout shells and page panels use shared classes.
- Typography choices stay within system defaults.
- Dashboard and canvas surfaces remain visually consistent.
