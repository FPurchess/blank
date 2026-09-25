import { describe, expect, it } from "vitest";
import { schema } from "prosemirror-markdown";

import { createState, createTestView, doc, p } from "../../../../test/editor";
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

    it("uses the link that ends at the cursor", () => {
      const props = linkTransformer.activate(
        "foo [One](https://one.com) bar [Two](https://two.com)",
      );
      expect(props?.title).toBe("Two");
      expect(props?.url).toBe("https://two.com");
    });

    it("ignores a link followed by more text", () => {
      expect(
        linkTransformer.activate("[One](https://one.com) tail"),
      ).toBeUndefined();
    });

    it.each(["[](https://example.com)", "[Example]()", "[Example] (x)"])(
      "ignores incomplete link %j",
      (text) => {
        expect(linkTransformer.activate(text)).toBeUndefined();
      },
    );
  });

  describe("transform", () => {
    const transform = (text: string, cursor?: [number, number]) => {
      const view = createTestView(createState(doc(p(text)), { cursor }));
      const props = linkTransformer.activate(text);
      expect(props).toBeDefined();
      if (!props) throw new Error("link did not activate");
      const result = linkTransformer.transform(view, text, props);
      return { view, result };
    };

    it("replaces the markdown with a linked title followed by a space", () => {
      const { view, result } = transform("see [Blank](https://blank.app)");

      expect(result).toBe(true);
      expect(view.state.doc.toJSON()).toEqual(
        doc(
          schema.node("paragraph", null, [
            schema.text("see "),
            schema.text("Blank", [
              schema.marks.link.create({ href: "https://blank.app" }),
            ]),
            schema.text(" "),
          ]),
        ).toJSON(),
      );
      expect(view.state.selection.from).toBe(view.state.doc.content.size - 1);
    });

    it("does nothing for a range selection", () => {
      const text = "[a](b)";
      const { view, result } = transform(text, [1, 3]);

      expect(result).toBe(false);
      expect(view.state.doc.textContent).toBe(text);
    });
  });
});
