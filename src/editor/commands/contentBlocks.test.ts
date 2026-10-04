import { Fragment, Slice } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { exists } from "@tauri-apps/plugin-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Definition, schema } from "../../markdown";
import { flushPromises } from "../../test/async";
import { boxType } from "../../test/embeds";
import { registerEmbedType } from "../../embeds/registry";
import { mockTauriPath } from "../../test/tauri";
import { blockPicker, tocDialog } from "../../state";
import {
  blockquote,
  createState,
  createTestView,
  doc,
  li,
  p,
  table,
  th,
  tr,
  ul,
} from "../../test/editor";
import {
  chooseBlock,
  editToc,
  insertTopBlock,
  pasteTopBlocks,
} from "./contentBlocks";

const toc = (attrs = {}) => schema.node("toc", attrs);

afterEach(() => {
  blockPicker.value = null;
  tocDialog.value = null;
});

describe("insertTopBlock", () => {
  it("puts the block in place of the empty paragraph the cursor is in", () => {
    const view = createTestView(createState(doc(p("a"), p()), { cursor: 4 }));
    insertTopBlock(view, toc());
    expect(view.state.doc.eq(doc(p("a"), toc(), p()))).toBe(true);
    // the cursor goes on below it
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(2));
  });

  it("puts it after the paragraph the cursor is in, keeping the text", () => {
    const view = createTestView(
      createState(doc(p("ab"), p("c")), { cursor: 2 }),
    );
    insertTopBlock(view, toc());
    expect(view.state.doc.eq(doc(p("ab"), toc(), p("c")))).toBe(true);
  });

  it("puts it after the list or quote the cursor is in, at the top", () => {
    const view = createTestView(
      createState(doc(ul(li(p("a"))), blockquote(p("b"))), { cursor: 3 }),
    );
    insertTopBlock(view, toc());
    expect(view.state.doc.child(1).type.name).toBe("toc");
    expect(view.state.doc.child(2).type.name).toBe("paragraph");
    expect(view.state.doc.child(3).type.name).toBe("blockquote");
  });
});

describe("chooseBlock", () => {
  beforeEach(() => {
    mockTauriPath();
    // no templates of the user's
    vi.mocked(exists).mockResolvedValue(false);
  });

  const open = async (view: ReturnType<typeof createTestView>) => {
    expect(chooseBlock()(view.state, view.dispatch, view)).toBe(true);
    await flushPromises();
    return blockPicker.value!;
  };

  it("offers the table of contents and Blank's templates", async () => {
    const view = createTestView(createState(doc(p())));
    const picker = await open(view);
    expect(picker.choices.map((choice) => choice.id)).toEqual([
      "toc",
      "blank/recipe",
    ]);
    picker.pick("toc");
    expect(view.state.doc.child(0).type.name).toBe("toc");
  });

  it("opens once, however often it is asked while the templates are read", async () => {
    const view = createTestView(createState(doc(p())));
    chooseBlock()(view.state, view.dispatch, view);
    const picker = await open(view);
    expect(exists).toHaveBeenCalledTimes(1);
    expect(blockPicker.value).toBe(picker);
  });

  it("offers the embeds of the types Blank has", async () => {
    const unregister = registerEmbedType(boxType(["red"]));
    const view = createTestView(createState(doc(p())));
    const picker = await open(view);
    expect(picker.choices[picker.choices.length - 1]).toMatchObject({
      id: "org.blank.test/box@1",
      label: "Box",
    });
    picker.pick("org.blank.test/box@1");
    await flushPromises();
    expect(view.state.doc.child(0).type.name).toBe("embed");
    unregister();
  });

  it("puts in a form with its definition, the cursor in its first field", async () => {
    const view = createTestView(createState(doc(p())));
    (await open(view)).pick("blank/recipe");
    const form = view.state.doc.child(0);
    expect(form.type.name).toBe("form_block");
    const definitions = view.state.doc.attrs.definitions as Record<
      string,
      Definition
    >;
    expect(definitions[form.attrs.def as string].name).toBe("Recipe");
    const { $from } = view.state.selection;
    expect($from.node(2).attrs.name).toBe("title");
  });
});

describe("editToc", () => {
  const selected = () => {
    const state = createState(doc(p("a"), toc({ depth: 2 }), p("b")));
    const view = createTestView(
      state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 3))),
    );
    return view;
  };

  it("does nothing unless a table of contents is selected", () => {
    const view = createTestView(
      createState(doc(p("a"), toc(), p("b")), { cursor: 2 }),
    );
    expect(editToc()(view.state, view.dispatch, view)).toBe(false);
    expect(tocDialog.value).toBeNull();
  });

  it("changes its depth and title, and keeps it selected", () => {
    const view = selected();
    expect(editToc()(view.state, view.dispatch, view)).toBe(true);
    expect(tocDialog.value).toMatchObject({ depth: 2, title: "Contents" });
    tocDialog.value!.submit(4, "Overview");
    const node = view.state.doc.child(1);
    expect(node.attrs).toMatchObject({ depth: 4, title: "Overview" });
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("removes it", () => {
    const view = selected();
    editToc()(view.state, view.dispatch, view);
    tocDialog.value!.remove();
    expect(view.state.doc.eq(doc(p("a"), p("b")))).toBe(true);
  });
});

describe("pasteTopBlocks", () => {
  it("pastes a table of contents after the table the cursor is in", () => {
    const node = doc(table(tr(th("ab"), th("c"))), p("x"));
    const view = createTestView(createState(node, { cursor: 3 }));
    const slice = new Slice(Fragment.from(toc()), 0, 0);
    expect(pasteTopBlocks(view, slice)).toBe(true);
    expect(view.state.doc.child(0).eq(node.child(0))).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe("toc");
  });

  it("leaves a paste at the top of the document to the editor", () => {
    const view = createTestView(createState(doc(p("ab")), { cursor: 2 }));
    const slice = new Slice(Fragment.from(toc()), 0, 0);
    expect(pasteTopBlocks(view, slice)).toBe(false);
  });

  it("leaves a paste without content blocks to the editor", () => {
    const view = createTestView(
      createState(doc(ul(li(p("a")))), { cursor: 3 }),
    );
    const slice = new Slice(Fragment.from(p("b")), 0, 0);
    expect(pasteTopBlocks(view, slice)).toBe(false);
  });
});
