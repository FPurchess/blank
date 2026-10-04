import { describe, expect, it } from "vitest";

import { schema } from "./schema";
import { doc, p } from "../test/editor";
import { topBlockAt } from "./topBlock";

describe("topBlockAt", () => {
  // "ab" at 0, a table of contents at 4, "c" at 5
  const node = doc(p("ab"), schema.node("toc"), p("c"));

  it("finds the block at the top that holds a position", () => {
    expect(topBlockAt(node, 2)).toMatchObject({ index: 0, from: 0, to: 4 });
    expect(topBlockAt(node, 4)).toMatchObject({ index: 1, from: 4, to: 5 });
    expect(topBlockAt(node, 4)!.node.type.name).toBe("toc");
  });

  it("takes the last block past the end, and nothing in an empty document", () => {
    expect(topBlockAt(node, node.content.size)).toMatchObject({ index: 2 });
    expect(topBlockAt(node, 99)).toMatchObject({ index: 2 });
    expect(topBlockAt(schema.topNodeType.create(), 0)).toBeNull();
  });
});
