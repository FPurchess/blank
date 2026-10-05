import { afterEach, describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { CommandIdentifier, config } from "../../config";
import { schema } from "../../markdown";
import { toolbarFocusRequest } from "../../state";
import {
  blockquote,
  createState,
  doc,
  li,
  ol,
  p,
  table,
  td,
  tr,
  ul,
} from "../../test/editor";
import { withKeymap } from "../../test/keymap";
import { commandFor } from "../plugins/keymap";
import { listAround } from "./lists";
import { inQuote } from "./quote";

const types = (node: Node) =>
  node.content.content.map((child) => child.type.name);

describe("the list keys", () => {
  it("toggle a list off again", () => {
    const { view, press } = withKeymap(doc(p("item")));
    press("Mod-8");
    expect(types(view.state.doc)).toEqual(["bullet_list"]);
    press("Mod-8");
    expect(types(view.state.doc)).toEqual(["paragraph"]);
    expect(view.state.doc.textContent).toBe("item");
  });

  it("switch a list to the other kind, and back", () => {
    const { view, press } = withKeymap(doc(ul(li(p("a")), li(p("b")))));
    press("Mod-9");
    expect(types(view.state.doc)).toEqual(["ordered_list"]);
    expect(view.state.doc.firstChild!.childCount).toBe(2);
    press("Mod-8");
    expect(types(view.state.doc)).toEqual(["bullet_list"]);
  });

  it("work on the innermost list", () => {
    const nested = doc(ul(li(p("outer"), ol(li(p("inner"))))));
    const { view, press } = withKeymap(nested);
    expect(listAround(view.state)?.node.type.name).toBe("ordered_list");
    press("Mod-8");
    const outer = view.state.doc.firstChild!;
    expect(outer.type.name).toBe("bullet_list");
    expect(outer.firstChild!.child(1).type.name).toBe("bullet_list");
  });

  it("find no list outside one", () => {
    expect(listAround(createState(doc(p("x"))))).toBeNull();
  });
});

describe("the quote key", () => {
  it("toggles a quote off again", () => {
    const { view, press } = withKeymap(doc(p("said")));
    press("Mod-g");
    expect(types(view.state.doc)).toEqual(["blockquote"]);
    expect(inQuote(view.state)).toBe(true);
    press("Mod-g");
    expect(types(view.state.doc)).toEqual(["paragraph"]);
    expect(inQuote(view.state)).toBe(false);
  });

  it("takes a list in a quote out of the quote, not out of the list", () => {
    const { view, press } = withKeymap(doc(blockquote(ul(li(p("item"))))));
    press("Mod-g");
    expect(types(view.state.doc)).toEqual(["bullet_list"]);
  });
});

describe("the mark keys", () => {
  it("mark a partly marked selection whole, then unmark it", () => {
    const partly = doc(
      schema.node("paragraph", null, [
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" plain"),
      ]),
    );
    const { view, press } = withKeymap(partly, { cursor: [1, 11] });
    press("Mod-b");
    const bold = (node: Node) =>
      node.firstChild!.content.content.every((text) =>
        schema.marks.strong.isInSet(text.marks),
      );
    expect(bold(view.state.doc)).toBe(true);
    press("Mod-b");
    expect(
      view.state.doc.firstChild!.content.content.some((text) =>
        schema.marks.strong.isInSet(text.marks),
      ),
    ).toBe(false);
  });

  it("underline with Mod-U", () => {
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });
    expect(press("Mod-u")).toBe(true);
    expect(
      view.state.doc.firstChild!.firstChild!.marks.map((m) => m.type.name),
    ).toEqual(["underline"]);
  });
});

describe("the code block command", () => {
  it("makes a code block, in a table's cell too, and has no key", () => {
    for (const [node, cursor] of [
      [doc(p("x = 1")), 3],
      [doc(table(tr(td("x = 1")))), 6],
    ] as const) {
      const { view } = withKeymap(node, { cursor });
      const command = commandFor(CommandIdentifier.BLOCKTYPE_CODE_BLOCK);
      expect(command(view.state, view.dispatch, view)).toBe(true);
      let found = false;
      view.state.doc.descendants((child) => {
        if (child.type.name === "code_block") found = true;
      });
      expect(found).toBe(true);
    }
  });
});

describe("a code block made of a paragraph", () => {
  it("keeps its line breaks as newlines, and back", () => {
    const broken = doc(
      schema.node("paragraph", null, [
        schema.text("one"),
        schema.nodes.hard_break.create(),
        schema.text("two"),
      ]),
    );
    const { view } = withKeymap(broken, { cursor: 2 });
    commandFor(CommandIdentifier.BLOCKTYPE_CODE_BLOCK)(
      view.state,
      view.dispatch,
      view,
    );
    expect(view.state.doc.firstChild!.type.name).toBe("code_block");
    expect(view.state.doc.textContent).toBe("one\ntwo");
    commandFor(CommandIdentifier.BLOCKTYPE_PARAGRAPH)(
      view.state,
      view.dispatch,
      view,
    );
    expect(view.state.doc.firstChild!.child(1).type.name).toBe("hard_break");
  });
});

describe("keys left out", () => {
  const defaults = config.value;
  afterEach(() => {
    config.value = defaults;
  });

  it("binds no key to a command without one, and doesn't call it invalid", () => {
    vi.mocked(sendNotification).mockClear();
    config.value = {
      ...defaults,
      keymap: { ...defaults.keymap, [CommandIdentifier.FORMAT_BOLD]: "" },
    };
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });
    expect(press("Mod-b")).toBeFalsy();
    expect(view.state.doc.firstChild!.firstChild!.marks).toEqual([]);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("the toolbar key", () => {
  it("asks the toolbar for the focus", () => {
    toolbarFocusRequest.value = null;
    const { press } = withKeymap(doc(p("x")));
    expect(press("Alt-F10")).toBe(true);
    expect(toolbarFocusRequest.value).not.toBeNull();
  });
});
