# engine-release progress

- [x] 1. B5: the engine check gates the publish workflow and `make release`
- [ ] 2. B5: pin the build tools in `scripts/build-engine.sh`
- [ ] 3. B5: the exactness tests fail without poppler on CI
- [ ] 4. macOS minimum version
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
