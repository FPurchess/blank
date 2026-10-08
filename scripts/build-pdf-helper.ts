// Builds Blank's PDF helper (src-tauri/pdf/helper, the binary blank-pdf) for
// the target Tauri builds the app for, and puts it where
// bundle.externalBin expects it: src-tauri/binaries/blank-pdf-<target
// triple>[.exe] (git-ignored), which Tauri copies next to the app and into
// every package. Tauri runs it before every build and `tauri dev`
// (beforeBuildCommand, beforeDevCommand), and `bun run test:rust` before the
// tests: tauri-build fails any build of the app crate without it.
//
// The helper is always optimized, in debug builds and E2E too: MuPDF built
// for debugging draws pages slowly. macOS builds target macOS 12, as the app
// does (bundle.macOS.minimumSystemVersion). The first build compiles MuPDF
// from the submodule src-tauri/pdf/mupdf-sys/mupdf, a few minutes.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tauri = join(root, "src-tauri");

const fail = (message: string): never => {
  console.error(`error: ${message}`);
  process.exit(1);
};

if (!readdirSync(join(tauri, "pdf", "mupdf-sys", "mupdf")).length) {
  fail("MuPDF's sources are missing: git submodule update --init --recursive");
}

const rustc = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
const host = /^host: (.+)$/m.exec(rustc.stdout ?? "")?.[1];
if (!host) fail("rustc -vV says no host triple; is Rust installed?");

// set by the Tauri CLI for the build it runs
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || host!;
const cross = triple !== host;
const exe = triple.includes("windows") ? ".exe" : "";

const cargo = spawnSync(
  "cargo",
  [
    "build",
    "--release",
    "--manifest-path",
    join(tauri, "Cargo.toml"),
    "-p",
    "blank-pdf",
    "--bin",
    "blank-pdf",
    // the host's builds share target/release with the app's, so MuPDF is
    // built once
    ...(cross ? ["--target", triple] : []),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: "12.0" },
  },
);
if (cargo.status !== 0) fail("building the PDF helper failed");

const built = join(
  process.env.CARGO_TARGET_DIR ?? join(tauri, "target"),
  ...(cross ? [triple] : []),
  "release",
  `blank-pdf${exe}`,
);
if (!existsSync(built)) fail(`${built} wasn't built`);
const binaries = join(tauri, "binaries");
mkdirSync(binaries, { recursive: true });
const target = join(binaries, `blank-pdf-${triple}${exe}`);
copyFileSync(built, target);
console.log(`The PDF helper is ${target}`);
