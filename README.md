
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


## License

[MIT](https://opensource.org/licenses/MIT)
