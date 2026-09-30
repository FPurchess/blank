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
- [ ] 9. CI time and caching
- [ ] 10. CLAUDE.md and the rules
- [ ] 11. `.claude/rules/layout-engine.md`, SPIKE.md reduced to the release
- [ ] 12. release notes, README

## Notes for the integrator

- The `engine` check (test.yml) is now the composite action `.github/actions/engine`, which `publish.yml` also runs before building (`needs: engine`). Adding `engine` to the ruleset is the owner's decision.
- `make release` runs `scripts/check-engine-ci.sh` on origin/main. Tested: it fails on dfe99a8 ("hasn't run") and on 157bd00 ("ended with failure"). No commit has a passing `engine` run yet, so the pass path is untested against GitHub.
- Why the `engine` check failed at 157bd00: with the `rust-src` component installed (as locally), rustc names std's files by their path in it, which the old script mapped to `/rust/lib/rustlib/src/rust/library/…`. On CI (minimal profile, no `rust-src`) they stay `/rustc/<commit>/library/…`, so the wasm grew by 83 bytes. `build-engine.sh` now maps the rust-src path to `/rustc/<commit>`. Checked: the default toolchain with rust-src, and a 1.98.1 toolchain without it plus an outside `CARGO_TARGET_DIR`, build byte-identical files, 3138904 bytes like CI's. The committed wasm (3138821 bytes) needs one rebuild at integration.
- Task 3: the exact.rs guard is in `read_words` (approved), which covers both comparisons; `:253` dropped the `None` silently before.
- Task 7: characters of no script (Zyyy, Zinh, Zzzz; not whitespace, control or private use) are looked up by the families whose regular font maps them: the math family first, then sans-serif, then all by name. On this machine 𝐀 finds DejaVu Math TeX Gyre. Worst case, a character no font has: about 1 s across 1812 families, on the blocking thread, once per character (fallback.ts never asks twice).
- Task 8: `make notices` (`bun run notices`, `scripts/build-notices.ts`) needs cargo-about 0.9.2 (`cargo install cargo-about --version 0.9.2 --locked --features cli`). It writes `public/THIRD-PARTY-NOTICES.txt` (219 crate licence texts for the native targets and wasm32, 98 npm production packages), which `bun run build` copies to `dist/`. The engine check fails when it's out of date, so run `make notices` after any change to Cargo.lock or bun.lockb, including engine-core's. For engine-ui: link the notices from the docs.
