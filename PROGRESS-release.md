# engine-release progress

- [x] 1. B5: the engine check gates the publish workflow and `make release`
- [x] 2. B5: pin the build tools in `scripts/build-engine.sh`
- [x] 3. B5: the exactness tests fail without poppler on CI
- [x] 4. macOS minimum version
- [x] 5. skip system fonts whose licence forbids embedding
- [x] 3b. (from the integrator) the `test` job installs `fonts-noto-cjk`, and exact.test.ts fails on CI without it instead of laying the Chinese out without a font. e2e.yml doesn't need it: pageEngine.e2e.ts only takes a screenshot of the Chinese.
- [x] 6. `fallback_fonts` off the main thread
- [x] 7. system fallback for Common-script characters
- [x] 8. third-party notices and all font licences ship
- [x] 9. CI time and caching
- [x] 10. CLAUDE.md and the rules
- [x] 11. `.claude/rules/layout-engine.md`, SPIKE.md reduced to the release
- [x] 12. release notes, README

## Notes for the integrator

- The `engine` check (test.yml) is now the composite action `.github/actions/engine`, which `publish.yml` also runs before building (`needs: engine`). Adding `engine` to the ruleset is the owner's decision.
- `make release` runs `scripts/check-engine-ci.sh` on origin/main. Tested: it fails on dfe99a8 ("hasn't run") and on 157bd00 ("ended with failure"). No commit has a passing `engine` run yet, so the pass path is untested against GitHub.
- Why the `engine` check failed at 157bd00: with the `rust-src` component installed (as locally), rustc names std's files by their path in it, which the old script mapped to `/rust/lib/rustlib/src/rust/library/…`. On CI (minimal profile, no `rust-src`) they stay `/rustc/<commit>/library/…`, so the wasm grew by 83 bytes. `build-engine.sh` now maps the rust-src path to `/rustc/<commit>`. Checked: the default toolchain with rust-src, and a 1.98.1 toolchain without it plus an outside `CARGO_TARGET_DIR`, build byte-identical files, 3138904 bytes like CI's. The committed wasm (3138821 bytes) needs one rebuild at integration.
- Task 3: the exact.rs guard is in `read_words` (approved), which covers both comparisons; `:253` dropped the `None` silently before.
- Task 7: characters of no script (Zyyy, Zinh, Zzzz; not whitespace, control or private use) are looked up by the families whose regular font maps them: the math family first, then sans-serif, then all by name. On this machine 𝐀 finds DejaVu Math TeX Gyre. Worst case, a character no font has: about 1 s across 1812 families, on the blocking thread, once per character (fallback.ts never asks twice).
- Task 8: `make notices` (`bun run notices`, `scripts/build-notices.ts`) needs cargo-about 0.9.2 (`cargo install cargo-about --version 0.9.2 --locked --features cli`). It writes `public/THIRD-PARTY-NOTICES.txt` (219 crate licence texts for the native targets and wasm32, 98 npm production packages), which `bun run build` copies to `dist/`. The engine check fails when it's out of date, so run `make notices` after any change to Cargo.lock or bun.lockb, including engine-core's. For engine-ui: link the notices from the docs.
- Task 9: the engine check caches with rust-cache and installs wasm-bindgen-cli and cargo-about as prebuilt binaries (taiki-e/install-action), from `.github/actions/engine`. test-on-pr already caches through setup-rust-toolchain. publish-tauri stays uncached, so the installers build from scratch. docs.yml's checkout@v4 is left as it is (out of scope).
- Task 10: these docs describe code that isn't on the base yet: the `coordsAtPos` fallback and `localStorage["blank.engine"] = "off"` in editor-boundary.md (engine-editor), `__TEST_HOOKS__` in CLAUDE.md's E2E section (engine-editor's vite.config.ts), and the pixel reads in ui-testing.md (engine-ui). Check them at integration. `src/scss/main.scss:1284` still says "see SPIKE.md"; that's engine-ui's file, and it should point to `.claude/rules/layout-engine.md` ("Scrolling").

## Done when (checked on aff73a5, after merging spike/page-view-engine at 2c68fa7)

- [x] `bun run lint`, `bun run format:check`, `bun run test` (2235 tests)
- [x] `bun run test:rust` (the workspace), and `CI=1 cargo test -p blank-layout` with poppler
- [x] `make engine` twice: byte-identical, and identical to the committed wasm at 2c68fa7 (not staged)
- [x] actionlint on all workflows
- [x] E2E on port 4531: launch, rendering, pageEngine: 3/3 passed

## Review fixes (after the self-review, from the integrator's list)

Merged spike/page-view-engine at bcf725b (f36f3ba), then one commit each:

- [x] B1: `--strip-producers` in wasm-opt, and `scripts/wasm-producers.ts` fails the build if a producers section is left (57a7412). Both the cargo-installed and the prebuilt wasm-bindgen now give byte-identical files.
- [x] M1 + M2: a script's fallback family counts only if it has the characters and may be embedded; the rest are found by coverage, the families already found first (9c9780b). The CLAUDE.md gotcha is fixed.
- [x] M4: Mod+click isn't presented as new (c898438).
- [x] M5 + M6: the seam on the base's API, the four engine states, and the PDF export loading its own engine (ecdb592). SEAM.md is kept.
- [x] M7: qpdf in the action, and the docs say every PDF check fails on CI without its tool (c0da825). engine-core gates read_text, pdfinfo and qpdf.
- [x] CI and build minors: every engine run of a commit must pass, binaryen 132.0.0, the target dir from cargo metadata (6c0eb6c)
- [x] Fonts minors: an unreadable OS/2 table isn't embeddable; comments on the poison and the held lock (3a1a67d). "Symbols try the families already found" is in 9c9780b. Trimming family names isn't done: the system name is already trimmed ("Mitra"), and the engine reads "Mitra " from the file itself, so the fix belongs in the engine's `Fonts::add` (engine-core), e.g. trimming the names it registers.
- [x] Docs minors (d78e1ad)
- [ ] M8, macOS 12: edited but NOT committed. The commit was blocked by the permission check and waits for the user's go-ahead. The uncommitted files are tauri.conf.json (minimumSystemVersion 12.0), CLAUDE.md, layout-engine.md, SPIKE.md (the notes "Blank 3 needs macOS 12 or newer", the decision, and the checklist with Monterey as the oldest Mac) and docs/guide/install.md.

Final checks (on d78e1ad plus the uncommitted M8 files):
- actionlint clean; fonts tests 17/17; `make notices` gives no diff
- `make engine` twice: byte-identical, `blank_layout_bg.wasm` f5d055ac5e3d34ff7cc55b8e3acb353782522bb9875c2a0c0377f0759d2169dd (3245432 bytes), `blank_layout.js` 6dfa3b01…, no producers section. Not committed.
- A flake in engine-editor's `src/main.test.ts`: twice, under the whole suite in the pre-commit hook, "Vitest caught 1 unhandled error … originated in src/main.test.ts". It passes alone and in a full run by hand; the message wasn't captured.

Next: the user decides on the M8 commit, then report to the integrator.
