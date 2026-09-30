# 3.0.0 release

The page view and its layout engine ship as Blank 3.0.0. The reference is in
`.claude/rules/layout-engine.md`. This file only tracks the release, and the
integrator deletes it before the release PR.

## What's left

- Merge the four streams (see "Parallel sessions") and rebuild the wasm once
  with `make engine`. Run `make notices` if a merge changed `Cargo.lock` or
  `bun.lockb`.
- Fold engine-core's `SEAM.md` into the seam in
  `.claude/rules/layout-engine.md`, then delete `SEAM.md`.
- Check the docs that describe the other streams' code: the `coordsAtPos`
  fallback and `blank.engine` in `editor-boundary.md`, `__TEST_HOOKS__` in
  CLAUDE.md, the pixel reads in `ui-testing.md`, the painter in
  `layout-engine.md`. Point `src/scss/main.scss`'s "see SPIKE.md" at the
  rule file's scrolling notes. Link `THIRD-PARTY-NOTICES.txt` from the docs.
- `make docs-screenshots`, and pin the metainfo screenshots to the new commit.
- `make bump VERSION=3.0.0`, then paste the release notes below into the new
  `<release>` entry of the metainfo.
- Delete `SPIKE.md`, `TASK.md` and the `PROGRESS-*.md` files.

## Decisions for the owner

- **Require `engine` for merging into `main`.** The ruleset "CI must pass on
  main" requires `test`, the three `test-tauri` builds and `e2e`. `engine`
  (the wasm freshness check, the engine's tests and the notices) runs on every
  push and pull request, and `publish.yml` and `make release` require it, but
  a pull request can merge without it.
- **The macOS minimum:** 11.0 (Big Sur), whose Safari 15 WebKit compiles the
  engine's wasm (bulk memory, reference types, …). Older Macs would start
  without the engine and without PDF export.
- **System fonts:** fonts whose licence forbids embedding a subset, or that
  have no outlines, are skipped for the next fallback family. The alternative,
  bundling Noto Sans CJK, costs about 16 MB per weight.
- **Colour emoji:** monochrome Noto Emoji, identical on screen and paper.
  Colour needs a colour font (Noto Color Emoji is 10 MB of bitmaps on Linux)
  and a painter for colour glyphs.

## Manual test checklist

On a release build of each platform (Linux, Windows, macOS 11 and the newest
macOS, Apple Silicon and Intel):

- [ ] The app starts on the pages, in "page ends"; Mod-Alt-V switches to the
      sheets and back, and the view is remembered after a restart.
- [ ] Typing, selecting by dragging, double and triple click, Shift-click,
      ↑/↓ across pages, Home/End and Page Up/Down behave as in 2.x.
- [ ] An input method (e.g. Chinese pinyin, Japanese) composes at the caret,
      with its window next to it.
- [ ] A screen reader (Orca, Narrator, VoiceOver) reads the text and follows
      the caret.
- [ ] Scrolling a 100-page document is smooth in both views, at 1× and 2×.
- [ ] Headers, footers, "Page N of M", new pages before chapters and page
      breaks show where the PDF has them.
- [ ] Mod-Alt-P exports a PDF with the same line and page breaks as the
      screen; links work, and title and author are in its properties.
- [ ] Chinese, Japanese, Korean, emoji and maths letters (𝐀) show on screen
      and in the PDF.
- [ ] Mod+click opens a link.
- [ ] Spell check underlines on the pages, and a right click offers the
      suggestions.
- [ ] Tables: the toolbar and the handles sit on the painted table, and a long
      table repeats its header row on every page.
- [ ] Word export and import work as in 2.x.
- [ ] `THIRD-PARTY-NOTICES.txt` and the four font licences are in the bundle.

## Parallel sessions

From 8efdc17 the review findings are worked on in four worktrees, each with its brief in `TASK.md` (not committed) and its progress in `PROGRESS-<name>.md`:

| Session | Worktree | Branch | Owns | E2E port |
|---|---|---|---|---|
| engine-core | `.claude/worktrees/engine-core` | `engine/core` | `src-tauri/layout/**`, the seam (`SEAM.md`) | 4501 |
| engine-editor | `.claude/worktrees/engine-editor` | `engine/editor` | `src/engine/*.ts`, `src/editor/**` | 4511 |
| engine-ui | `.claude/worktrees/engine-ui` | `engine/ui` | `src/ui/Page*`, the painter, SCSS, `e2e/**`, `docs/guide/**` | 4521 |
| engine-release | `.claude/worktrees/engine-release` | `engine/release` | `.github/**`, build scripts, `src-tauri/src`, notices, `CLAUDE.md`, rules | 4531 |

No branch commits `src/engine/wasm/`: the integrator rebuilds it once per merge. Merge order: core → editor → ui → release, with core's seam commits merged into editor and ui early.
