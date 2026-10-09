// Builds public/THIRD-PARTY-NOTICES.txt, which ships in dist/ with the app:
// the licences of the Rust crates in the app and in the layout engine's wasm
// (cargo-about, configured in scripts/notices/about.toml), of the npm
// packages the frontend bundles, of the fonts and of the built-in spell check
// dictionaries. MIT, BSD, Unicode-3.0 and others ask for their notice in
// every copy. It also copies the fonts' licences from fonts/ to public/fonts/,
// which ships next to the fonts.
//
// Crates and npm packages must have a licence in `accepted` of about.toml.
// scripts/notices/npm.toml clarifies npm packages whose package.json or
// licence files don't say it plainly, leaves out those that never reach the
// bundle, and lists the packages pre-built ones have inside. Run with
// `make notices` after changing dependencies, fonts or dictionaries; CI fails
// when the output is out of date.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import satisfies from "spdx-satisfies";

const CARGO_ABOUT_VERSION = "0.9.2";

const root = join(import.meta.dir, "..");
const output = join(root, "public", "THIRD-PARTY-NOTICES.txt");
const notices = join(root, "scripts", "notices");
const vendoredRoot = join(notices, "vendored");

// Blank's own crates, which carry Blank's licence
const OWN_CRATES = new Set(["blank", "blank-layout"]);

// the same order on every machine, unlike localeCompare
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const readJson = <T>(path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readToml = <T>(path: string) =>
  Bun.TOML.parse(readFileSync(path, "utf8")) as T;

// the licences Blank accepts, for crates and npm packages alike
const { accepted } = readToml<{ accepted: string[] }>(
  join(notices, "about.toml"),
);

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
      // the layout engine too, a member of the workspace, not a dependency
      // of the app: without it the wasm's crates were left out
      "--workspace",
      "--config",
      "scripts/notices/about.toml",
      "--frozen",
      // a crate without a licence is an error, not left out
      "--fail",
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

interface Clarification {
  // the licence, as an SPDX expression
  license?: string;
  // the file whose first section on a licence has the licence's text, read
  // instead of the licence files
  "text-from"?: string;
  // why the package is left out: none of its code reaches the bundle
  ignore?: string;
  // the packages a pre-built package has inside, as name@version
  inlines?: string[];
}

// the packages whose helpers the build adds to the bundle though the
// frontend doesn't import them: Vite's preload helpers, Rolldown's runtime
// and plugin-vue's export helper
const BUILD_HELPERS = ["vite", "rolldown", "@vitejs/plugin-vue"];

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
const SCRIPT_FILE = /\.[cm]?js$/;

// Rolldown starts the code of each module it bundles with `//#region <id>`,
// so a package built with it shows what it has inside: modules of
// node_modules/<name>/, and helpers like \0rolldown/runtime.js or
// \0@oxc-project+runtime@0.133.0/
const REGION =
  /^\/\/#region (?:\\0(@[^/+]+\+[^/@]+|[^/@][^/]*)(?:@[^/]*)?|.*node_modules\/(@[^/]+\/[^/]+|[^/]+))\//gm;

/**
 * inlinedPackages returns the names of the packages whose code is inside the
 * scripts of the package in `dir`, if Rolldown built them
 */
const inlinedPackages = (dir: string) => {
  const names = new Set<string>();
  const visit = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") visit(path);
      } else if (SCRIPT_FILE.test(entry.name)) {
        const code = readFileSync(path, "utf8");
        for (const [, helper, module] of code.matchAll(REGION)) {
          names.add(helper ? helper.replace("+", "/") : module);
        }
      }
    }
  };
  visit(dir);
  return names;
};

/**
 * licenseSection returns the first section of the markdown `text` whose
 * heading names a licence, up to the next heading of the same or a higher
 * level
 */
const licenseSection = (text: string) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#+\s.*\blicen[cs]e\b/i.test(line));
  if (start === -1) return undefined;
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex(
    (line, i) =>
      i > start && (line.match(/^#+(?=\s)/)?.[0].length ?? Infinity) <= level,
  );
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
};

// the vendored licences, as name@version
const vendoredEntries = () =>
  readdirSync(vendoredRoot).flatMap((name) =>
    name.startsWith("@")
      ? readdirSync(join(vendoredRoot, name)).map((sub) => `${name}/${sub}`)
      : [name],
  );

const packageNotices = () => {
  const clarifications = readToml<Record<string, Clarification>>(
    join(notices, "npm.toml"),
  );
  const used = new Set<string>();
  const clarificationOf = (json: PackageJson) => {
    // for this version, or for every version
    const key = [`${json.name}@${json.version}`, json.name].find(
      (name) => clarifications[name],
    );
    if (key) used.add(key);
    return key ? clarifications[key] : undefined;
  };

  // every package the frontend depends on, not only those the bundle
  // imports: pre-built packages like jszip and localforage have their
  // dependencies inside
  const found = new Map<string, { dir: string; json: PackageJson }>();
  const add = (dir: string) => {
    const json = readJson<PackageJson>(join(dir, "package.json"));
    const key = `${json.name}@${json.version}`;
    if (found.has(key)) return undefined;
    found.set(key, { dir, json });
    return json;
  };
  const visit = (dir: string) => {
    const json = add(dir);
    if (!json || clarificationOf(json)?.ignore) return;
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
  const app = readJson<PackageJson>(join(root, "package.json"));
  for (const name of Object.keys(app.dependencies ?? {})) {
    const dir = resolvePackage(name, root);
    if (!dir) throw new Error(`${name} isn't installed: run bun install`);
    visit(dir);
  }
  const vite = resolvePackage("vite", root) ?? root;
  for (const name of BUILD_HELPERS) {
    // Rolldown comes with Vite
    const dir = resolvePackage(name, root) ?? resolvePackage(name, vite);
    if (!dir) throw new Error(`${name} isn't installed: run bun install`);
    add(dir);
  }

  const problems: string[] = [];

  // what pre-built packages have inside: packages Blank installs are
  // listed anyway, in the version it installs, and the licences of the others
  // are in vendored/<name>@<version>/. The build helpers are left out, since
  // only their helpers reach the bundle, not what their own build has inside.
  const installed = new Set([...found.values()].map(({ json }) => json.name));
  const vendored = new Set<string>();
  for (const [key, { dir, json }] of [...found]) {
    const clarification = clarificationOf(json);
    if (clarification?.ignore || BUILD_HELPERS.includes(json.name)) continue;
    const inside = inlinedPackages(dir);
    const listed = clarification?.inlines ?? [];
    const names = new Set(
      listed.map((entry) => entry.slice(0, entry.lastIndexOf("@"))),
    );
    const missing = [...inside].filter(
      (name) => !names.has(name) && !installed.has(name),
    );
    const extra = [...names].filter((name) => !inside.has(name));
    if (missing.length) {
      problems.push(
        `${key} has ${missing.sort(byCode).join(", ")} inside, which Blank doesn't install: list them in its inlines in scripts/notices/npm.toml, in the versions it was built with`,
      );
    }
    if (extra.length) {
      problems.push(
        `scripts/notices/npm.toml says ${key} has ${extra.join(", ")} inside, which it hasn't`,
      );
    }
    for (const entry of listed) {
      if (found.has(entry)) continue;
      const vendoredDir = join(vendoredRoot, entry);
      if (!existsSync(join(vendoredDir, "package.json"))) {
        problems.push(
          `${key} has ${entry} inside, which isn't installed: put its package.json and licence files into ${relative(root, vendoredDir)}/`,
        );
        continue;
      }
      vendored.add(entry);
      add(vendoredDir);
    }
  }
  for (const entry of vendoredEntries()) {
    if (!vendored.has(entry)) {
      problems.push(
        `scripts/notices/vendored/${entry} is of no package listed in inlines: remove it`,
      );
    }
  }

  const packages = [...found.values()].flatMap(({ dir, json }) => {
    const key = `${json.name}@${json.version}`;
    const clarification = clarificationOf(json);
    if (clarification?.ignore) return [];
    const license =
      clarification?.license ??
      (typeof json.license === "string" ? json.license : json.license?.type);
    let allowed = false;
    try {
      allowed = license !== undefined && satisfies(license, accepted);
    } catch {
      // not an SPDX expression
    }
    if (!allowed) {
      problems.push(
        `${key} is licensed under ${license ?? "nothing it names"}, which isn't accepted: accept it in scripts/notices/about.toml, or clarify it in scripts/notices/npm.toml`,
      );
    }
    const from = clarification?.["text-from"];
    const section =
      from && licenseSection(readFileSync(join(dir, from), "utf8"));
    if (from && !section) {
      problems.push(`${key}'s ${from} has no section on its licence`);
    }
    const texts = section
      ? [section]
      : readdirSync(dir)
          .filter(
            (file) =>
              LICENSE_FILE.test(file) && statSync(join(dir, file)).isFile(),
          )
          .sort(byCode)
          .map((file) => readFileSync(join(dir, file), "utf8").trim());
    if (!texts.length) {
      problems.push(
        `${key} has no licence file: name the file with its licence as text-from in scripts/notices/npm.toml`,
      );
    }
    return [
      {
        key: `${json.name} ${json.version}`,
        title: `${json.name} ${json.version} (${license})`,
        text: texts.join("\n\n"),
      },
    ];
  });

  for (const key of Object.keys(clarifications)) {
    if (!used.has(key)) {
      problems.push(
        `scripts/notices/npm.toml clarifies ${key}, which isn't a dependency: remove it, or update its version after checking it again`,
      );
    }
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return packages.sort((a, b) => byCode(a.key, b.key));
};

// the fonts Blank ships, by the start of their file names, and their licence
// files in fonts/
const FONTS = [
  {
    prefix: "IBMPlexSans-",
    name: "IBM Plex Sans",
    license: "IBM Plex Sans License.txt",
  },
  {
    prefix: "IBMPlexMono-",
    name: "IBM Plex Mono",
    license: "IBM Plex Mono License.txt",
  },
  {
    prefix: "dejavu-sans",
    name: "DejaVu Sans",
    license: "DejaVu Fonts License.txt",
  },
  {
    prefix: "NotoEmoji-",
    name: "Noto Emoji",
    license: "Noto Emoji License.txt",
  },
];

const FONT_FILE = /\.(ttf|otf|woff2?)$/i;

/**
 * fontNotices returns the licence of each font in fonts/ (the pages and the
 * PDF) and public/fonts/ (the webview), and copies the licences to
 * public/fonts/, which ships next to both
 */
const fontNotices = () => {
  const files = ["fonts", join("public", "fonts")].flatMap((folder) =>
    readdirSync(join(root, folder)).filter((file) => FONT_FILE.test(file)),
  );
  const unknown = files.filter(
    (file) => !FONTS.some(({ prefix }) => file.startsWith(prefix)),
  );
  if (unknown.length) {
    throw new Error(
      `no licence is known for ${unknown.join(", ")}: add the font to FONTS in scripts/build-notices.ts`,
    );
  }
  const licenses = new Set(FONTS.map(({ license }) => license));
  const strays = readdirSync(join(root, "public", "fonts")).filter(
    (file) => file.endsWith(".txt") && !licenses.has(file),
  );
  if (strays.length) {
    throw new Error(
      `public/fonts/ has licences of no font in FONTS: ${strays.join(", ")}`,
    );
  }
  return FONTS.map(({ prefix, name, license }) => {
    copyFileSync(
      join(root, "fonts", license),
      join(root, "public", "fonts", license),
    );
    const own = files.filter((file) => file.startsWith(prefix));
    return {
      title: name,
      files: [...new Set(own)].sort(byCode),
      text: readFileSync(join(root, "fonts", license), "utf8").trim(),
    };
  });
};

interface CatalogEntry {
  package: string;
  version: string;
  license: string;
  bundled: boolean;
}

/**
 * dictionaryNotices returns the licence of each dictionary built into Blank
 * (src-tauri/src/spellcheck/bundled.rs); the others are downloaded when the
 * user picks their language
 */
const dictionaryNotices = () => {
  const { dictionaries } = readJson<{
    dictionaries: Record<string, CatalogEntry>;
  }>(join(root, "src", "spellcheck", "catalog.json"));
  return Object.entries(dictionaries)
    .filter(([, entry]) => entry.bundled)
    .sort(([a], [b]) => byCode(a, b))
    .map(([tag, entry]) => {
      const license = join(root, "src-tauri", "dictionaries", tag, "LICENSE");
      if (!existsSync(license)) {
        throw new Error(`${relative(root, license)} is missing`);
      }
      return {
        title: `${entry.package} ${entry.version} (${entry.license})`,
        text: readFileSync(license, "utf8").trim(),
      };
    });
};

const RULE = "=".repeat(78);
const rule = "-".repeat(78);

// the quick checks first, before cargo-about's minute
const packages = packageNotices();
const fonts = fontNotices();
const dictionaries = dictionaryNotices();
const crates = crateNotices();
const sections = [
  [
    "Third-party notices",
    "",
    "Blank is licensed under the GNU Affero General Public License v3.0 only",
    "(LICENSE). It includes the software, fonts and spell check dictionaries",
    "listed below, under the licences given with them. The fonts' licences",
    "are also in fonts/*License*.txt next to this file.",
  ].join("\n"),
  `${RULE}\nRust crates\n${RULE}`,
  ...crates.map(
    ({ title, users, text }) =>
      `${title}\nUsed by: ${users.join(", ")}\n${rule}\n${text}`,
  ),
  `${RULE}\nnpm packages\n${RULE}`,
  ...packages.map(({ title, text }) => `${title}\n${rule}\n${text}`),
  `${RULE}\nFonts\n${RULE}`,
  ...fonts.map(
    ({ title, files, text }) =>
      `${title}\nFiles: ${files.join(", ")}\n${rule}\n${text}`,
  ),
  `${RULE}\nSpell check dictionaries\n${RULE}`,
  ...dictionaries.map(({ title, text }) => `${title}\n${rule}\n${text}`),
];
writeFileSync(output, sections.join("\n\n\n").replace(/\r\n/g, "\n") + "\n");
console.log(
  `Wrote ${output}: ${crates.length} crate licences, ${packages.length} npm packages, ${fonts.length} fonts, ${dictionaries.length} dictionaries`,
);
