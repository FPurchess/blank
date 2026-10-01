#!/usr/bin/env bash
# Builds the layout engine (src-tauri/layout) for the webview into
# src/engine/wasm/. The build is reproducible, so CI can check that the
# committed wasm is what the sources build (.github/actions/engine). That
# needs the same tools everywhere, which this script checks before it builds:
# - Rust RUST_VERSION with the wasm32-unknown-unknown target
#   (`rustup toolchain install 1.98.1 --target wasm32-unknown-unknown`).
#   When the default toolchain is another one, the script picks an
#   installed RUST_VERSION through RUSTUP_TOOLCHAIN. There's no rust-toolchain.toml: rustup reads it from the
#   working directory up, not from --manifest-path, so one in
#   src-tauri/layout does nothing and one above it would pin the app too.
# - wasm-bindgen-cli in the version of the wasm-bindgen crate in
#   src-tauri/Cargo.lock (`cargo install wasm-bindgen-cli --version <version>
#   --locked`)
# - bun, which runs binaryen's wasm-opt in BINARYEN_VERSION
# ALLOW_OTHER_TOOLCHAIN=1 builds with another rustc, into a wasm that won't
# match. The paths of this machine are mapped to fixed ones.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

RUST_VERSION=1.98.1
BINARYEN_VERSION=132.0.0

is_pinned() { rustc --version 2>/dev/null | grep -q "^rustc $RUST_VERSION "; }
if [ -z "${ALLOW_OTHER_TOOLCHAIN:-}" ]; then
  if ! is_pinned && command -v rustup >/dev/null &&
    rustup toolchain list | grep -q "^$RUST_VERSION-"; then
    export RUSTUP_TOOLCHAIN="$RUST_VERSION"
  fi
  is_pinned ||
    fail "the engine is built with rustc $RUST_VERSION, not $(rustc --version 2>&1 | head -n 1):" \
      "rustup toolchain install $RUST_VERSION --target wasm32-unknown-unknown" \
      "(or ALLOW_OTHER_TOOLCHAIN=1 for a wasm that won't match the committed one)"
fi
[ -d "$(rustc --print sysroot)/lib/rustlib/wasm32-unknown-unknown" ] ||
  fail "$(rustc --version) has no wasm32-unknown-unknown target: rustup target add wasm32-unknown-unknown"

bindgen=$(awk '$0 == "name = \"wasm-bindgen\"" { getline; gsub(/"/, "", $3); print $3; exit }' src-tauri/Cargo.lock)
[ -n "$bindgen" ] || fail "no wasm-bindgen crate in src-tauri/Cargo.lock"
command -v wasm-bindgen >/dev/null ||
  fail "wasm-bindgen is missing: cargo install wasm-bindgen-cli --version $bindgen --locked"
[ "$(wasm-bindgen --version)" = "wasm-bindgen $bindgen" ] ||
  fail "$(wasm-bindgen --version) doesn't match the wasm-bindgen crate $bindgen in src-tauri/Cargo.lock:" \
    "cargo install wasm-bindgen-cli --version $bindgen --locked"
command -v bun >/dev/null || fail "bun is missing, it runs binaryen's wasm-opt"

root=$(pwd)
# where cargo builds, as it resolves CARGO_TARGET_DIR and a target-dir in
# a cargo config
target=$(cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps |
  bun -e 'console.log(JSON.parse(await Bun.stdin.text()).target_directory)')
[ -n "$target" ] || fail "cargo metadata gave no target directory"
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
sysroot="$(rustc --print sysroot)"
commit="$(rustc -vV | sed -n 's/^commit-hash: //p')"
remap=(
  "$cargo_home=/cargo"
  "$sysroot=/rust"
  "$root=/blank"
  # a target dir elsewhere gets the path of the default one
  "$target=/blank/src-tauri/target"
  # with the rust-src component, rustc names the files of std by their path
  # in it rather than /rustc/<commit>, as without it (e.g. on CI)
  "$sysroot/lib/rustlib/src/rust=/rustc/$commit"
)
# the last prefix that matches wins
RUSTFLAGS=""
for map in "${remap[@]}"; do RUSTFLAGS+="--remap-path-prefix=$map "; done
export RUSTFLAGS="${RUSTFLAGS% }"

cargo build --manifest-path src-tauri/Cargo.toml -p blank-layout --lib \
  --target wasm32-unknown-unknown --profile wasm
wasm-bindgen --target web --out-dir src/engine/wasm --out-name blank_layout \
  "$target/wasm32-unknown-unknown/wasm/blank_layout.wasm"
# binaryen's optimizer takes off about a fifth. It also drops the producers
# section, where wasm-bindgen writes its version and, when prebuilt as on CI,
# its git commit, which would make the file differ by how it was installed
bunx --package "binaryen@$BINARYEN_VERSION" wasm-opt -O3 --enable-bulk-memory \
  --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals \
  --enable-reference-types --enable-multivalue --strip-producers \
  src/engine/wasm/blank_layout_bg.wasm -o src/engine/wasm/blank_layout_bg.wasm
bun scripts/wasm-producers.ts src/engine/wasm/blank_layout_bg.wasm
ls -l src/engine/wasm/blank_layout_bg.wasm
