import { describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";

import {
  createState,
  createTestView,
  doc,
  h,
  li,
  p,
  pressKey,
  type StateOptions,
  ul,
} from "../../../test/editor";
import autocomplete from ".";

/**
 * typeSpace presses space in a view of `node` with the autocomplete plugin
 * and returns the handler's result and the resulting doc.
 */
const typeSpace = (node: Node, options?: StateOptions, combo = " ") => {
  const plugin = autocomplete();
  const view = createTestView(createState(node, options));
  const handled = pressKey(view, plugin, combo);
  return { handled, doc: view.state.doc };
};

describe("plugin.autocomplete", () => {
  it.each(["Shift- ", "Ctrl- ", "Meta- ", "Alt- ", "a", "Enter"])(
    "ignores %j",
    (combo) => {
      const node = doc(p("-->"));
      const { handled, doc: result } = typeSpace(node, {}, combo);

      expect(handled).toBeUndefined();
      expect(result).toBe(node);
    },
  );

  it("ignores a range selection", () => {
    const node = doc(p("-->"));
    const { handled, doc: result } = typeSpace(node, { cursor: [1, 4] });

    expect(handled).toBe(false);
    expect(result).toBe(node);
  });

  it("only triggers with the cursor at the end of the block", () => {
    const node = doc(p("a b -->"));
    const { handled, doc: result } = typeSpace(node, { cursor: 2 });

    expect(handled).toBe(false);
    expect(result).toBe(node);
  });

  it("returns false when no transformer matches", () => {
    const node = doc(p("just text"));
    const { handled, doc: result } = typeSpace(node);

    expect(handled).toBe(false);
    expect(result).toBe(node);
  });

  it("returns false when the matching transformer can't apply", () => {
    const node = doc(ul(li(p("-"))));
    const { handled, doc: result } = typeSpace(node);

    expect(handled).toBe(false);
    expect(result.toJSON()).toEqual(node.toJSON());
  });

  it.each([
    ["-", "bullet_list", ""],
    ["--", "paragraph", "— "],
    ["##", "heading", ""],
    [">", "blockquote", ""],
    ["a -->", "paragraph", "a → "],
  ])("transforms %j into a %s", (text, type, content) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { handled, doc: result } = typeSpace(doc(p(text)));

    expect(handled).toBe(true);
    expect(result.firstChild?.type.name).toBe(type);
    expect(result.textContent).toBe(content);
  });

  it("keeps typing in a heading created on the last line", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const plugin = autocomplete();
    const view = createTestView(createState(doc(p("Hello world"), p("##"))));

    expect(pressKey(view, plugin, " ")).toBe(true);
    view.dispatch(view.state.tr.insertText("Heading"));

    expect(view.state.doc.toJSON()).toEqual(
      doc(p("Hello world"), h(2, "Heading")).toJSON(),
    );
  });

  it("converts a link typed at the end of a paragraph", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { handled, doc: result } = typeSpace(doc(p("[a](https://a.b)")));

    expect(handled).toBe(true);
    expect(result.textContent).toBe("a ");
    expect(result.firstChild?.firstChild?.marks[0].attrs.href).toBe(
      "https://a.b",
    );
  });
});
