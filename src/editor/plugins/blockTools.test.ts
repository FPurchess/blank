import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fragment, type Node, Slice } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import {
  checkDefinition,
  createForm,
  type Definition,
  definitionKey,
  schema,
} from "../../markdown";
import { announcement, blockToolbar, tocPopover } from "../../state";
import { flushPromises } from "../../test/async";
import { doc, keyEvent, li, p, ul } from "../../test/editor";
import { box, boxType } from "../../test/embeds";
import { registerEmbedType } from "../../embeds/registry";
import { RECIPE, RECIPE_KEY } from "../../test/forms";
import { blockBoxes, caretPage } from "../../engine/geometry";
import { blockRemovals } from "./blockRemovals";
import { blockTools } from "./blockTools";

// the page view shows every block at the same box
vi.mock("../../engine/geometry", () => ({
  blockBoxes: vi.fn(),
  caretPage: vi.fn(),
}));

let view: EditorView;
// the embed type a test registered
let unregister = () => {};

// a document with a table of contents and a recipe between paragraphs
const withBlocks = () =>
  schema.node("doc", { definitions: { [RECIPE_KEY]: RECIPE } }, [
    p("intro"),
    schema.node("toc"),
    createForm(RECIPE, RECIPE_KEY),
    p("outro"),
  ]);

const mount = (node: Node = withBlocks()) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: node,
      plugins: [blockTools(), blockRemovals()],
    }),
  });
};

// the position of the first node of `type`
const posOf = (type: string) => {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos;
    return found < 0;
  });
  return found;
};

const select = (selection: (doc: Node) => TextSelection | NodeSelection) =>
  view.dispatch(view.state.tr.setSelection(selection(view.state.doc)));

const ids = () => blockToolbar.value?.items.map((item) => item.id);
const run = (id: string) =>
  blockToolbar.value!.items.find((item) => item.id === id)!.run();

describe("blockTools", () => {
  beforeEach(() => {
    vi.mocked(blockBoxes).mockReturnValue([
      { page: 0, left: 10, top: 20, right: 110, bottom: 60 },
    ]);
    vi.mocked(caretPage).mockReturnValue(0);
    announcement.value = null;
  });

  afterEach(() => {
    unregister();
    unregister = () => {};
    view.destroy();
    tocPopover.value = null;
  });

  it("shows nothing outside the blocks", () => {
    mount();
    expect(blockToolbar.value).toBeNull();
  });

  it("removes the form the cursor is in", () => {
    mount();
    select((doc) => TextSelection.create(doc, posOf("form_field") + 2));
    expect(blockToolbar.value).toMatchObject({
      label: "Recipe",
      icon: "form",
      anchor: { left: 10, top: 20, right: 110, bottom: 60 },
    });
    expect(ids()).toEqual(["block-remove"]);
    // Backspace deletes text in a field, so the tooltip names no key
    expect(blockToolbar.value!.items[0].key).toBeUndefined();
    run("block-remove");
    expect(posOf("form_block")).toBe(-1);
    expect(announcement.value?.text).toBe("Recipe removed");
    expect(blockToolbar.value).toBeNull();
  });

  it("edits and removes the table of contents selected", () => {
    mount();
    select((doc) => NodeSelection.create(doc, posOf("toc")));
    expect(blockToolbar.value).toMatchObject({
      label: "Table of contents",
      icon: "toc",
    });
    expect(ids()).toEqual(["block-edit", "block-remove"]);
    // the tooltips name what the buttons do, with the keys that do the same
    expect(blockToolbar.value!.items).toMatchObject([
      { label: "Settings", key: "Shift+Enter" },
      {
        label: "Remove Table of contents",
        tip: "Remove block",
        key: "Backspace",
      },
    ]);
    run("block-edit");
    expect(tocPopover.value).not.toBeNull();
    run("block-remove");
    expect(posOf("toc")).toBe(-1);
    expect(announcement.value?.text).toBe("Table of contents removed");
  });

  it("removes a block Blank can't show", () => {
    const unknown = schema.nodes.unknown_block.create({
      raw: "<!-- blank:chart@3 -->",
    });
    mount(doc(p("a"), unknown, p("b")));
    select((doc) => NodeSelection.create(doc, posOf("unknown_block")));
    expect(blockToolbar.value?.label).toBe("Block Blank can't show");
    expect(ids()).toEqual(["block-remove"]);
  });

  it("removes a selected embed, and edits one whose type Blank has", () => {
    const embed = schema.nodes.embed.create({
      type: "org.blank.test/box@1",
      id: "k3x9",
      alt: "A red box",
      svg: box("red"),
    });
    mount(doc(p("a"), embed, p("b")));
    select((doc) => NodeSelection.create(doc, posOf("embed")));
    expect(blockToolbar.value?.label).toBe("A red box");
    expect(ids()).toEqual(["block-remove"]);
    unregister = registerEmbedType(boxType([]));
    // a new selection of the same embed asks again
    select((doc) => TextSelection.create(doc, 1));
    select((doc) => NodeSelection.create(doc, posOf("embed")));
    expect(ids()).toEqual(["block-edit", "block-remove"]);
  });

  it("edits the selected table of contents or embed on Enter", async () => {
    const embed = schema.nodes.embed.create({
      type: "org.blank.test/box@1",
      id: "k3x9",
      svg: box("red"),
    });
    mount(doc(p("a"), schema.node("toc", { depth: 2 }), embed, p("b")));
    const enter = () =>
      view.someProp("handleKeyDown", (f) => f(view, keyEvent("Enter")));
    select((doc) => NodeSelection.create(doc, posOf("toc")));
    expect(enter()).toBe(true);
    expect(tocPopover.value?.values.depth).toBe(2);
    // an embed of a type Blank doesn't have: Enter is the editor's
    select((doc) => NodeSelection.create(doc, posOf("embed")));
    expect(enter()).toBeFalsy();
    unregister = registerEmbedType(boxType(["blue"]));
    expect(enter()).toBe(true);
    await flushPromises();
    expect(view.state.doc.nodeAt(posOf("embed"))!.attrs).toMatchObject({
      id: "k3x9",
      svg: box("blue"),
    });
  });

  it("goes into a selected form's first field on Enter or typing", () => {
    mount();
    const form = posOf("form_block");
    select((doc) => NodeSelection.create(doc, form));
    const enter = () =>
      view.someProp("handleKeyDown", (f) => f(view, keyEvent("Enter")));
    expect(enter()).toBe(true);
    expect(view.state.selection.$from.node(2).attrs.name).toBe("title");
    select((doc) => NodeSelection.create(doc, form));
    const typed = view.someProp("handleTextInput", (f) =>
      f(view, form, form, "P", () => view.state.tr),
    );
    expect(typed).toBe(true);
    expect(posOf("form_block")).toBe(form);
    expect(view.state.selection.$from.parent.textContent).toBe("P");
  });

  it("enters a form whose first field is a table under its header row", () => {
    const prices = checkDefinition({
      id: "user/prices",
      version: 1,
      name: "Prices",
      fields: [
        {
          name: "prices",
          kind: "table",
          label: "Prices",
          columns: ["Item", "Price"],
        },
      ],
    }) as Definition;
    const key = definitionKey(prices);
    mount(
      schema.node("doc", { definitions: { [key]: prices } }, [
        p("a"),
        createForm(prices, key),
        p("b"),
      ]),
    );
    select((doc) => NodeSelection.create(doc, posOf("form_block")));
    view.someProp("handleKeyDown", (f) => f(view, keyEvent("Enter")));
    const { $from } = view.state.selection;
    expect($from.node(-1).type.name).toBe("table_cell");
    // in the row under the header, so typing leaves the columns' names
    expect($from.index(-3)).toBe(1);
  });

  it("pastes content blocks after the list the cursor is in", () => {
    mount(doc(ul(li(p("a"))), p("b")));
    select((doc) => TextSelection.create(doc, 3));
    const slice = new Slice(Fragment.from(schema.node("toc")), 0, 0);
    const pasted = view.someProp("handlePaste", (f) =>
      f(view, new Event("paste") as ClipboardEvent, slice),
    );
    expect(pasted).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe("toc");
  });

  it("leaves a table in a form to the table's toolbar", () => {
    mount();
    let cell = -1;
    view.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.type.name === "table_cell") cell = pos;
      return cell < 0;
    });
    select((doc) => TextSelection.create(doc, cell + 2));
    expect(blockToolbar.value).toBeNull();
  });

  it("keeps its buttons while the block stays the same", () => {
    mount(doc(p("a"), schema.node("toc"), p("b")));
    select((doc) => NodeSelection.create(doc, posOf("toc")));
    const items = blockToolbar.value!.items;
    view.dispatch(view.state.tr.setMeta("scrolled", true));
    expect(blockToolbar.value!.items).toBe(items);
  });
});
