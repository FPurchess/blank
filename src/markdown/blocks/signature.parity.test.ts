import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SIGNATURE_ROOM, SIGNATURE_SHARE } from "./signature";

// The Word export draws a signature block as the layout engine does, with
// the engine's room above the line and its default width, which signature.ts
// repeats.
const source = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../src-tauri/layout/src/items/signature.rs",
  ),
  "utf8",
);

const constant = (name: string) => {
  const match = new RegExp(`const ${name}: f32 = ([\\d.]+);`).exec(source);
  expect(match, name).not.toBeNull();
  return Number(match![1]);
};

describe("a signature block in Word", () => {
  it("has the engine's room and default width", () => {
    expect(SIGNATURE_ROOM).toBe(constant("SIGNATURE_ROOM"));
    expect(SIGNATURE_SHARE).toBe(constant("SIGNATURE_SHARE"));
  });
});
