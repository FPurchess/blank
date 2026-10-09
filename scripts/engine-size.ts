// The report of scripts/engine-size.sh on the stages of the layout engine's
// wasm in <dir> (see ENGINE_STAGES in scripts/build-engine.sh): what ships,
// what each export and crate costs, why each crate is in, the biggest items
// and the generic code. FORMAT=json prints the same as one JSON object, for
// tools and agents; N sets the rows of the item table.
// usage: bun scripts/engine-size.ts <dir> <cargo wasm>
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

interface Item {
  name: string;
  shallow_size: number;
}
interface Dominator extends Item {
  retained_size: number;
  children?: Dominator[];
}
interface Generic {
  generic: string;
  approximate_monomorphization_bloat_bytes: number;
  total_size: number;
  monomorphizations: Item[];
}

const run = (cmd: string[]) => {
  const result = Bun.spawnSync(cmd);
  if (!result.success)
    throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
};
const twiggy = <T>(...args: string[]) =>
  JSON.parse(run(["twiggy", ...args, "-f", "json"])) as T;

// crate[hash]:: as rustc's demangled names have it; the hash tells versions
// of a crate apart
const CRATE = /([A-Za-z_]\w*)\[([0-9a-f]+)\]::/;
const HASH = /\[[0-9a-f]+\]/g;
const STD = new Set(["core", "alloc", "std", "compiler_builtins", "dlmalloc"]);
// the name section only names things, the shipped wasm has none
const isName = (name: string) =>
  / subsection$/.test(name) || name === "custom section 'name' headers";
const EXPORTS = "(wasm-bindgen exports, incl. inlined code)";

const group = (name: string): [string, string?] => {
  const crate = name.match(CRATE);
  if (crate) return [crate[1], crate[2]];
  if (/^data segment |^data\[\d+\]$/.test(name)) return ["(data segments)"];
  if (/^layoutengine_|^export "/.test(name)) return [EXPORTS];
  if (
    / headers$|^type\[|^table\[|^elem\[|^import |^global\[|^memory\[/.test(name)
  )
    return ["(module structure)"];
  return ["(other)"];
};

// the bytes of a wasm's code and data sections
const sections = (bytes: Uint8Array) => {
  let at = 8;
  const leb = () => {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bytes[at++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  };
  const sizes = { code: 0, data: 0, other: 0 };
  while (at < bytes.length) {
    const id = bytes[at++];
    const size = leb();
    if (id === 10) sizes.code += size;
    else if (id === 11) sizes.data += size;
    at += size;
  }
  sizes.other = bytes.length - sizes.code - sizes.data;
  return sizes;
};

// the packages blank-layout builds into the wasm, from cargo tree: version,
// features and the direct dependencies of blank-layout they come through
const packages = () => {
  const tree = run([
    "cargo",
    "tree",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "-p",
    "blank-layout",
    "--target",
    "wasm32-unknown-unknown",
    "-e",
    "normal",
    "--no-dedupe",
    "--prefix",
    "depth",
    "-f",
    "{p}|{f}",
  ]);
  const found = new Map<
    string,
    { crate: string; version: string; via: Set<string>; features: string[] }
  >();
  const stack: string[] = [];
  for (const line of tree.split("\n")) {
    const match = line.match(/^(\d+)(\S+) v(\S+)[^|]*\|(.*)$/);
    if (!match) continue;
    const depth = Number(match[1]);
    const [, , name, version, features] = match;
    stack[depth] = name;
    if (depth === 0) continue;
    const key = `${name}@${version}`;
    const entry = found.get(key) ?? {
      crate: name.replace(/-/g, "_"),
      version,
      via: new Set<string>(),
      features: features ? features.split(",") : [],
    };
    entry.via.add(depth === 1 ? "direct" : stack[1]);
    found.set(key, entry);
  }
  return [...found.values()];
};

const report = (dir: string, cargoWasm: string) => {
  const files = {
    cargo: relative(".", cargoWasm),
    "wasm-bindgen": relative(".", `${dir}/blank_layout_bg.pre-opt.wasm`),
    "wasm-opt -g": relative(".", `${dir}/blank_layout_bg.named.wasm`),
    shipped: relative(".", `${dir}/blank_layout_bg.wasm`),
    committed: "src/engine/wasm/blank_layout_bg.wasm",
  };
  const named = files["wasm-opt -g"];
  const pre = twiggy<Item[]>("top", files["wasm-bindgen"]);
  const post = twiggy<Item[]>("top", named);
  const shippedBytes = readFileSync(files.shipped);
  const committedBytes = readFileSync(files.committed);

  // brotli at quality 11 takes seconds, and the committed wasm is usually
  // the shipped one
  const packed = new Map<bigint | number, { gzip: number; brotli: number }>();
  const pack = (data: Buffer) => {
    const key = Bun.hash(data);
    const sizes = packed.get(key) ?? {
      gzip: gzipSync(data, { level: 9 }).length,
      brotli: brotliCompressSync(data, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    };
    packed.set(key, sizes);
    return sizes;
  };
  const stages = Object.entries(files).map(([stage, file]) => {
    const data = readFileSync(file);
    const items =
      file === named
        ? post
        : file === files["wasm-bindgen"]
          ? pre
          : twiggy<Item[]>("top", file);
    const names = items
      .filter((item) => isName(item.name))
      .reduce((sum, item) => sum + item.shallow_size, 0);
    return {
      stage,
      file,
      bytes: data.length,
      names,
      ...(names ? {} : pack(data)),
    };
  });
  const shipped = shippedBytes.length;

  // what each export holds alone: the export's subtree right under the root
  // of the dominator tree. What several exports share hangs off the root.
  const root = twiggy<{ items: Dominator[] }>("dominators", "-d", "1", named)
    .items[0];
  const exports = (root.children ?? [])
    .filter((child) => child.name.startsWith('export "'))
    .map((child) => {
      const name = child.name.slice(8, -1);
      return {
        export: name,
        method: name.replace(/^layoutengine_/, "LayoutEngine."),
        bytes: child.retained_size,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
  const exclusive = exports.reduce((sum, e) => sum + e.bytes, 0);

  const byCrate = (items: Item[]) => {
    const sums = new Map<string, number>();
    const hashes = new Map<string, Set<string>>();
    for (const item of items) {
      if (isName(item.name)) continue;
      const [key, hash] = group(item.name);
      sums.set(key, (sums.get(key) ?? 0) + item.shallow_size);
      if (hash) hashes.set(key, (hashes.get(key) ?? new Set()).add(hash));
    }
    return { sums, hashes };
  };
  const before = byCrate(pre);
  const after = byCrate(post);
  const preTotal = [...before.sums.values()].reduce((a, b) => a + b, 0);
  const deps = packages();
  const crates = [...new Set([...before.sums.keys(), ...after.sums.keys()])]
    .map((crate) => {
      const versions = deps.filter((dep) => dep.crate === crate);
      return {
        crate,
        before: before.sums.get(crate) ?? 0,
        after: after.sums.get(crate) ?? 0,
        copies: Math.max(
          before.hashes.get(crate)?.size ?? 0,
          after.hashes.get(crate)?.size ?? 0,
        ),
        via: STD.has(crate)
          ? ["Rust standard library"]
          : crate === "blank_layout"
            ? ["(the engine)"]
            : [...new Set(versions.flatMap((v) => [...v.via]))].sort(),
        versions: versions.map((v) => ({
          version: v.version,
          via: [...v.via].sort(),
          features: v.features,
        })),
      };
    })
    .sort((a, b) => b.before - a.before);

  const generics = twiggy<Generic[]>(
    "monos",
    "-m",
    "100000",
    "-n",
    "100000",
    named,
  )
    // twiggy ends the list with a row of totals
    .filter((g) => !g.generic.startsWith("Σ "))
    .reduce((merged, g) => {
      // the same function of two versions of a crate counts as one
      const generic = g.generic.replace(HASH, "").replace(/::$/, "");
      const entry = merged.get(generic) ?? {
        generic,
        copies: 0,
        bytes: 0,
        savable: 0,
      };
      entry.copies += g.monomorphizations.filter(
        (m) => !m.name.startsWith("... and"),
      ).length;
      entry.bytes += g.total_size;
      entry.savable += g.approximate_monomorphization_bloat_bytes;
      return merged.set(generic, entry);
    }, new Map<string, { generic: string; copies: number; bytes: number; savable: number }>());
  const genericList = [...generics.values()].sort(
    (a, b) => b.savable - a.savable,
  );

  const top = post
    .filter((item) => !isName(item.name) && !/ headers$/.test(item.name))
    .slice(0, Number(process.env.N ?? 50))
    .map((item) => ({
      name: item.name.replace(HASH, ""),
      bytes: item.shallow_size,
      crate: group(item.name)[0],
    }));

  const status = run([
    "git",
    "status",
    "--porcelain",
    "--",
    "src-tauri",
  ]).trim();
  const build = readFileSync("scripts/build-engine.sh", "utf8");
  const pinned = (name: string) =>
    build.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1];
  return {
    commit: run(["git", "rev-parse", "--short", "HEAD"]).trim(),
    sourcesChanged: status !== "",
    tools: {
      rustc: pinned("RUST_VERSION"),
      wasmBindgen: run(["wasm-bindgen", "--version"]).trim().split(" ")[1],
      binaryen: pinned("BINARYEN_VERSION"),
      twiggy: run(["twiggy", "--version"]).trim().split(" ")[1],
    },
    files,
    shipped: {
      bytes: shipped,
      ...sections(shippedBytes),
      brotli: stages[3].brotli ?? 0,
    },
    matchesCommitted: Buffer.compare(shippedBytes, committedBytes) === 0,
    committedBytes: committedBytes.length,
    stages,
    exports: { list: exports, shared: root.retained_size - exclusive },
    crates,
    preTotal,
    generics: genericList,
    top,
  };
};
type Report = ReturnType<typeof report>;

const n = (value: number) => value.toLocaleString("en-US");
const kb = (value: number) =>
  `${Math.round(value / 1000).toLocaleString("en-US")} KB`;
const pct = (value: number, total: number) =>
  `${((100 * value) / total).toFixed(1)}%`;
// align has an l or r per column, the default puts the first column left
const table = (rows: string[][], align = "l") => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  for (const row of rows)
    console.log(
      row
        .map((cell, i) =>
          (align[i] ?? "r") === "l"
            ? cell.padEnd(widths[i])
            : cell.padStart(widths[i]),
        )
        .join("  ")
        .trimEnd(),
    );
};
const through = (via: string[]) =>
  via.map((v) => (v === "direct" ? "direct" : `via ${v}`)).join(", ");
const section = (title: string) => console.log(`\n=== ${title} ===\n`);
const cut = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text;

const text = (r: Report) => {
  const code = r.shipped.code + r.shipped.data;
  console.log(
    `Layout engine wasm at ${r.commit}${r.sourcesChanged ? " (src-tauri has changes)" : ""}`,
  );
  console.log(
    `rustc ${r.tools.rustc}, wasm-bindgen ${r.tools.wasmBindgen}, binaryen ${r.tools.binaryen}, twiggy ${r.tools.twiggy}`,
  );

  section("Summary");
  console.log(
    `Shipped: ${n(r.shipped.bytes)} bytes, ${n(r.shipped.brotli)} brotli. Tauri embeds the frontend brotli-compressed, so the brotli size is what the wasm adds to the app.`,
  );
  console.log(
    `Code: ${n(r.shipped.code)} bytes, what the webview compiles at every start. Data: ${n(r.shipped.data)} bytes (tables and constants).`,
  );
  console.log(
    r.matchesCommitted
      ? "The build is the committed wasm."
      : `The build differs from the committed wasm (${r.shipped.bytes >= r.committedBytes ? "+" : ""}${n(r.shipped.bytes - r.committedBytes)} bytes).`,
  );
  const biggest = r.crates.filter((c) => !c.crate.startsWith("(")).slice(0, 6);
  console.log(
    `Biggest crates: ${biggest.map((c) => `${c.crate} ${pct(c.before, r.preTotal)}`).join(", ")}.`,
  );
  const heavy = r.exports.list.filter((e) => e.bytes >= 0.02 * code);
  console.log(
    `Only needed by one export: ${heavy.map((e) => `${e.method} ${kb(e.bytes)} (${pct(e.bytes, code)})`).join(", ")}. Shared: ${kb(r.exports.shared)}.`,
  );
  // a version cargo builds isn't always in the wasm
  const duplicates = r.crates.filter(
    (c) => c.versions.length > 1 && c.copies > 1,
  );
  if (duplicates.length > 0)
    console.log(
      `In several versions: ${duplicates
        .map(
          (c) =>
            `${c.crate} ${c.versions.map((v) => `${v.version} (${through(v.via)})`).join(" and ")}`,
        )
        .join("; ")}.`,
    );
  const savable = r.generics.reduce((sum, g) => sum + g.savable, 0);
  console.log(
    `Generic code: copies of generic functions per type take about ${kb(savable)} more than one copy each would; the most: ${r.generics
      .slice(0, 3)
      .map((g) => `${g.generic} (${g.copies} copies)`)
      .join(", ")}.`,
  );

  section("Size by stage");
  table([
    ["", "bytes", "names", "without names", "gzip -9", "brotli 11"],
    ...r.stages.map((s) => [
      s.stage,
      n(s.bytes),
      n(s.names),
      n(s.bytes - s.names),
      s.gzip === undefined ? "-" : n(s.gzip),
      s.brotli === undefined ? "-" : n(s.brotli),
    ]),
  ]);
  console.log(
    `\nThe shipped wasm: code ${n(r.shipped.code)}, data ${n(r.shipped.data)}, other sections ${n(r.shipped.other)} bytes.`,
  );
  console.log(
    "wasm-opt -g is the shipped code with the name section, which the tables below read.",
  );

  section("Cost per export (what removing it would save)");
  table(
    [
      ["export", "JS", "bytes", "% of code+data"],
      ...r.exports.list
        .filter((e) => e.bytes >= 1000)
        .map((e) => [e.export, e.method, n(e.bytes), pct(e.bytes, code)]),
      [
        "shared by several exports",
        "",
        n(r.exports.shared),
        pct(r.exports.shared, code),
      ],
    ],
    "ll",
  );
  console.log(
    "\nAn export's bytes are the code and data only it reaches. Moving an export into a wasm of its own (or dropping it) saves them here.",
  );

  section("Code by crate");
  table([
    ["crate", "before wasm-opt", "%", "after", "change", "via"],
    ...r.crates
      .slice(0, 30)
      .map((c) => [
        c.copies > 1 ? `${c.crate} (${c.copies} versions)` : c.crate,
        n(c.before),
        pct(c.before, r.preTotal),
        n(c.after),
        `${c.after >= c.before ? "+" : ""}${n(c.after - c.before)}`,
        cut(c.via.join(", "), 40),
      ]),
    ...(r.crates.length > 30
      ? [
          [
            `(${r.crates.length - 30} more)`,
            n(r.crates.slice(30).reduce((sum, c) => sum + c.before, 0)),
            pct(
              r.crates.slice(30).reduce((sum, c) => sum + c.before, 0),
              r.preTotal,
            ),
            n(r.crates.slice(30).reduce((sum, c) => sum + c.after, 0)),
            "",
            "",
          ],
        ]
      : []),
  ]);
  console.log(`
"before wasm-opt" is the fair split between crates: wasm-opt inlines code across
crates into the exports, which is why "${EXPORTS}" grows by what
the crates lose. "via" is the dependency of blank-layout (src-tauri/layout/Cargo.toml)
that brings a crate in, "direct" one it names itself. Generic code counts to the crate its name starts with
(often core or alloc, see "Generic code"). Data belongs to no crate.`);

  section("Versions and features of the crates above 1%");
  for (const c of r.crates.filter(
    (c) => c.versions.length > 0 && c.before >= 0.01 * r.preTotal,
  ))
    for (const v of c.versions)
      console.log(
        `${c.crate} ${v.version} (${through(v.via)}): ${v.features.length > 0 ? v.features.join(", ") : "(no features)"}`,
      );

  section(`Top ${r.top.length} items`);
  table(
    [
      ["bytes", "%", "item"],
      ...r.top.map((item) => [
        n(item.bytes),
        pct(item.bytes, r.shipped.bytes),
        cut(item.name, 110),
      ]),
    ],
    "rrl",
  );

  section("Generic code (copies per type)");
  table([
    ["generic function", "copies", "bytes", "over one copy"],
    ...r.generics
      .filter((g) => g.savable >= 2000)
      .slice(0, 15)
      .map((g) => [cut(g.generic, 70), n(g.copies), n(g.bytes), n(g.savable)]),
  ]);

  section("Digging deeper");
  const file = r.files["wasm-opt -g"];
  console.log(`The wasm with names: ${file}
Why is an item in (who calls it):  twiggy paths --regex ${file} 'subsetter.*Context.*process'
What an export holds:              twiggy dominators ${file} 'export "layoutengine_pdf"'
Who depends on a crate:            cargo tree --manifest-path src-tauri/Cargo.toml -p blank-layout --target wasm32-unknown-unknown -e normal -i skrifa@<version>
Compare with an earlier build:     cp ${file} before.wasm, change and rebuild, then twiggy diff before.wasm ${file}
This report again, without building: NO_BUILD=1 make engine-size (FORMAT=json for JSON)`);
};

const [dir, cargoWasm] = process.argv.slice(2);
if (!dir || !cargoWasm)
  throw new Error("usage: bun scripts/engine-size.ts <dir> <cargo wasm>");
const result = report(dir, cargoWasm);
if (process.env.FORMAT === "json") console.log(JSON.stringify(result, null, 2));
else text(result);
