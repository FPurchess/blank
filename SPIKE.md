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

## Release notes

For the metainfo's `<release version="3.0.0">` (one paragraph, as for 2.x):

> Blank now shows your text as it prints: every line and page ends on the
> screen where it ends in the PDF, with "Page N of M" in the bottom bar, as
> page ends (the new default) or as sheets on a desk (Mod-Alt-V). A new PDF
> engine sets code in IBM Plex Mono, emoji in monochrome Noto Emoji, and
> Chinese, Japanese, Korean and other scripts in the fonts on your computer,
> and splits long table rows across pages. Mod+click opens links. Your
> markdown files and settings stay as they are; Blank now needs macOS 11 or
> newer.

For the GitHub release:

> **Your pages, exactly as they print.** Blank lays out every document with
> its own engine, and the screen shows that layout: each line and each page
> ends where it ends in the PDF.
>
> - **Page ends** is the new default view: one column of text, as wide as on
>   paper, with a mark where each page ends showing its footer and the next
>   page's header. `Mod` `Alt` `V` switches to **Pages**, the sheets on a
>   desk with their headers, footers and numbers. The bottom bar shows
>   "Page N of M".
> - **A new PDF engine** replaces pdfmake. Existing documents export with
>   different line and page breaks than in 2.x, the same ones you now see on
>   the screen.
>   - Code is set in IBM Plex Mono, and emoji in the monochrome Noto Emoji.
>   - Chinese, Japanese, Korean and other scripts Blank's fonts lack, and
>     symbols like 𝐀, use the fonts on your computer, so the same document
>     can lay out differently on another machine.
>   - Table rows longer than a page are split across pages.
> - `Mod`+click opens a link.
> - **Known limits:** no hyphenation or justification yet. Images, lists and
>   quotes inside table cells are laid out as plain text.
> - **Requirements:** macOS 11 (Big Sur) or newer.
> - Your markdown files and your settings are unchanged.

Before pasting, check the split table rows and the known limits against engine-core's table tasks: at 8efdc17 rows never split.

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
