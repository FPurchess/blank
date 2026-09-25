import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";
import { history } from "prosemirror-history";

import { CommandIdentifier, config } from "../../config";
import { linkDialog, path, theme, themes } from "../../state";
import {
  blockquote,
  codeBlock,
  createState,
  createTestView,
  doc,
  h,
  li,
  ol,
  p,
  pressKey,
  type StateOptions,
  ul,
} from "../../test/editor";
import { flushPromises } from "../../test/async";
import { keymap } from "./keymap";

/**
 * setup creates a view of `node` with the keymap (and history) plugin and
 * returns a function to press keys in it.
 */
const setup = (node: Node, options: StateOptions = {}) => {
  const plugin = keymap();
  const view = createTestView(
    createState(node, { ...options, plugins: [history(), plugin] }),
  );
  return { view, press: (combo: string) => pressKey(view, plugin, combo) };
};

describe("plugin.keymap", () => {
  const defaultConfig = config.value;

  afterEach(() => {
    config.value = defaultConfig;
  });

  it("binds every command to its own key", () => {
    const bindings = Object.values(CommandIdentifier).map(
      (command) => config.value.keymap[command],
    );

    expect(bindings.every(Boolean)).toBe(true);
    expect(new Set(bindings).size).toBe(bindings.length);
  });

  it.each([
    ["Mod-1", "heading", 1],
    ["Mod-2", "heading", 2],
    ["Mod-3", "heading", 3],
    ["Mod-4", "heading", 4],
    ["Mod-5", "heading", 5],
    ["Mod-6", "heading", 6],
  ])("%s turns the block into a %s of level %i", (combo, type, level) => {
    const { view, press } = setup(doc(p("text")));

    expect(press(combo)).toBe(true);

    expect(view.state.doc.firstChild?.type.name).toBe(type);
    expect(view.state.doc.firstChild?.attrs.level).toBe(level);
  });

  it("Mod-0 turns a heading back into a paragraph", () => {
    const { view, press } = setup(doc(h(2, "text")));

    press("Mod-0");

    expect(view.state.doc.toJSON()).toEqual(doc(p("text")).toJSON());
  });

  it.each([
    ["Mod-b", "strong"],
    ["Mod-i", "em"],
    ["Mod-e", "code"],
  ])("%s marks the selection as %s", (combo, mark) => {
    const { view, press } = setup(doc(p("text")), { cursor: [1, 5] });

    expect(press(combo)).toBe(true);

    const marks = view.state.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.map((m) => m.type.name)).toEqual([mark]);
  });

  it.each([
    ["Mod-8", "bullet_list"],
    ["Mod-9", "ordered_list"],
  ])("%s wraps the block in a %s", (combo, type) => {
    const { view, press } = setup(doc(p("item")));

    press(combo);

    expect(view.state.doc.firstChild?.type.name).toBe(type);
    expect(view.state.doc.textContent).toBe("item");
  });

  it("Tab indents a list item and Shift-Tab outdents it again", () => {
    const flat = doc(ul(li(p("one")), li(p("two"))));
    const { view, press } = setup(flat);

    expect(press("Tab")).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(
      doc(ul(li(p("one"), ul(li(p("two")))))).toJSON(),
    );

    expect(press("Shift-Tab")).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(flat.toJSON());
  });

  describe("Mod-k", () => {
    beforeEach(() => {
      linkDialog.value = null;
    });

    it("opens the link dialog for the selection", async () => {
      const { press } = setup(doc(p("text")), { cursor: [1, 5] });

      expect(press("Mod-k")).toBe(true);

      await vi.waitFor(() => expect(linkDialog.value?.text).toBe("text"));
    });

    it("is not handled in a code block", async () => {
      const { press } = setup(doc(codeBlock("code")));

      expect(press("Mod-k")).toBe(false);
      await flushPromises();

      expect(linkDialog.value).toBeNull();
    });
  });

  it("Mod-g wraps the block in a blockquote", () => {
    const { view, press } = setup(doc(p("quote")));

    press("Mod-g");

    expect(view.state.doc.toJSON()).toEqual(
      doc(blockquote(p("quote"))).toJSON(),
    );
  });

  it("Mod-h inserts a horizontal rule", () => {
    const { view, press } = setup(doc(p("text")));

    press("Mod-h");

    const types: string[] = [];
    view.state.doc.forEach((node) => types.push(node.type.name));
    expect(types).toContain("horizontal_rule");
  });

  it.each(["Shift-Enter", "Mod-Enter"])("%s inserts a hard break", (combo) => {
    const { view, press } = setup(doc(p("text")));

    expect(press(combo)).toBe(true);

    expect(view.state.doc.firstChild?.lastChild?.type.name).toBe("hard_break");
  });

  it("Enter continues a list", () => {
    const { view, press } = setup(doc(ol(li(p("one")))));

    press("Enter");

    expect(view.state.doc.toJSON()).toEqual(
      doc(ol(li(p("one")), li(p()))).toJSON(),
    );
  });

  it("Enter splits a paragraph", () => {
    const { view, press } = setup(doc(p("text")));

    press("Enter");

    expect(view.state.doc.toJSON()).toEqual(doc(p("text"), p()).toJSON());
  });

  it("Mod-z undoes and Mod-Shift-z redoes", () => {
    const { view, press } = setup(doc(p("text")), { cursor: [1, 5] });
    press("Mod-b");
    const bold = view.state.doc;

    expect(press("Mod-z")).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(doc(p("text")).toJSON());

    expect(press("Mod-Shift-z")).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(bold.toJSON());
  });

  describe("app commands", () => {
    beforeEach(() => {
      theme.value = themes[0];
      path.value = "/notes.md";
    });

    it("Mod-Alt-t cycles the theme", () => {
      const { press } = setup(doc(p()));

      expect(press("Mod-Alt-t")).toBe(true);

      expect(theme.value).toBe(themes[1]);
    });

    it("Mod-n starts a new file", () => {
      const { view, press } = setup(doc(p("text")));

      expect(press("Mod-n")).toBe(true);

      expect(view.state.doc.textContent).toBe("");
      expect(path.value).toBeNull();
    });
  });

  it("uses the bindings from the config", () => {
    config.value = {
      ...defaultConfig,
      keymap: {
        ...defaultConfig.keymap,
        [CommandIdentifier.FORMAT_BOLD]: "Mod-d",
      },
    };
    const { view, press } = setup(doc(p("text")), { cursor: [1, 5] });

    expect(press("Mod-b")).toBe(false);
    expect(view.state.doc.firstChild?.firstChild?.marks).toHaveLength(0);

    expect(press("Mod-d")).toBe(true);
    expect(view.state.doc.firstChild?.firstChild?.marks[0].type.name).toBe(
      "strong",
    );
  });
});
