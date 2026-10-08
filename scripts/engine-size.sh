#!/usr/bin/env bash
# Reports what the layout engine's wasm is made of, on stdout: its size at
# each stage of scripts/build-engine.sh (cargo, wasm-bindgen, wasm-opt), the
# code by crate before and after wasm-opt, and twiggy's biggest items,
# dominator tree and generic instantiations. It builds the engine like
# `make engine` does, into the cargo target dir, and leaves src/engine/wasm
# alone. The shipped wasm has no names, so twiggy reads a build of the same
# code with the name section (ENGINE_STAGES in build-engine.sh).
# Needs twiggy TWIGGY_VERSION, its last release: upstream is archived, and no
# other tool gives retained sizes for wasm. N sets the rows of twiggy's tables.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

TWIGGY_VERSION=0.8.0
N="${N:-50}"

command -v twiggy >/dev/null ||
  fail "twiggy is missing: cargo install twiggy --version $TWIGGY_VERSION --locked"
[ "$(twiggy --version)" = "twiggy-opt $TWIGGY_VERSION" ] ||
  fail "$(twiggy --version) isn't twiggy $TWIGGY_VERSION: cargo install twiggy --version $TWIGGY_VERSION --locked"

target=$(cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps |
  bun -e 'console.log(JSON.parse(await Bun.stdin.text()).target_directory)')
[ -n "$target" ] || fail "cargo metadata gave no target directory"
out="$target/engine-size"

ENGINE_OUT_DIR="$out" ENGINE_STAGES=1 bash scripts/build-engine.sh >&2

cargo_wasm="$target/wasm32-unknown-unknown/wasm/blank_layout.wasm"
pre="$out/blank_layout_bg.pre-opt.wasm"
named="$out/blank_layout_bg.named.wasm"
shipped="$out/blank_layout_bg.wasm"
committed=src/engine/wasm/blank_layout_bg.wasm

pinned() { sed -n "s/^$1=//p" scripts/build-engine.sh; }
section() { printf '\n=== %s ===\n\n' "$1"; }

dirty=
[ -z "$(git status --porcelain -- src-tauri)" ] || dirty=" (src-tauri has changes)"
echo "Layout engine wasm at $(git rev-parse --short HEAD)$dirty"
echo "rustc $(pinned RUST_VERSION), $(wasm-bindgen --version), binaryen $(pinned BINARYEN_VERSION), twiggy $TWIGGY_VERSION"

section "Size by stage"
bun scripts/engine-size.ts sizes "cargo=$cargo_wasm" "wasm-bindgen=$pre" \
  "wasm-opt -g=$named" "wasm-opt (shipped)=$shipped" "committed=$committed"
echo
if cmp -s "$shipped" "$committed"; then
  echo "The build is the committed wasm."
else
  change=$(($(wc -c <"$shipped") - $(wc -c <"$committed")))
  echo "The build differs from the committed wasm ($( ((change > 0)) && echo +)$change bytes)."
fi

section "Code by crate"
bun scripts/engine-size.ts crates "$pre" "$named"
echo
echo "Generic code counts to the crate its name starts with (often core or alloc, see the"
echo "instantiations below). Data, such as Unicode tables and fonts, belongs to no function."

section "Top $N items"
twiggy top -n "$N" "$named"

section "Dominator tree (what removing an item would save)"
twiggy dominators -d 3 -r "$N" "$named"

section "Generic instantiations"
twiggy monos -m 10 -n 20 "$named"
