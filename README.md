
<img width="1536" height="1024" alt="Github Banner Creation" src="https://github.com/user-attachments/assets/b33ba7dc-782f-469e-86ba-b49bcd5f3967" />

# Asciify

Design flows like code.

Asciify is an ASCII-first diagram studio for builders who think in systems.  
Instead of polished pixels that go stale, you sketch with primitives, share instantly, and export clean Markdown that your team can actually version, diff, review, and ship.

If this clicks for you, please star the repo to help more teams discover ASCII-native product design.

## Why this exists

Most wireframes die in screenshots.

Asciify keeps ideas alive as text:
- Fast enough for ideation
- Structured enough for engineering handoff
- Lightweight enough for docs, PRs, RFCs, and tickets

The result is less design drift between product thinking and implementation.

## What you can do

- Build UI and flow diagrams with ASCII primitives (cards, modals, inputs, nav, arrows, decisions, notes, and more)
- Move from canvas to Markdown in one click
- Autosave as guest, then claim your draft after sign-in
- Share drafts with `view` or `edit` permissions
- Keep deterministic output so diffs stay clean and predictable

## Examples of what Asciify makes possible

1. Sketch a feature flow directly in an RFC:
```text
+------------------+      +------------------+      +------------------+
|   LANDING PAGE   |----->|   SIGN-IN FORM   |----->|   USER DASHBOARD |
+------------------+      +------------------+      +------------------+
```

2. Define a decision path before writing code:
```text
         /------------\
        / Is user new? \
        \              /
         \------------/
            |      |
          yes      no
            v      v
      +-----------+  +----------------+
      | Onboarding|  | Existing Home  |
      +-----------+  +----------------+
```

3. Keep planning artifacts in git with markdown export:
````md
# Asciify Draft

```text
<your rendered diagram here>
```
````

## Built for product + engineering teams

- PMs: shape requirements without heavyweight design tooling
- Designers: communicate structure and intent early
- Engineers: ship from concrete, reviewable specs
- Founders: go from idea to shareable system map in minutes

## Tech stack

- Ruby on Rails backend
- React + TypeScript frontend (Inertia.js)
- Vite build tooling
- shadcn/ui components
- Draft persistence with optimistic versioning and conflict detection

## Quick start

```bash
bin/setup
```

Then open: `http://localhost:3000`

`bin/setup` installs gems, installs npm packages, prepares the database, and boots the dev servers.

## Dev commands

- `bin/dev` - run Rails + Vite
- `npm run test:ascii` - run renderer behavior checks
- `npm run lint` - run frontend lint checks
- `npm run check` - run TypeScript checks

## Sharing model

- Guests can create and autosave drafts using a secure guest token
- Signed-in users can claim guest drafts
- Shared links support `view` (read-only) and `edit` (collaborative editing) permissions

## Deployment

This app includes Kamal configuration (`config/deploy.yml`) for containerized deployment.

## License

[MIT](https://opensource.org/licenses/MIT)
