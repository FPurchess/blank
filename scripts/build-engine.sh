#!/usr/bin/env bash
# Builds the layout engine (src-tauri/layout) for the webview into
# src/engine/wasm/. Needs the wasm32-unknown-unknown target
# (`rustup target add wasm32-unknown-unknown`) and wasm-bindgen-cli in the
# version of the wasm-bindgen crate in src-tauri/Cargo.lock
# (`cargo install wasm-bindgen-cli --version <version> --locked`).
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --manifest-path src-tauri/Cargo.toml -p blank-layout --lib \
  --target wasm32-unknown-unknown --profile wasm
wasm-bindgen --target web --out-dir src/engine/wasm --out-name blank_layout \
  src-tauri/target/wasm32-unknown-unknown/wasm/blank_layout.wasm
if command -v wasm-opt >/dev/null; then
  wasm-opt -O3 src/engine/wasm/blank_layout_bg.wasm -o src/engine/wasm/blank_layout_bg.wasm
fi
ls -l src/engine/wasm/blank_layout_bg.wasm
