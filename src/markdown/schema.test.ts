import { describe, expect, it } from "vitest";

import { MARK_NAMES, NODE_NAMES, schema } from "./schema";

describe("the schema", () => {
  it("has the nodes and marks NODE_NAMES and MARK_NAMES list", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([...NODE_NAMES].sort());
    expect(Object.keys(schema.marks).sort()).toEqual([...MARK_NAMES].sort());
  });
});
