# Development and release tasks. The commands themselves live in package.json,
# this is a thin wrapper to find them. Run `make` to list all targets.

.DEFAULT_GOAL := help

.PHONY: help install install-e2e dev dev-web build build-debug lint lint-fix \
	format format-check test test-coverage test-e2e test-e2e-headless check clean \
	install-docs docs-dev docs-build docs-screenshots bump release

help: ## List all targets
	@grep -E '^([a-zA-Z0-9_-]+:.*|)## ' $(MAKEFILE_LIST) | \
		awk -F':.*## ' '/^## / { printf "\n%s\n", substr($$0, 4); next } { printf "  %-18s %s\n", $$1, $$2 }'

## Setup

install: ## Install the app dependencies
	bun install

install-e2e: ## Install the e2e test dependencies
	cd e2e && bun install

## Development

dev: ## Run the app with hot reload
	bun run tauri dev

dev-web: ## Serve only the frontend (Tauri APIs fail in the browser)
	bun run dev

build: ## Build the installers for the current platform
	bun run tauri build

build-debug: ## Build the debug binary without installers, as used by the e2e tests
	bun run tauri build --debug --no-bundle

clean: ## Remove build output and coverage, incl. the Rust target dir (full rebuild)
	rm -rf dist coverage e2e/screenshots
	cargo clean --manifest-path src-tauri/Cargo.toml

## Quality

lint: ## Run eslint and the type-check
	bun run lint

lint-fix: ## Run eslint with autofix and the type-check
	bun run lint:fix

format: ## Format all files
	bun run format

format-check: ## Check the formatting of all files
	bun run format:check

test: ## Run the unit tests
	bun run test

test-coverage: ## Run the unit tests with coverage (fails below 80%)
	bun run test:coverage

test-e2e: install-e2e ## Build the debug app and run the e2e tests (Linux only)
	bun run test:e2e

test-e2e-headless: install-e2e ## Same as test-e2e, in a virtual display (xvfb)
	xvfb-run -a bun run test:e2e

check: lint format-check test ## Run the checks of the pre-commit hook

## Docs

install-docs: ## Install the dependencies of the website
	cd docs && bun install

docs-dev: install-docs ## Serve the website with hot reload
	bun run docs:dev

docs-build: install-docs ## Build the website into docs/.vitepress/dist
	bun run docs:build

docs-screenshots: install-e2e ## Build the debug app and capture the website's screenshots (Linux only)
	xvfb-run -a bun run docs:screenshots

## Release

bump: ## Bump the version in all files: make bump VERSION=<x.y.z|patch|minor|major>
	@set -e; \
	fail() { echo "error: $$*" >&2; exit 1; }; \
	case "$(VERSION)" in \
		patch|minor|major) ;; \
		*) echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || \
			fail "usage: make bump VERSION=<x.y.z|patch|minor|major>" ;; \
	esac; \
	git diff --quiet && git diff --cached --quiet || fail "commit or stash your changes first"; \
	old=$$(bun pm pkg get version | tr -d '"'); \
	bun pm version "$(VERSION)" --no-git-tag-version > /dev/null; \
	new=$$(bun pm pkg get version | tr -d '"'); \
	export OLD="$$old" NEW="$$new"; \
	perl -pi -e '!$$done && s/^(\s*"version":\s*)"\Q$$ENV{OLD}\E"/$$1"$$ENV{NEW}"/ && ($$done = 1)' src-tauri/tauri.conf.json; \
	perl -pi -e '!$$done && s/^version = "\Q$$ENV{OLD}\E"/version = "$$ENV{NEW}"/ && ($$done = 1)' src-tauri/Cargo.toml; \
	perl -pi -e 's|releases/download/v\Q$$ENV{OLD}\E/blank_\Q$$ENV{OLD}\E_|releases/download/v$$ENV{NEW}/blank_$$ENV{NEW}_|g' README.md; \
	perl -pi -e 's|releases/download/v\Q$$ENV{OLD}\E/blank-\Q$$ENV{OLD}\E-|releases/download/v$$ENV{NEW}/blank-$$ENV{NEW}-|g' README.md; \
	cargo update --quiet --workspace --manifest-path src-tauri/Cargo.toml; \
	grep -q "\"version\": \"$$new\"" src-tauri/tauri.conf.json || fail "failed to update src-tauri/tauri.conf.json"; \
	grep -q "^version = \"$$new\"" src-tauri/Cargo.toml || fail "failed to update src-tauri/Cargo.toml"; \
	grep -A1 '^name = "blank"$$' src-tauri/Cargo.lock | grep -q "^version = \"$$new\"" || fail "failed to update src-tauri/Cargo.lock"; \
	grep -q "releases/download/v$$new/blank_$${new}_" README.md || fail "failed to update the download links in README.md"; \
	! grep -q "releases/download/v$$old/" README.md || fail "README.md still links to v$$old"; \
	echo "Bumped the version from $$old to $$new:"; \
	git diff --stat; \
	echo; \
	echo "Next: commit it as \"chore: bump version to $$new\", open a PR, merge it and run make release."

release: ## Publish origin/main by pushing it to the release branch (DRY_RUN=1 only prints)
	@set -e; \
	fail() { echo "error: $$*" >&2; exit 1; }; \
	version_of() { git show "origin/main:$$1" | perl -ne "if (/$$2/) { print \$$1; exit }"; }; \
	git fetch --quiet origin; \
	v=$$(version_of package.json '^\s*"version":\s*"([^"]+)"'); \
	tauri=$$(version_of src-tauri/tauri.conf.json '^\s*"version":\s*"([^"]+)"'); \
	cargo=$$(version_of src-tauri/Cargo.toml '^version = "([^"]+)"'); \
	[ -n "$$v" ] || fail "no version found in package.json on origin/main"; \
	[ "$$v" = "$$tauri" ] && [ "$$v" = "$$cargo" ] || \
		fail "versions on origin/main differ: package.json $$v, tauri.conf.json $$tauri, Cargo.toml $$cargo"; \
	git show origin/main:README.md | grep -q "releases/download/v$$v/blank_$${v}_" || \
		fail "the download links in README.md on origin/main don't point to v$$v"; \
	tag=$$(git ls-remote --tags origin "refs/tags/v$$v"); \
	[ -z "$$tag" ] || fail "v$$v is already released, run make bump first"; \
	[ "$$(git rev-parse origin/main)" != "$$(git rev-parse origin/release)" ] || \
		fail "nothing to release, release is already at origin/main"; \
	git merge-base --is-ancestor origin/release origin/main || \
		fail "origin/release is not an ancestor of origin/main"; \
	echo "Releasing v$$v at $$(git log -1 --format='%h %s' origin/main)"; \
	echo "Changes since the last release:"; \
	git log --oneline origin/release..origin/main; \
	echo; \
	if [ -n "$(DRY_RUN)" ]; then echo "DRY_RUN: git push origin origin/main:refs/heads/release"; exit 0; fi; \
	printf 'Push origin/main to release and trigger the publish workflow? [y/N] '; \
	read -r answer || answer=; \
	[ "$$answer" = y ] || fail "aborted"; \
	git push origin origin/main:refs/heads/release; \
	echo "The publish workflow is building v$$v: https://github.com/FPurchess/blank/actions/workflows/publish.yml"; \
	echo "It creates a draft release. Publish it once all builds are done: https://github.com/FPurchess/blank/releases"
