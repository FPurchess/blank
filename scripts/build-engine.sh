#!/usr/bin/env bash
# Builds the layout engine (src-tauri/layout) for the webview into
# src/engine/wasm/. Needs the Rust toolchain in RUST_VERSION with the
# wasm32-unknown-unknown target (`rustup target add wasm32-unknown-unknown`),
# wasm-bindgen-cli in the version of the wasm-bindgen crate in
# src-tauri/Cargo.lock (`cargo install wasm-bindgen-cli --version <version>
# --locked`), and bun for binaryen's wasm-opt.
#
# The build is reproducible: the paths of this machine are mapped to fixed
# ones, so CI can check that the committed wasm is what the sources build
# (see .github/workflows/test.yml).
set -euo pipefail
cd "$(dirname "$0")/.."

# the toolchain the committed wasm was built with; another one builds a
# different wasm
RUST_VERSION=1.98.1
if ! rustc --version | grep -q "^rustc $RUST_VERSION "; then
  echo "warning: building with $(rustc --version), not $RUST_VERSION" >&2
fi

cargo_home="${CARGO_HOME:-$HOME/.cargo}"
sysroot="$(rustc --print sysroot)"
export RUSTFLAGS="--remap-path-prefix=$cargo_home=/cargo --remap-path-prefix=$sysroot=/rust --remap-path-prefix=$(pwd)=/blank"
cargo build --manifest-path src-tauri/Cargo.toml -p blank-layout --lib \
  --target wasm32-unknown-unknown --profile wasm
wasm-bindgen --target web --out-dir src/engine/wasm --out-name blank_layout \
  src-tauri/target/wasm32-unknown-unknown/wasm/blank_layout.wasm
# binaryen's optimizer takes off about a fifth; the npm package has it
# when it isn't installed
WASM_OPT=(wasm-opt)
command -v wasm-opt >/dev/null || WASM_OPT=(bunx --package binaryen@132 wasm-opt)
"${WASM_OPT[@]}" -O3 --enable-bulk-memory --enable-nontrapping-float-to-int \
  --enable-sign-ext --enable-mutable-globals --enable-reference-types \
  --enable-multivalue src/engine/wasm/blank_layout_bg.wasm \
  -o src/engine/wasm/blank_layout_bg.wasm
ls -l src/engine/wasm/blank_layout_bg.wasm
