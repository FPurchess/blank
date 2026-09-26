// Exports a markdown file with the Word export and checks that other apps can
// read the result: `bun scripts/check-docx.ts <input.md> [output.docx]`.
// Needs `unzip`, `pandoc` and `soffice` (LibreOffice) on the PATH.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

import toDOCX from "../src/exporters/docx";
import { sniffMime } from "../src/images/mime";

const [input, output = input.replace(/\.md$/, "") + ".docx"] =
  process.argv.slice(2);
if (!input) {
  console.error("usage: bun scripts/check-docx.ts <input.md> [output.docx]");
  process.exit(2);
}

// the app reads local images through the Tauri fs plugin, which doesn't run
// here, so they are inlined as data: URLs
const inlineImages = (markdown: string) =>
  markdown.replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (match, start, src) => {
    const file = join(dirname(input), decodeURIComponent(src));
    if (/^[a-z]+:/i.test(src) || !existsSync(file)) return match;
    const bytes = readFileSync(file);
    const mime = sniffMime(bytes) ?? "application/octet-stream";
    return `${start}data:${mime};base64,${bytes.toString("base64")}`;
  });

const doc = defaultMarkdownParser.parse(
  inlineImages(readFileSync(input, "utf8")),
);
const { contents, warnings } = await toDOCX(
  EditorState.create({ schema, doc }),
  {
    docPath: resolve(input),
  },
);
writeFileSync(output, contents);
console.log(`wrote ${output}`, warnings.length ? warnings : "");

const run = (command: string, args: string[]) => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${command} failed`);
    process.exit(1);
  }
};

run("unzip", ["-tq", output]);
run("pandoc", [output, "-t", "markdown"]);
run("soffice", [
  "--headless",
  "--convert-to",
  "pdf",
  "--outdir",
  dirname(output),
  output,
]);
