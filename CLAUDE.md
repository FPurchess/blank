# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Blank is a keyboard-only markdown editor: a Tauri 2 desktop app with a framework-free TypeScript + ProseMirror frontend in `src/`. The app logic lives in the frontend. `src-tauri/` registers the Tauri plugins and holds the spell check engine (`src-tauri/src/spellcheck/`), which loads, checks and downloads the dictionaries.

## Commands

- Use `bun`, not npm or yarn. The lockfile is `bun.lockb`.
- `make` lists the common tasks from the `Makefile`, which wraps the `package.json` scripts: e.g. `make dev`, `make check` (lint, format check and unit tests), `make test-e2e-headless`. Keep the commands in `package.json` and only call them from the `Makefile`.
- `bun run tauri dev` runs the app. `bun run dev` serves only the Vite frontend, and every Tauri API call (fs, dialog, notification, cli) fails in a plain browser.
- `bun run lint` runs eslint and `tsc`, so it is also the type-check.
- `bun run test:rust` builds the frontend and runs the Rust tests (the spell check engine) with `cargo test`, which needs `dist/` since `generate_context!` embeds it.
- `bunx vitest run src/config.test.ts` runs one test file, and `bunx vitest run -t "<name>"` runs one test. Run single tests while iterating.
- Before calling work done, run `bun run lint`, `bun run format:check` and `bun run test`. The husky pre-commit hook runs the same three.
- `bun run test:e2e` builds a debug binary and runs the E2E tests in `e2e/` (WebdriverIO + `tauri-driver`) against the real app. It works on Linux only and needs `webkit2gtk-driver`, `xvfb` and `cargo install tauri-driver --locked`. Run it with `xvfb-run -a` for headless, and set `E2E_SKIP_BUILD=1` to reuse an existing build. Set `E2E_PORT` (default 4444, the native driver takes the next port) when another worktree runs E2E at the same time. Run `bun install` in `e2e/` first, since that folder is its own package with its own `bun.lock`. `bunx wdio run ./wdio.conf.ts --spec specs/<name>.e2e.ts` in `e2e/` runs one spec. Run E2E after changing boot, editing, storage or file handling. The `E2E` workflow runs it on every push and pull request, and `e2e` is a required check for merging into `main`.

## E2E tests

- Every spec file gets a fresh app with a temporary profile: `wdio.conf.ts` sets `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` for `tauri-driver`. Specs start from the welcome document and the default keymap, and never touch the developer's real data. `restartApp()` in `e2e/helpers.ts` relaunches the app within the same profile, optionally with CLI args.
- Type text with `type()` from `e2e/helpers.ts`, never `browser.keys("text")`: WebKitWebDriver drops repeated characters within one key action ("ll" becomes "l"). Use `pressMod()` for `Mod-` shortcuts.
- Name specs `*.e2e.ts`, so vitest doesn't collect them. Native dialogs (open, save as, export) can't be automated, so test file IO by passing a path as a CLI arg, which makes Ctrl+S save without a dialog.

## Architecture

- Start-up order is fixed (`src/main.ts`): `bootConfig` → `bootStorage` → `bootEditor` → `bootUI` → `bootSpellcheck`. The keymap reads config when the plugin is created, and the editor restores its document from storage. `bootSpellcheck` isn't awaited, so a dictionary download never delays the start.
- Modules talk through the Observables in `src/state.ts` (`path`, `importedFrom`, `transaction`, `textContent`, `theme`, `language`, `languagePicker`, `spellcheck`, `spellcheckStatus`, `spellchecker`, `spellcheckMessage`, `contextMenu`), not by importing each other. Every editor transaction goes to `transaction`; `storage.ts` persists values and `ui.ts` renders them by subscribing. Follow the same pattern for new cross-module state.
- The theme is applied as `document.body.dataset.theme`, and the SCSS in `src/scss/themes/` keys off it. A new theme needs an entry in `themes` in `state.ts` and a partial registered in `themes/_index.scss`.
- Markdown uses the stock `prosemirror-markdown` `schema`, `defaultMarkdownParser` and `defaultMarkdownSerializer`. There is no custom schema, so a new node or mark type also needs parser, serializer and PDF-export support.
- The first document comes from the CLI `path` arg, then the doc saved in localforage, then `src/editor/welcome.md`.
- Word documents are imported, never edited: `readDocumentFromFile` (`src/editor/document.ts`) converts a .docx with `importDocx` (`src/importers/docx/`) into an untitled document and sets `importedFrom`. Saving never writes markdown into a .docx (`saveFile.ts`).
- `language` holds an ISO 639-1 code (`de`) or a regional tag of a spell check dictionary (`de-CH`). Autocorrect uses the rules of `baseLanguage(tag)`.
- Spell check: `src/spellcheck/service.ts` loads the dictionary for `language` while `spellcheck` is on and publishes a `Spellchecker` in `spellchecker`. The `spellcheck` plugin (`src/editor/plugins/spellcheck.ts`) tokenizes changed textblocks (`src/spellcheck/tokenize.ts`), asks it in batches and underlines misspellings with decorations. All Rust calls go through `src/spellcheck/ipc.ts`. Personal dictionaries are text files in `<app config>/dictionaries/`, see `userDictionary.ts`.
- The context menu replaces the webview's: `src/editor/plugins/contextMenu.ts` opens it, `src/editor/contextMenu/model.ts` builds the items and runs them, and `src/contextMenu.ts` renders it (ARIA menu, keyboard, submenus). New items go into `buildMenu`.

## Adding things

- **Bindable command:** update all four: the `CommandIdentifier` enum and `defaultConfig.keymap` in `src/config.ts`, `commandMap` in `src/editor/plugins/keymap.ts`, and the reference `blank.json`. Also add it to `docs/guide/shortcuts.md` (and to the short table in the README if it's an essential one).
- **File/IO command** (`src/editor/commands/`): return `true` right away, do the Tauri work in an async block, and report success or failure with `sendNotification`. Follow `saveFile.ts` / `exportAs.ts`.
- **Block shortcut** (a whole line like `#` or `---`): add a `BlockTransformer` (`trigger` `"space"` or `"enter"`, `activate` + `transform`) in `src/editor/plugins/autocomplete/transformers/` and register it in that folder's `index.ts`. The first one that matches and applies wins.
- **Inline correction** (arrows, dashes, formatting, ...): add an `InlineTransformer` (`Context` → `Correction` or `undefined`) in `src/editor/plugins/autocomplete/inline/` and add it to `replacing` in that folder's `index.ts`, where order matters. A plain replacement belongs in the tables in `inline/replacements.ts` instead. Guard it with a toggle from `config.autocorrect` and document it in `docs/guide/autocorrect.md`.
- **Autocorrect language:** add a `LanguageRules` file in `src/editor/plugins/autocomplete/languages/` (quotes from CLDR, abbreviations from LibreOffice's `SentenceExceptList.xml`) and register it in that folder's `index.ts`.
- **Exporter:** write an `exporterFunc` (`(state, { docPath })` → `{ contents, warnings }`) in `src/exporters/` and wire it up through `exportAs`, which shows the warnings. Lay out on the page in `src/exporters/page.ts` and get image bytes from `prepareImages` in `src/images/prepare.ts`.
- **Importer:** convert the file to a ProseMirror doc in `src/importers/` and dispatch on its extension in `readDocumentFromFile`. Imports from Word go through mammoth (docx → HTML), `cleanup.ts` (HTML the markdown schema can hold) and the schema's DOM parser. Style names map in `styleMap.ts`; `bun scripts/build-docx-fixtures.sh` rebuilds the test documents from `__fixtures__/fixture.md`.
- **Dialog** (like the link and image dialogs): put its request in an Observable in `state.ts`, open it from a command and render it from `ui.ts` with the helpers in `src/dialog.ts`. Add it to `dialogOpen` in `src/editor/index.ts`, so the editor leaves it the focus.
- **Image handling** lives in `src/images/`. `codec.ts` is the only code that decodes or re-encodes images (webview decoders and a canvas); tests mock it and coverage skips it.
- **Spell check dictionary:** don't edit `src/spellcheck/catalog.json` or `src-tauri/dictionaries/` by hand. `bun run dictionaries:update` lists the dictionaries of wooorm/dictionaries, pins their version and SHA-256, loads each with the engine (dictionaries it can't load are marked `loads: false`) and copies the built-in ones (`BUNDLED` in the script). A new built-in one also needs an entry in `src-tauri/src/spellcheck/bundled.rs`.

## Website

- **Keep the docs up to date with every change a user can notice**, in the same PR: a new or changed shortcut, correction, setting, theme, file format or behaviour goes into the matching page of `docs/guide/` (and the README only if it changes the first impression). Write them so that Blank is as easy and joyful to use as possible: explain what the user gets and how, not how it's built. Add or refresh screenshots or GIFs where a picture helps, by extending `e2e/shots/docs.shots.ts`. Recordings show every shortcut that is pressed as keycaps in a translucent, rounded overlay at the bottom center (`Recorder.shortcut`).
- `docs/` is the website and user documentation (VitePress), served at https://fpurchess.github.io/blank/. It's its own package with its own `bun.lock`; `make docs-dev` installs it and serves the site, `bun run typecheck` in `docs/` type-checks it. The README stays short and links to it; user-facing reference belongs in `docs/guide/`.
- `.github/workflows/docs.yml` deploys it to the `gh-pages` branch via `docs/deploy.sh`: pushes to `release` rebuild the latest docs at the root and freeze a copy at `v<version>/`, pushes to `main` rebuild `dev/`. `versions.json` at the root feeds the version switcher. Never edit `gh-pages` by hand. GitHub Pages serves the `gh-pages` branch (Settings → Pages). Until the first push to `release` after the website was added, fill the root once by running the `Docs` workflow on `main` with channel `latest` and `bootstrap`.
- The screenshots in `docs/public/screenshots/` are captured from the real app by `e2e/shots/docs.shots.ts`. Regenerate them with `make docs-screenshots` after UI changes and commit the result. Stills are 800×600, the app's default window size; the demo GIF leaves out the empty middle of the page and is 800×400.

## Gotchas

- Do not edit `src/exporters/pdf/pdfmake-vfs.ts` or `src/exporters/pdf/coverage.ts`. `bun run fonts:vfs` generates both from `fonts/*.ttf`. The editor loads the woff2 copies in `public/fonts/`.
- The main font is IBM Plex Sans. "Plex" is a Reserved Font Name, so ship IBM's official files unmodified: no subsetting, format conversion or renaming. DejaVu Sans is the fallback for characters Plex lacks (e.g. ⇒ ⇔ ⇐): the CSS font stack handles it in the editor, and `src/exporters/pdf/fallback.ts` handles it in the PDF.
- Editor typography (`src/scss/_typography.scss`), PDF styles (`src/exporters/pdf/template.ts`) and Word styles (`src/exporters/docx/template.ts`) share one major-third scale. Change them together.
- Dictionaries other than the built-in ones are downloaded at runtime from pinned jsDelivr (then unpkg) URLs and must match the catalog's SHA-256. Debug builds read `BLANK_DICTIONARY_MIRROR` (loopback URLs only), which `e2e/wdio.conf.ts` points at a local server so E2E never needs the CDN. E2E types lowercase only: WebKitWebDriver doesn't type capitals.
- Never narrow `fs:scope` or drop `plugins.fs.requireLiteralLeadingDot: false`: Blank must be able to open and save every file the user can, including hidden folders, other disks and symlinked files. Dialog-granted scope isn't persisted, so CLI-opened and restored files would break.
- The Word export embeds the regular face of IBM Plex Sans from the PDF font files, unmodified: the obfuscation Word applies to embedded fonts is part of the .docx format, and the OFL allows embedding in documents. Its style names (`Quote`, `Code Block`, `Horizontal Line`, `Inline Code`) are what a Word import maps back. `src/exporters/docx/fixups.ts` patches what docx 9.7.2 writes wrong; drop a fix once docx does it itself. `bun scripts/check-docx.ts <file.md>` exports a file and opens the result with pandoc and LibreOffice.
- The editor shows local images through Tauri's asset protocol (`convertFileSrc`, see `src/editor/plugins/images.ts`); its scope in `tauri.conf.json` matches the fs scope. Exports download web images with `@tauri-apps/plugin-http`, since the webview's `fetch` is subject to CORS.
- mammoth's browser build reads `{ arrayBuffer }` and its Node build, which tests use, `{ buffer }`, so `importDocx` passes both. mammoth ignores list level overrides, which `numbering.ts` inlines before the conversion.
- The markdown parser percent-encodes image `src` and only keeps `data:image/(png|jpeg|gif|webp)` URLs, so decode `src` before using it as a path (`resolveLocalPath`).
- Tests run in jsdom. `src/vitest.setup.ts` mocks the Tauri notification, fs, dialog, cli and http plugins for all tests. `mockReset: true` resets every mock to its original implementation before each test, so set per-test return values inside the test or its `beforeEach`. `path` from `@tauri-apps/api` can't be mocked with `vi.mock`; use `mockTauriPath()` from `src/test/tauri.ts` in `beforeEach`.
- Reuse the shared test helpers in `src/test/`: node builders, `createState`, `createTestView` (a stub view, since a real `EditorView` can't scroll in jsdom), `pressKey`, `flushPromises`, `mockCliArgs`, and tiny real images in `src/test/images.ts`.
- `bun run test:coverage` fails below 80% statements, branches, functions or lines.
- Linux Tauri builds in `publish.yml` and `test-on-pr.yml` are pinned to `ubuntu-22.04` so the binary runs on glibc 2.35+ (Debian 12, Ubuntu 22.04), and a CI step fails if it needs anything newer. Do not switch them to `ubuntu-latest`. GitHub removes the `ubuntu-22.04` runner on 2027-04-17, so move these jobs into a container before then.

## Git workflow

- Always work in a git worktree, never directly in the main checkout: `git worktree add .claude/worktrees/<topic> -b <branch> origin/main`, run from the main checkout. Worktrees always live in `.claude/worktrees/` (git-ignored), never as sibling directories. Run `bun install` in the new worktree, since `node_modules` isn't shared.
- Commit messages are a single line (`<type>: <summary>`, e.g. `fix: ...`, `chore: ...`), with no body.
- Never mention Claude, Claude Code or Anthropic in commit messages, PR titles or descriptions, code or comments. That means no `Co-Authored-By` trailers and no "Generated with" footers.
- PRs target `main`. Pushing to `release` triggers `publish.yml`, which builds the installers and creates a draft GitHub release.
- The ruleset "CI must pass on main" requires `test`, the three `test-tauri` builds and `e2e` before a PR can merge. `gh pr merge --auto --squash <number>` merges once they pass, and GitHub then deletes the branch. Enable auto-merge only when the user asked to merge.
- To release: `make bump VERSION=<x.y.z|patch|minor|major>` updates the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and the README download links. Commit that as `chore: bump version to <x.y.z>` and merge it via PR. Then `make release` checks `origin/main` (consistent, untagged version, fast-forward) and after confirmation pushes it to `release`. Publish the draft release on GitHub once all builds are done. Never push to `release` without the user asking.
