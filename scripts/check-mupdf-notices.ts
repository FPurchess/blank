// Checks that scripts/notices/mupdf.toml lists exactly the libraries of
// MuPDF's thirdparty/ folder that the PDF helper's build compiled: it reads
// the objects in libmupdf-third.a (the newest one under src-tauri/target, or
// the archive given) and finds the folder each object's source is in. An
// object whose name more than one folder has a source of says nothing.
// It also checks that every source of MuPDF itself compiled into
// libmupdf.a (next to it) whose header holds someone else's copyright is
// one of the files listed, and the CMaps once pdf-cmap-load.o is in: the
// CMaps compile into it as headers, so their licence follows that object.
// The `pdf` job of the Tests workflow runs it after building the helper.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

const root = join(import.meta.dir, "..");
const thirdparty = join(
  root,
  "src-tauri",
  "pdf",
  "mupdf-sys",
  "mupdf",
  "thirdparty",
);

/** every file under `dir` */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".git" ? [] : walk(path);
    return [path];
  });

const archive =
  process.argv[2] ??
  walk(join(root, "src-tauri", "target"))
    .filter((path) => basename(path) === "libmupdf-third.a")
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!archive) throw new Error("no libmupdf-third.a: make pdf-helper first");

const ar = spawnSync("ar", ["t", archive], { encoding: "utf8" });
if (ar.status !== 0) throw new Error(`ar t ${archive} failed`);
const objects = ar.stdout.split("\n").filter(Boolean);

// the folders of thirdparty/ with a source of each name
const folders = new Map<string, Set<string>>();
for (const path of walk(thirdparty)) {
  if (![".c", ".cc", ".cpp"].includes(extname(path))) continue;
  const name = basename(path, extname(path));
  const folder = relative(thirdparty, path).split(sep)[0];
  folders.set(name, (folders.get(name) ?? new Set()).add(folder));
}

const compiled = new Set<string>();
for (const object of objects) {
  const found = folders.get(basename(object, ".o"));
  if (found?.size === 1) compiled.add([...found][0]);
}

const listed = new Set(
  (
    Bun.TOML.parse(
      readFileSync(join(root, "scripts", "notices", "mupdf.toml"), "utf8"),
    ) as { library: { thirdparty?: string }[] }
  ).library.flatMap(({ thirdparty }) => (thirdparty ? [thirdparty] : [])),
);

// the files whose licences the notices quote
const quoted = new Set(
  (
    Bun.TOML.parse(
      readFileSync(join(root, "scripts", "notices", "mupdf.toml"), "utf8"),
    ) as { library: { files: string[] }[] }
  ).library.flatMap(({ files }) => files),
);
const mupdf = join(thirdparty, "..");
const core = join(archive, "..", "libmupdf.a");
const coreObjects = new Set(
  spawnSync("ar", ["t", core], { encoding: "utf8" })
    .stdout.split("\n")
    .filter(Boolean),
);
if (coreObjects.size === 0) throw new Error(`ar t ${core} failed`);
// sources with someone else's copyright near their top
const foreign = walk(join(mupdf, "source")).filter((path) => {
  if (extname(path) !== ".c") return false;
  if (!coreObjects.has(`${basename(path, ".c")}.o`)) return false;
  const top = readFileSync(path, "utf8").split("\n").slice(0, 80).join("\n");
  return /Copyright/.test(top) && !/Artifex/.test(top);
});
const unquoted = foreign
  .map((path) => relative(mupdf, path).split(sep).join("/"))
  .filter((file) => !quoted.has(file));
if (
  coreObjects.has("pdf-cmap-load.o") &&
  ![...quoted].some((file) => file.startsWith("resources/cmaps/"))
)
  unquoted.push("resources/cmaps");

const unlisted = [...compiled].filter((folder) => !listed.has(folder));
const unused = [...listed].filter((folder) => !compiled.has(folder));
if (unquoted.length) {
  console.error(
    `scripts/notices/mupdf.toml quotes no licence of what ${core} compiles in: ${unquoted.join(", ")}`,
  );
  process.exit(1);
}
if (unlisted.length || unused.length) {
  console.error(
    `scripts/notices/mupdf.toml doesn't match ${archive}:` +
      (unlisted.length
        ? `\n  compiled, not listed: ${unlisted.join(", ")}`
        : "") +
      (unused.length ? `\n  listed, not compiled: ${unused.join(", ")}` : ""),
  );
  process.exit(1);
}
console.log(
  `The notices list what the PDF helper compiles: ${[...compiled].sort().join(", ")}`,
);
