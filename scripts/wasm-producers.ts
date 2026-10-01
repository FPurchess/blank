// Fails if a wasm file still has a `producers` section. wasm-bindgen writes
// its own version there, and a prebuilt wasm-bindgen (as CI installs) adds
// its git commit, so the same sources would build different files.
// scripts/build-engine.sh strips it and runs this on the result.
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
if (!file) throw new Error("usage: bun scripts/wasm-producers.ts <file.wasm>");
const bytes = readFileSync(file);
let at = 8; // after the magic number and the version
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
while (at < bytes.length) {
  const id = bytes[at++];
  const size = leb();
  const end = at + size;
  if (id === 0) {
    const length = leb();
    const name = bytes.subarray(at, at + length).toString("utf8");
    if (name === "producers") {
      console.error(`error: ${file} has a producers section`);
      process.exit(1);
    }
  }
  at = end;
}
