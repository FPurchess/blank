#!/usr/bin/env bash
# Reports what the layout engine's wasm is made of, on stdout: a summary, the
# size at each stage of scripts/build-engine.sh (cargo, wasm-bindgen,
# wasm-opt), what each export and crate costs and why each crate is in, the
# biggest items, the generic code, and commands to dig deeper. It builds the
# engine like `make engine` does, into the cargo target dir, and leaves
# src/engine/wasm alone. The shipped wasm has no names, so twiggy reads a
# build of the same code with the name section (ENGINE_STAGES in
# build-engine.sh). The tables come from scripts/engine-size.ts.
# Needs twiggy TWIGGY_VERSION, its last release: upstream is archived, and no
# other tool gives retained sizes for wasm.
# FORMAT=json prints the report as JSON, N sets the rows of the item table,
# NO_BUILD=1 reports on the last build.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

TWIGGY_VERSION=0.8.0

command -v twiggy >/dev/null ||
  fail "twiggy is missing: cargo install twiggy --version $TWIGGY_VERSION --locked"
[ "$(twiggy --version)" = "twiggy-opt $TWIGGY_VERSION" ] ||
  fail "$(twiggy --version) isn't twiggy $TWIGGY_VERSION: cargo install twiggy --version $TWIGGY_VERSION --locked"

target=$(cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps |
  bun -e 'console.log(JSON.parse(await Bun.stdin.text()).target_directory)')
[ -n "$target" ] || fail "cargo metadata gave no target directory"
out="$target/engine-size"

if [ -n "${NO_BUILD:-}" ]; then
  [ -f "$out/blank_layout_bg.named.wasm" ] || fail "no earlier build in $out, run without NO_BUILD"
else
  ENGINE_OUT_DIR="$out" ENGINE_STAGES=1 bash scripts/build-engine.sh >&2
fi

bun scripts/engine-size.ts "$out" "$target/wasm32-unknown-unknown/wasm/blank_layout.wasm"
