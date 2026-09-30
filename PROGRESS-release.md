# engine-release progress

- [x] 1. B5: the engine check gates the publish workflow and `make release`
- [x] 2. B5: pin the build tools in `scripts/build-engine.sh`
- [x] 3. B5: the exactness tests fail without poppler on CI
- [x] 4. macOS minimum version
- [ ] 5. skip system fonts whose licence forbids embedding
- [ ] 6. `fallback_fonts` off the main thread
- [ ] 7. system fallback for Common-script characters
- [ ] 8. third-party notices and all font licences ship
- [ ] 9. CI time and caching
- [ ] 10. CLAUDE.md and the rules
- [ ] 11. `.claude/rules/layout-engine.md`, SPIKE.md reduced to the release
- [ ] 12. release notes, README

## Notes for the integrator

- The `engine` check (test.yml) is now the composite action `.github/actions/engine`, which `publish.yml` also runs before building (`needs: engine`). Adding `engine` to the ruleset is the owner's decision.
- `make release` runs `scripts/check-engine-ci.sh` on origin/main. Tested: it fails on dfe99a8 ("hasn't run") and on 157bd00 ("ended with failure"). No commit has a passing `engine` run yet, so the pass path is untested against GitHub.
- Why the `engine` check failed at 157bd00: with the `rust-src` component installed (as locally), rustc names std's files by their path in it, which the old script mapped to `/rust/lib/rustlib/src/rust/library/…`. On CI (minimal profile, no `rust-src`) they stay `/rustc/<commit>/library/…`, so the wasm grew by 83 bytes. `build-engine.sh` now maps the rust-src path to `/rustc/<commit>`. Checked: the default toolchain with rust-src, and a 1.98.1 toolchain without it plus an outside `CARGO_TARGET_DIR`, build byte-identical files, 3138904 bytes like CI's. The committed wasm (3138821 bytes) needs one rebuild at integration.
- Task 3: the exact.rs guard is in `read_words` (approved), which covers both comparisons; `:253` dropped the `None` silently before.
