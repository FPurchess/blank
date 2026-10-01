// Builds public/THIRD-PARTY-NOTICES.txt, which ships in dist/ with the app:
// the licences of the Rust crates in the app and in the layout engine's wasm
// (cargo-about, configured in scripts/notices/about.toml), and of the npm
// packages the frontend bundles. MIT, BSD, Unicode-3.0 and others ask for
// their notice in every copy. The fonts' licences are next to them in
// public/fonts/. Run with `make notices` after changing dependencies; CI
// fails when the file is out of date.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const CARGO_ABOUT_VERSION = "0.9.2";

const root = join(import.meta.dir, "..");
const output = join(root, "public", "THIRD-PARTY-NOTICES.txt");

// Blank's own crates, which carry Blank's licence
const OWN_CRATES = new Set(["blank", "blank-layout"]);

// the same order on every machine, unlike localeCompare
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
};

interface AboutLicense {
  id: string;
  name: string;
  text: string;
  used_by: { crate: { name: string; version: string } }[];
}

const crateNotices = () => {
  const version = run("cargo", ["about", "--version"]).trim();
  if (version !== `cargo-about ${CARGO_ABOUT_VERSION}`) {
    throw new Error(
      `${version} isn't cargo-about ${CARGO_ABOUT_VERSION}: cargo install cargo-about --version ${CARGO_ABOUT_VERSION} --locked --features cli`,
    );
  }
  // the crates of every target, so --offline finds all of them
  run("cargo", [
    "fetch",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--locked",
  ]);
  const about = JSON.parse(
    run("cargo", [
      "about",
      "generate",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--config",
      "scripts/notices/about.toml",
      "--frozen",
      "--format",
      "json",
    ]),
  ) as { licenses: AboutLicense[] };
  return about.licenses
    .map((license) => ({
      title: `${license.name} (${license.id})`,
      users: [
        ...new Set(
          license.used_by
            .filter(({ crate }) => !OWN_CRATES.has(crate.name))
            .map(({ crate }) => `${crate.name} ${crate.version}`),
        ),
      ].sort(byCode),
      text: license.text.trim(),
    }))
    .filter((license) => license.users.length)
    .sort((a, b) => byCode(a.users[0], b.users[0]) || byCode(a.text, b.text));
};

interface PackageJson {
  name: string;
  version: string;
  license?: string | { type: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// the folder of package `name` as Node resolves it from `from`: the nearest
// node_modules up from there that has it
const resolvePackage = (name: string, from: string) => {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dir === root || dirname(dir) === dir) return undefined;
  }
};

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;

const packageNotices = () => {
  const found = new Map<string, { dir: string; json: PackageJson }>();
  const visit = (dir: string) => {
    const json = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ) as PackageJson;
    const key = `${json.name} ${json.version}`;
    if (found.has(key)) return;
    found.set(key, { dir, json });
    const dependencies = {
      ...json.dependencies,
      ...json.optionalDependencies,
    };
    for (const name of Object.keys(dependencies)) {
      const child = resolvePackage(name, dir);
      // optional dependencies of other platforms aren't installed
      if (child) visit(child);
    }
  };
  const app = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as PackageJson;
  for (const name of Object.keys(app.dependencies ?? {})) {
    const dir = resolvePackage(name, root);
    if (!dir) throw new Error(`${name} isn't installed: run bun install`);
    visit(dir);
  }
  return [...found.entries()]
    .sort(([a], [b]) => byCode(a, b))
    .map(([key, { dir, json }]) => {
      const license =
        typeof json.license === "string"
          ? json.license
          : (json.license?.type ?? "no licence given");
      const files = readdirSync(dir)
        .filter(
          (file) =>
            LICENSE_FILE.test(file) && statSync(join(dir, file)).isFile(),
        )
        .sort(byCode);
      const texts = files.map((file) =>
        readFileSync(join(dir, file), "utf8").trim(),
      );
      return {
        title: `${key} (${license})`,
        text: texts.length
          ? texts.join("\n\n")
          : "The package has no licence file.",
      };
    });
};

const RULE = "=".repeat(78);
const rule = "-".repeat(78);

const crates = crateNotices();
const packages = packageNotices();
const sections = [
  [
    "Third-party notices",
    "",
    "Blank is licensed under the GNU Affero General Public License v3.0 only",
    "(LICENSE). It includes the software listed below, under the licences",
    "given with it. The fonts' licences are in fonts/*License*.txt next to",
    "this file.",
  ].join("\n"),
  `${RULE}\nRust crates\n${RULE}`,
  ...crates.map(
    ({ title, users, text }) =>
      `${title}\nUsed by: ${users.join(", ")}\n${rule}\n${text}`,
  ),
  `${RULE}\nnpm packages\n${RULE}`,
  ...packages.map(({ title, text }) => `${title}\n${rule}\n${text}`),
];
writeFileSync(output, sections.join("\n\n\n").replace(/\r\n/g, "\n") + "\n");
console.log(
  `Wrote ${output}: ${crates.length} crate licences, ${packages.length} npm packages`,
);
