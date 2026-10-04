import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollToText } from "../../engine/geometry";
import { schema } from "../../markdown";
import { headings, headingsOf, tocDialog } from "../../state";
import { doc, h } from "../../test/editor";
import { PAGE_PRESS, type PagePointer } from "../pagePointer";
import { followEntry, toc } from "./toc";

vi.mock("../../engine/geometry", async (original) => ({
  ...(await original<typeof import("../../engine/geometry")>()),
  scrollToText: vi.fn(),
}));

const contents = (depth = 2) =>
  schema.node("toc", { depth, title: "Contents" });

// an editor with the plugin, whose headings the headings plugin would publish
const mount = (
  node = doc(contents(), h(1, "One"), h(3, "Deep"), h(2, "Two")),
) => {
  headings.value = headingsOf(node);
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ schema, doc: node, plugins: [toc()] }),
  });
  return view;
};

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  tocDialog.value = null;
  headings.value = [];
});

describe("toc plugin", () => {
  it("scrolls to the heading of an entry, as the outline does", () => {
    view = mount();
    expect(followEntry(view, 0, 1)).toBe(true);
    // into the heading "Two", after "One" (5) and "Deep" (6)
    expect(scrollToText).toHaveBeenCalledWith(1 + 5 + 6 + 1, 108);
    expect(followEntry(view, 0, 5)).toBe(false);
    expect(followEntry(view, 1, 0)).toBe(false);
  });

  it("follows an entry clicked on the pages with Ctrl", () => {
    view = mount();
    const press = (pointer: Partial<PagePointer>) => {
      const event = new CustomEvent(PAGE_PRESS, {
        cancelable: true,
        detail: {
          pos: 0,
          link: "#toc:0",
          x: 0,
          y: 0,
          button: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          ...pointer,
        },
      });
      view!.dom.dispatchEvent(event);
      return event.defaultPrevented;
    };
    // a plain click selects it, as any block
    expect(press({})).toBe(false);
    expect(scrollToText).not.toHaveBeenCalled();
    expect(press({ ctrlKey: true })).toBe(true);
    expect(scrollToText).toHaveBeenCalledWith(2, 108);
    // other links are openLink's
    expect(press({ ctrlKey: true, link: "https://example.org" })).toBe(false);
  });

  it("lists the headings in the editor, for screen readers and without the engine", () => {
    view = mount();
    const nav = view.dom.querySelector("nav.toc")!;
    expect(nav.getAttribute("aria-label")).toBe("Contents");
    expect(
      [...nav.querySelectorAll("li a")].map((link) => [
        link.textContent,
        link.getAttribute("href"),
      ]),
    ).toEqual([
      ["One", "#toc:0"],
      ["Two", "#toc:1"],
    ]);
    // and follows them as they change: the headings plugin publishes them
    const rename = (tr: Transaction) => {
      view!.dispatch(tr);
      headings.value = headingsOf(view!.state.doc);
    };
    rename(view.state.tr.insertText("ly", 5));
    expect([...nav.querySelectorAll("li")].map((li) => li.textContent)).toEqual(
      ["Onely", "Two"],
    );
    rename(view.state.tr.delete(1, view.state.doc.content.size));
    expect(nav.querySelector(".toc-empty")).not.toBeNull();
  });
});
