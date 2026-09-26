// Builds the catalog of spell check dictionaries (src/spellcheck/catalog.json)
// from the Hunspell dictionaries packaged at github.com/wooorm/dictionaries,
// and copies the bundled ones to src-tauri/dictionaries/. Every dictionary is
// downloaded and loaded once with the engine the app uses, so dictionaries it
// can't load are marked as such. Run with `bun run dictionaries:update`.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { isoCodes } from "../src/editor/plugins/autocomplete/languages/iso639-1";

// dictionaries built into the app, all others are downloaded when needed
const BUNDLED = ["de", "en", "es", "fr"];

// a dictionary that loads slower than this would stall the app
const MAX_LOAD_MS = 3000;

// ISO 639-1 codes that use the dictionary of another tag
const ALIASES: Record<string, string> = { no: "nb" };

const FILES = ["index.aff", "index.dic"] as const;

const root = join(import.meta.dir, "..");
const cacheDir = join(import.meta.dir, ".cache", "dictionaries");
const bundledDir = join(root, "src-tauri", "dictionaries");
const catalogFile = join(root, "src", "spellcheck", "catalog.json");

interface FileInfo {
  size: number;
  sha256: string;
}

export interface Entry {
  package: string;
  version: string;
  license: string;
  bundled: boolean;
  loads: boolean;
  error?: string;
  files: { aff: FileInfo; dic: FileInfo };
}

const fetchJson = async <T>(url: string): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "user-agent": "blank-dictionary-catalog" },
    });
    if (response.ok) return (await response.json()) as T;
    if (attempt === 3) throw new Error(`${url}: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
};

const fetchBytes = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    if (attempt === 3) throw new Error(`${url}: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
};

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const fileUrl = (pkg: string, version: string, file: string) =>
  `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${file}`;

/**
 * tags returns the language tags of all packaged dictionaries whose primary
 * subtag is an ISO 639-1 code, the only codes the language chooser knows
 */
const tags = async () => {
  const listing = await fetchJson<{ name: string; type: string }[]>(
    "https://api.github.com/repos/wooorm/dictionaries/contents/dictionaries",
  );
  return listing
    .filter((item) => item.type === "dir")
    .map((item) => item.name)
    .filter((tag) => isoCodes.has(tag.split("-")[0]))
    .sort();
};

/**
 * describe reads the version, license and file hashes of the package for `tag`
 */
const describe = async (tag: string) => {
  const pkg = `dictionary-${tag.toLowerCase()}`;
  const { version, license } = await fetchJson<{
    version: string;
    license: string;
  }>(`https://registry.npmjs.org/${pkg}/latest`);
  const { files } = await fetchJson<{
    files: { name: string; hash: string; size: number }[];
  }>(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${version}`);

  const info = (name: string): FileInfo => {
    const file = files.find((f) => f.name === name);
    if (!file) throw new Error(`${pkg}@${version} has no ${name}`);
    // jsDelivr reports the SHA-256 in base64
    const hex = Buffer.from(file.hash, "base64").toString("hex");
    return { size: file.size, sha256: hex };
  };

  return {
    package: pkg,
    version,
    license,
    files: { aff: info("index.aff"), dic: info("index.dic") },
  };
};

/**
 * download stores the files of `entry` in `dir`, checking them against the
 * catalog, unless they are already there
 */
const download = async (
  entry: Omit<Entry, "bundled" | "loads">,
  dir: string,
) => {
  mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const path = join(dir, file);
    const expected = entry.files[file === "index.aff" ? "aff" : "dic"];
    if (existsSync(path) && sha256(readFileSync(path)) === expected.sha256) {
      continue;
    }
    const bytes = await fetchBytes(fileUrl(entry.package, entry.version, file));
    if (sha256(bytes) !== expected.sha256) {
      throw new Error(`${entry.package}/${file} doesn't match its hash`);
    }
    writeFileSync(path, bytes);
  }
};

/**
 * validate loads every dictionary in `dir` with the app's engine
 */
const validate = (dir: string) => {
  const result = spawnSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--release",
      "--manifest-path",
      join(root, "src-tauri", "Cargo.toml"),
      "--example",
      "validate_dictionaries",
      "--",
      dir,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (result.status !== 0)
    throw new Error("validating the dictionaries failed");
  return new Map(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .map((line) => [line.tag as string, line]),
  );
};

const main = async () => {
  const entries: Record<string, Omit<Entry, "bundled" | "loads">> = {};
  for (const tag of await tags()) {
    const entry = await describe(tag);
    entries[tag] = entry;
    // the hash check re-downloads a file once its package has a new version
    await download(entry, join(cacheDir, tag));
    console.log(`${tag}: ${entry.package}@${entry.version}`);
  }

  const results = validate(cacheDir);
  const dictionaries: Record<string, Entry> = {};
  for (const [tag, entry] of Object.entries(entries)) {
    const result = results.get(tag);
    const loads = !!result?.loads && result.loadMs <= MAX_LOAD_MS;
    dictionaries[tag] = {
      ...entry,
      bundled: BUNDLED.includes(tag),
      loads,
      ...(!loads
        ? {
            error:
              result?.error ??
              (result ? `loads in ${result.loadMs} ms` : "not validated"),
          }
        : {}),
    };
    if (!loads)
      console.warn(`${tag} can't be used: ${dictionaries[tag].error}`);
  }

  for (const tag of BUNDLED) {
    const entry = dictionaries[tag];
    if (!entry?.loads)
      throw new Error(`bundled dictionary ${tag} can't be used`);
    const dir = join(bundledDir, tag);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const file of FILES) {
      writeFileSync(join(dir, file), readFileSync(join(cacheDir, tag, file)));
    }
    writeFileSync(
      join(dir, "LICENSE"),
      await fetchBytes(fileUrl(entry.package, entry.version, "license")),
    );
  }

  writeFileSync(
    catalogFile,
    JSON.stringify({ aliases: ALIASES, dictionaries }, null, 2) + "\n",
  );
  // keep the output as the format check expects it
  spawnSync("bunx", ["prettier", "--write", catalogFile], { stdio: "inherit" });
  const usable = Object.values(dictionaries).filter((entry) => entry.loads);
  console.log(
    `wrote ${Object.keys(dictionaries).length} dictionaries (${usable.length} usable) to ${catalogFile}`,
  );
};

await main();
