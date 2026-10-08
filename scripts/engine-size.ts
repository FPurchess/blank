// The tables of scripts/engine-size.sh, from twiggy's items of a wasm file:
// `sizes <label>=<file>…` gives each file's size, its name section and, for
// files without one, the size after gzip and brotli; `crates <before.wasm>
// <after.wasm>` sums the code by crate before and after wasm-opt.
import { readFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

interface Item {
  name: string;
  shallow_size: number;
}

const items = (file: string): Item[] => {
  const run = Bun.spawnSync(["twiggy", "top", "-f", "json", file]);
  if (!run.success)
    throw new Error(`twiggy failed on ${file}: ${run.stderr.toString()}`);
  return JSON.parse(run.stdout.toString()) as Item[];
};

// the name section only names things, the shipped wasm has none
const isName = (name: string) =>
  / subsection$/.test(name) || name === "custom section 'name' headers";

const bytes = (n: number) => n.toLocaleString("en-US");
const table = (rows: string[][]) => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  for (const row of rows)
    console.log(
      row
        .map((cell, i) =>
          i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]),
        )
        .join("  "),
    );
};

const sizes = (args: string[]) => {
  const rows = [
    ["", "bytes", "names", "without names", "gzip -9", "brotli 11"],
  ];
  for (const arg of args) {
    const at = arg.indexOf("=");
    const [label, file] = [arg.slice(0, at), arg.slice(at + 1)];
    const data = readFileSync(file);
    const names = items(file)
      .filter((item) => isName(item.name))
      .reduce((sum, item) => sum + item.shallow_size, 0);
    const packed = names
      ? ["-", "-"]
      : [
          gzipSync(data, { level: 9 }).length,
          brotliCompressSync(data, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).length,
        ].map(bytes);
    rows.push([
      label,
      bytes(data.length),
      bytes(names),
      bytes(data.length - names),
      ...packed,
    ]);
  }
  table(rows);
};

// crate[hash]:: as rustc's demangled names have it; the hash tells versions
// of a crate apart
const CRATE = /([A-Za-z_]\w*)\[([0-9a-f]+)\]::/;

const group = (name: string): [string, string?] => {
  const crate = name.match(CRATE);
  if (crate) return [crate[1], crate[2]];
  if (/^data segment |^data\[\d+\]$/.test(name)) return ["(data segments)"];
  if (/^layoutengine_|^export "/.test(name))
    return ["(wasm-bindgen exports, incl. inlined code)"];
  if (
    / headers$|^type\[|^table\[|^elem\[|^import |^global\[|^memory\[/.test(name)
  )
    return ["(module structure)"];
  return ["(other)"];
};

const byCrate = (file: string) => {
  const sums = new Map<string, number>();
  const versions = new Map<string, Set<string>>();
  for (const item of items(file)) {
    if (isName(item.name)) continue;
    const [key, hash] = group(item.name);
    sums.set(key, (sums.get(key) ?? 0) + item.shallow_size);
    if (hash) versions.set(key, (versions.get(key) ?? new Set()).add(hash));
  }
  return { sums, versions };
};

const crates = ([before, after]: string[]) => {
  const pre = byCrate(before);
  const post = byCrate(after);
  const total = [...post.sums.values()].reduce((a, b) => a + b, 0);
  const keys = [...new Set([...pre.sums.keys(), ...post.sums.keys()])].sort(
    (a, b) => (post.sums.get(b) ?? 0) - (post.sums.get(a) ?? 0),
  );
  const shown = 30;
  const rows = [["", "after wasm-opt", "%", "before", "change"]];
  const row = (label: string, a: number, b: number) =>
    rows.push([
      label,
      bytes(a),
      `${((100 * a) / total).toFixed(1)}%`,
      bytes(b),
      `${a >= b ? "+" : ""}${bytes(a - b)}`,
    ]);
  for (const key of keys.slice(0, shown)) {
    const count = Math.max(
      pre.versions.get(key)?.size ?? 0,
      post.versions.get(key)?.size ?? 0,
    );
    row(
      count > 1 ? `${key} (${count} versions)` : key,
      post.sums.get(key) ?? 0,
      pre.sums.get(key) ?? 0,
    );
  }
  const rest = keys.slice(shown);
  if (rest.length > 0)
    row(
      `(${rest.length} more)`,
      rest.reduce((sum, key) => sum + (post.sums.get(key) ?? 0), 0),
      rest.reduce((sum, key) => sum + (pre.sums.get(key) ?? 0), 0),
    );
  row(
    "total, without names",
    total,
    [...pre.sums.values()].reduce((a, b) => a + b, 0),
  );
  table(rows);
};

const [command, ...args] = process.argv.slice(2);
if (command === "sizes") sizes(args);
else if (command === "crates" && args.length === 2) crates(args);
else
  throw new Error(
    "usage: bun scripts/engine-size.ts sizes <label>=<file>… | crates <before.wasm> <after.wasm>",
  );
