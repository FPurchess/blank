import { describe, expect, it } from "vitest";

import { keyOf } from "./keyOf";

describe("keyOf", () => {
  it("keys the same object alike, and another one apart", () => {
    const close = () => {};
    const other = () => {};
    const request = {};

    expect(keyOf(close)).toBe(keyOf(close));
    expect(keyOf(other)).not.toBe(keyOf(close));
    expect(keyOf(request)).not.toBe(keyOf(close));
  });
});
