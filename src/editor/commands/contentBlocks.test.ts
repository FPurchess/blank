import { Fragment, Slice } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { exists } from "@tauri-apps/plugin-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Definition, schema } from "../../markdown";
import { flushPromises } from "../../test/async";
import { boxType } from "../../test/embeds";
import { registerEmbedType } from "../../embeds/registry";
import { mockTauriPath } from "../../test/tauri";
import {
  announcement,
  blockChoices,
  blocksPaneFocused,
  blocksPaneOpen,
  blocksPaneSearch,
  tocPopover,
} from "../../state";
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
  editToc,
  insertBlock,
  insertTopBlock,
  pasteTopBlocks,
  readBlocks,
  toggleBlocksPane,
} from "./contentBlocks";
import { boxOnCaretPage } from "../plugins/followLayout";

// the pages show every block at the same box, unless a test hides them
vi.mock("../plugins/followLayout", () => ({
  boxOnCaretPage: vi.fn(() => ({
    page: 0,
    left: 10,
    top: 20,
    right: 110,
    bottom: 60,
  })),
}));

const toc = (attrs = {}) => schema.node("toc", attrs);

// the embed type a test registered
let unregister = () => {};

afterEach(() => {
  unregister();
  unregister = () => {};
  blocksPaneOpen.value = false;
  blocksPaneFocused.value = false;
  blocksPaneSearch.value = null;
  blockChoices.value = [];
  tocPopover.value = null;
});

describe("insertTopBlock", () => {
  it("puts the block in place of the empty paragraph the cursor is in", () => {
    const view = createTestView(createState(doc(p("a"), p()), { cursor: 4 }));
    insertTopBlock(view, toc());
    expect(view.state.doc.eq(doc(p("a"), toc(), p()))).toBe(true);
    // it is selected, and said to be there
    const { selection } = view.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect(selection.from).toBe(3);
    expect(announcement.value?.text).toBe("Table of contents inserted");
  });

  it("puts it at a place between two blocks it is given", () => {
    const view = createTestView(
      createState(doc(p("a"), p("b")), { cursor: 5 }),
    );
    insertTopBlock(view, toc(), undefined, 3);
    expect(view.state.doc.eq(doc(p("a"), toc(), p("b")))).toBe(true);
    expect(view.state.selection.from).toBe(3);
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

describe("the blocks pane", () => {
  beforeEach(() => {
    mockTauriPath();
    // no forms of the user's
    vi.mocked(exists).mockResolvedValue(false);
  });

  const read = async () => {
    await readBlocks();
    return blockChoices.value;
  };

  it("opens with the focus in its search, and closes while it has it", () => {
    const view = createTestView(createState(doc(p())));
    expect(toggleBlocksPane()(view.state, view.dispatch, view)).toBe(true);
    expect(blocksPaneOpen.value).toBe(true);
    expect(blocksPaneSearch.value).not.toBeNull();
    // the shortcut again while the text has the focus asks for the search
    // again
    const asked = blocksPaneSearch.value;
    toggleBlocksPane()(view.state, view.dispatch, view);
    expect(blocksPaneOpen.value).toBe(true);
    expect(blocksPaneSearch.value).not.toBe(asked);
    blocksPaneFocused.value = true;
    toggleBlocksPane()(view.state, view.dispatch, view);
    expect(blocksPaneOpen.value).toBe(false);
    expect(blocksPaneFocused.value).toBe(false);
  });

  it("offers the table of contents and Blank's forms", async () => {
    const choices = await read();
    expect(choices.map(({ id, group }) => [id, group])).toEqual([
      ["toc", "contents"],
      ["blank/recipe", "forms"],
    ]);
    // a form's tile draws its definition
    expect(choices[1].definition?.name).toBe("Recipe");
    const view = createTestView(createState(doc(p())));
    expect(insertBlock("toc")(view.state, view.dispatch, view)).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe("toc");
  });

  it("reads the forms once, however often it is asked meanwhile", async () => {
    void readBlocks();
    await read();
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it("inserts nothing for a block it doesn't offer", async () => {
    await read();
    const view = createTestView(createState(doc(p())));
    expect(insertBlock("user/gone")(view.state, view.dispatch, view)).toBe(
      false,
    );
  });

  it("offers the drawings of the types Blank has", async () => {
    unregister = registerEmbedType(boxType(["red"]));
    const choices = await read();
    expect(choices[choices.length - 1]).toMatchObject({
      id: "org.blank.test/box@1",
      group: "drawings",
      label: "Box",
    });
    const view = createTestView(createState(doc(p())));
    insertBlock("org.blank.test/box@1")(view.state, view.dispatch, view);
    await flushPromises();
    expect(view.state.doc.child(0).type.name).toBe("embed");
  });

  it("drops a drawing where the cursor is once the text changed meanwhile", async () => {
    unregister = registerEmbedType(boxType(["red"]));
    await read();
    const view = createTestView(
      createState(doc(p("a"), p("b")), { cursor: 2 }),
    );
    // dropped between the paragraphs, while its editor is open
    insertBlock("org.blank.test/box@1", 3)(view.state, view.dispatch, view);
    view.dispatch(view.state.tr.insertText("xyz", 1));
    await flushPromises();
    const names: string[] = [];
    view.state.doc.forEach((node) => names.push(node.type.name));
    // after the paragraph the cursor is in, not at the old place, which
    // is inside the first paragraph now
    expect(names).toEqual(["paragraph", "embed", "paragraph"]);
    expect(view.state.doc.child(0).textContent).toBe("xyza");
  });

  it("puts in a form with its definition, selected", async () => {
    await read();
    const view = createTestView(createState(doc(p())));
    insertBlock("blank/recipe")(view.state, view.dispatch, view);
    const form = view.state.doc.child(0);
    expect(form.type.name).toBe("form_block");
    const definitions = view.state.doc.attrs.definitions as Record<
      string,
      Definition
    >;
    expect(definitions[form.attrs.def as string].name).toBe("Recipe");
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(announcement.value?.text).toBe("Recipe inserted");
  });

  it("puts a block at the place it was dropped", async () => {
    await read();
    const view = createTestView(
      createState(doc(p("a"), p("b")), { cursor: 2 }),
    );
    insertBlock("toc", 3)(view.state, view.dispatch, view);
    expect(view.state.doc.eq(doc(p("a"), toc(), p("b")))).toBe(true);
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
    expect(tocPopover.value).toBeNull();
  });

  it("changes its depth and title at once, and keeps it selected", () => {
    const view = selected();
    expect(editToc()(view.state, view.dispatch, view)).toBe(true);
    expect(tocPopover.value).toMatchObject({ depth: 2, title: "Contents" });
    tocPopover.value!.apply(4, "Contents");
    expect(view.state.doc.child(1).attrs).toMatchObject({ depth: 4 });
    tocPopover.value!.apply(4, "Overview");
    const node = view.state.doc.child(1);
    expect(node.attrs).toMatchObject({ depth: 4, title: "Overview" });
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("closes its settings when asked again, as the settings button does", () => {
    const view = selected();
    editToc()(view.state, view.dispatch, view);
    const close = vi.spyOn(tocPopover.value!, "close");
    expect(editToc()(view.state, view.dispatch, view)).toBe(true);
    expect(tocPopover.value).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it("opens nothing while the table of contents isn't shown", () => {
    vi.mocked(boxOnCaretPage).mockReturnValueOnce(null);
    const view = selected();
    expect(editToc()(view.state, view.dispatch, view)).toBe(true);
    expect(tocPopover.value).toBeNull();
  });

  it("opens below the table of contents", () => {
    const view = selected();
    editToc()(view.state, view.dispatch, view);
    expect(tocPopover.value?.anchor).toMatchObject({ right: 110, bottom: 60 });
  });

  it("changes nothing for settings it already has", () => {
    const view = selected();
    editToc()(view.state, view.dispatch, view);
    const before = view.state;
    tocPopover.value!.apply(2, "Contents");
    expect(view.state).toBe(before);
  });

  it("changes nothing once the table of contents is gone", () => {
    const view = selected();
    editToc()(view.state, view.dispatch, view);
    view.dispatch(view.state.tr.delete(3, 4));
    const before = view.state.doc;
    tocPopover.value!.apply(5, "Gone");
    expect(view.state.doc).toBe(before);
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
