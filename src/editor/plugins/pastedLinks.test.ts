import { describe, expect, it } from "vitest";
import { Fragment, Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

import { schema } from "../../markdown";
import { pastedLinks } from "./pastedLinks";

describe("pastedLinks", () => {
  const transform = (slice: Slice) =>
    pastedLinks().props.transformPasted!.call(
      pastedLinks(),
      slice,
      {} as EditorView,
      false,
    );

  it("drops the underline Word and Google Docs put on links", () => {
    const { link, underline } = schema.marks;
    const pasted = new Slice(
      schema.node("paragraph", null, [
        schema.text("link", [
          link.create({ href: "https://example.org" }),
          underline.create(),
        ]),
      ]).content,
      0,
      0,
    );
    const marks = transform(pasted).content.firstChild!.marks;
    expect(marks.map((mark) => mark.type.name)).toEqual(["link"]);
  });

  it("leaves a paste without underlined links as it is", () => {
    const pasted = new Slice(Fragment.from(schema.text("plain")), 0, 0);
    expect(transform(pasted)).toBe(pasted);
  });
});
