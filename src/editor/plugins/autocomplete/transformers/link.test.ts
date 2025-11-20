import { describe, expect, it } from "vitest";
import linkTransformer from "./link";

describe("transformer.link", () => {
  describe("activate", () => {
    it("activates for valid markdown link", () => {
      const text = "[Example](https://example.com)";
      const props = linkTransformer.activate(text);
      expect(props).toEqual({
        title: "Example",
        url: "https://example.com",
        matchLength: text.length,
      });
    });

    it("returns undefined for non-link text", () => {
      const props = linkTransformer.activate("not a link");
      expect(props).toBeUndefined();
    });

    it("only uses first link in string", () => {
      const props = linkTransformer.activate(
        "foo [One](https://one.com) bar [Two](https://two.com)",
      );
      expect(props?.title).toBe("One");
      expect(props?.url).toBe("https://one.com");
    });
  });
});
