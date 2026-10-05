import { describe, expect, it } from "vitest";
import { Fragment, Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

import { schema } from "../../markdown";
import { pastedLinks } from "./pastedLinks";

const { link, underline } = schema.marks;

const underlinedLink = () =>
  new Slice(
    schema.node("paragraph", null, [
      schema.text("link", [
        link.create({ href: "https://example.org" }),
        underline.create(),
      ]),
    ]).content,
    0,
    0,
  );

/**
 * paste runs a paste of `html` and the slice it becomes through the plugin,
 * as ProseMirror does
 */
const paste = (html: string, slice: Slice) => {
  const plugin = pastedLinks();
  const view = {} as EditorView;
  plugin.props.transformPastedHTML!.call(plugin, html, view);
  return plugin.props.transformPasted!.call(plugin, slice, view, false);
};

const marksOf = (slice: Slice) =>
  slice.content.firstChild!.marks.map((mark) => mark.type.name);

describe("pastedLinks", () => {
  it("drops the underline other apps put on links", () => {
    const pasted = paste(
      '<a href="https://example.org"><u>link</u></a>',
      underlinedLink(),
    );
    expect(marksOf(pasted)).toEqual(["link"]);
  });

  it("keeps an underlined link copied in Blank", () => {
    const pasted = paste(
      '<p data-pm-slice="1 1 []">link</p>',
      underlinedLink(),
    );
    expect(marksOf(pasted)).toEqual(["link", "underline"]);
  });

  it("leaves a paste without underlined links as it is", () => {
    const plain = new Slice(Fragment.from(schema.text("plain")), 0, 0);
    expect(paste("plain", plain)).toBe(plain);
  });
});
