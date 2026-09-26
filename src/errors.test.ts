import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors";

describe("errors", () => {
  describe("errorMessage", () => {
    it("returns the message of an Error", () => {
      expect(errorMessage(new Error("disk full"))).toBe("disk full");
      expect(errorMessage(new TypeError("bad type"))).toBe("bad type");
    });

    it("returns a string as it is", () => {
      expect(errorMessage("permission denied")).toBe("permission denied");
    });

    it.each([
      [{ code: 2 }, '{"code":2}'],
      [42, "42"],
      [null, "null"],
      [undefined, "undefined"],
    ])("stringifies %j as %j", (err, expected) => {
      expect(errorMessage(err)).toBe(expected);
    });

    it("falls back to String() when the value can't be stringified", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(errorMessage(circular)).toBe("[object Object]");
      expect(errorMessage(10n)).toBe("10");
    });
  });
});
