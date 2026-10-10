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
// sources of the helper's own crates, the crates it depends on as Cargo
// resolves them for the target, the release profile and the patches of the
// workspace, MuPDF's commit, rustc, the C compiler, the target, the Cargo
// configuration and the environment the build takes flags and compilers
// from). A dependency of the app alone doesn't change it. While the stamp
// says the same, it doesn't build again, so CI can restore the helper from
// its cache (.github/actions/mupdf) and skip MuPDF. A MuPDF checkout with
// changes (its own submodules included) always builds. `--fingerprint`
// prints the hash, which is the CI cache's key, and builds nothing.
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
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

/** what a command prints, or undefined when it can't run */
const output = (command: string, args: string[]): string | undefined => {
  const run = spawnSync(command, args, { cwd: tauri, encoding: "utf8" });
  return run.status === 0 ? `${run.stdout}${run.stderr}` : undefined;
};

// the environment cargo, the cc crate, bindgen and mupdf-sys's build read
// compilers and flags from: CC, CC_<triple>, TARGET_CFLAGS, …
const buildEnv =
  /^(?:(?:HOST_|TARGET_)?(?:CC|CXX|AR|CFLAGS|CXXFLAGS|ARFLAGS|LDFLAGS)(?:_.+)?|CRATE_CC_NO_DEFAULTS|RUSTFLAGS|CARGO_ENCODED_RUSTFLAGS|CARGO_BUILD_(?:RUSTFLAGS|TARGET|RUSTC.*)|CARGO_TARGET_.+_(?:RUSTFLAGS|LINKER)|CARGO_PROFILE_RELEASE_.+|RUSTC(?:_WRAPPER|_WORKSPACE_WRAPPER)?|MUPDF_.+|LIBCLANG_PATH|CLANG_PATH|BINDGEN_EXTRA_CLANG_ARGS.*|SDKROOT)$/;

/** the C compiler the cc crate picks for the target, as cc-rs looks it up */
const compiler = (): string => {
  const underscored = triple.replaceAll("-", "_");
  for (const name of [`CC_${triple}`, `CC_${underscored}`, "TARGET_CC", "CC"]) {
    const value = process.env[name];
    if (value) return value.split(" ")[0];
  }
  return triple.includes("msvc") ? "cl" : "cc";
};

/** Cargo's configuration files the build in src-tauri reads */
const cargoConfigs = (): string[] => {
  const dirs = [];
  for (let dir = tauri; ;) {
    dirs.push(join(dir, ".cargo"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dirs.push(process.env.CARGO_HOME ?? join(homedir(), ".cargo"));
  return dirs.flatMap((dir) =>
    ["config", "config.toml"].map((name) => join(dir, name)),
  );
};

/** a hash of what the build reads, or undefined when it can't say */
const fingerprint = (): string | undefined => {
  const commit = git(["rev-parse", "HEAD"], mupdf);
  const changes = git(
    ["status", "--porcelain", "--ignore-submodules=none"],
    mupdf,
  );
  // MuPDF changed by hand, or no git: always build
  if (!commit || changes === undefined || changes.trim()) return undefined;
  // the helper's crates: their sources, without their tests
  const sources = git([
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src-tauri/pdf",
    "src-tauri/system-fonts",
    "scripts/build-pdf-helper.ts",
    ":(exclude)src-tauri/pdf/fixtures",
    ":(exclude,glob)src-tauri/pdf/*/tests/**",
    ":(exclude,glob)src-tauri/system-fonts/tests/**",
  ]);
  if (sources === undefined) return undefined;
  // every crate the helper is built from, with its version (or commit) and
  // features, as Cargo.lock pins them for the target; the rest of the lock
  // file is the app's
  const tree = output("cargo", [
    "tree",
    "--locked",
    "-p",
    "blank-pdf",
    "-e",
    "normal,build",
    "--target",
    triple,
    "--prefix",
    "none",
    "--format",
    "{p} {f}",
  ]);
  if (tree === undefined) return undefined;
  const crates = [
    ...new Set(
      tree
        .split("\n")
        .map((line) => line.replace(/ \(\*\)$/, "").replaceAll(root, "."))
        .filter((line) => line.trim()),
    ),
  ].sort();
  // the manifest's release profile, which builds the helper, and patches
  const manifest = Bun.TOML.parse(
    readFileSync(join(tauri, "Cargo.toml"), "utf8"),
  ) as { profile?: { release?: unknown }; patch?: unknown };

  const hash = createHash("sha256");
  hash.update(`${rustc.stdout}\0${triple}\0${macosTarget}\0${commit}\0`);
  hash.update(`${crates.join("\n")}\0`);
  hash.update(
    `${JSON.stringify([manifest.profile?.release ?? null, manifest.patch ?? null])}\0`,
  );
  const cc = compiler();
  hash.update(`${cc}: ${output(cc, ["--version"]) ?? "(no version)"}\0`);
  hash.update(`clang: ${output("clang", ["--version"]) ?? "(none)"}\0`);
  for (const name of Object.keys(process.env)
    .filter((name) => buildEnv.test(name))
    .sort()) {
    hash.update(`${name}=${process.env[name]}\0`);
  }
  for (const config of cargoConfigs()) {
    if (!existsSync(config)) continue;
    hash.update(`${config}\0`);
    hash.update(readFileSync(config));
    hash.update("\0");
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
    // in src-tauri, so it reads the Cargo configuration the stamp hashed
    cwd: tauri,
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
