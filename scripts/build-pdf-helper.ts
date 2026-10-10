// Builds Blank's PDF helper (src-tauri/pdf/helper, the binary blank-pdf) for
// the target Tauri builds the app for, and puts it where the bundle expects
// it: src-tauri/binaries/blank-pdf-<target triple>[.exe] (git-ignored) for
// bundle.externalBin, which Tauri copies next to the app on macOS and
// Windows, and for Linux targets also src-tauri/binaries/blank-pdf, the
// resource of tauri.linux.conf.json, which the packages install in
// /usr/lib/blank. Tauri runs it before every build and `tauri dev`
// (beforeBuildCommand, beforeDevCommand), and `bun run test:rust` before the
// tests: tauri-build fails any build of the app crate without it.
//
// The helper is always optimized, in debug builds and E2E too: MuPDF built
// for debugging draws pages slowly. macOS builds target macOS 12, as the app
// does (bundle.macOS.minimumSystemVersion). The first build compiles MuPDF
// from the submodule src-tauri/pdf/mupdf-sys/mupdf, a few minutes.
//
// Next to the helper it writes a stamp: a hash of what the build reads (the
// sources of the helper's crates, Cargo.lock, MuPDF's commit, rustc, the
// target). While the stamp says the same, it doesn't build again, so CI can
// restore the helper from its cache (.github/actions/mupdf) and skip MuPDF.
// A MuPDF checkout with changes always builds. `--fingerprint` prints the
// hash, which is the CI cache's key, and builds nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tauri = join(root, "src-tauri");

const fail = (message: string): never => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const mupdf = join(tauri, "pdf", "mupdf-sys", "mupdf");
if (!readdirSync(mupdf).length) {
  fail("MuPDF's sources are missing: git submodule update --init --recursive");
}

const rustc = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
const host = /^host: (.+)$/m.exec(rustc.stdout ?? "")?.[1];
if (!host) fail("rustc -vV says no host triple; is Rust installed?");

// set by the Tauri CLI for the build it runs
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || host!;
const cross = triple !== host;
const exe = triple.includes("windows") ? ".exe" : "";

const linux = triple.includes("linux");
const macosTarget = "12.0";

const git = (args: string[], cwd = root): string | undefined => {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  return run.status === 0 ? run.stdout : undefined;
};

/** a hash of what the build reads, or undefined when it can't say */
const fingerprint = (): string | undefined => {
  const commit = git(["rev-parse", "HEAD"], mupdf);
  const changes = git(["status", "--porcelain"], mupdf);
  // MuPDF changed by hand, or no git: always build
  if (!commit || changes === undefined || changes.trim()) return undefined;
  const sources = git([
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src-tauri/pdf",
    "src-tauri/system-fonts",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "scripts/build-pdf-helper.ts",
  ]);
  if (sources === undefined) return undefined;
  const hash = createHash("sha256");
  hash.update(`${rustc.stdout}\0${triple}\0${macosTarget}\0${commit}\0`);
  for (const name of ["CC", "CFLAGS", "CXX", "CXXFLAGS", "RUSTFLAGS"]) {
    hash.update(`${name}=${process.env[name] ?? ""}\0`);
  }
  const files = [...new Set(sources.split("\0").filter(Boolean))].sort();
  for (const file of files) {
    const path = join(root, file);
    // the submodule itself is its commit, above
    if (path === mupdf) continue;
    hash.update(`${file}\0`);
    hash.update(existsSync(path) ? readFileSync(path) : "(deleted)");
    hash.update("\0");
  }
  return hash.digest("hex");
};

const stamp = fingerprint();
if (process.argv.includes("--fingerprint")) {
  if (!stamp)
    fail(
      "the PDF helper's sources have no fingerprint (no git, or MuPDF changed)",
    );
  console.log(stamp);
  process.exit(0);
}

const binaries = join(tauri, "binaries");
const target = join(binaries, `blank-pdf-${triple}${exe}`);
const stampFile = `${target}.stamp`;
const read = (path: string) =>
  existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;

/** the copies the bundle takes: externalBin's, and Linux's resource */
const install = (from: string) => {
  mkdirSync(binaries, { recursive: true });
  if (from !== target) copyFileSync(from, target);
  if (linux) copyFileSync(target, join(binaries, "blank-pdf"));
};

if (stamp && existsSync(target) && read(stampFile) === stamp) {
  install(target);
  console.log(`The PDF helper ${target} is up to date`);
  process.exit(0);
}

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
    env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: macosTarget },
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
install(built);
if (stamp) writeFileSync(stampFile, `${stamp}\n`);
console.log(`The PDF helper is ${target}`);
