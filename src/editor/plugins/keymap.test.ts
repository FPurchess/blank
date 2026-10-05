import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { save } from "@tauri-apps/plugin-dialog";

import { CommandIdentifier, config } from "../../config";
import {
  bandEditor,
  imageDialog,
  languagePicker,
  linkDialog,
  path,
  tablePicker,
  theme,
  themes,
} from "../../state";
import {
  blockquote,
  codeBlock,
  doc,
  h,
  keyEvent,
  li,
  ol,
  p,
  table,
  td,
  th,
  tr,
  ul,
} from "../../test/editor";
import { flushPromises } from "../../test/async";
import { schema } from "../../markdown";
import {
  commandKeys,
  keymap,
  normalizeBinding,
  WINDOW_COMMANDS,
} from "./keymap";
import * as tabs from "../tabs";
import { withKeymap } from "../../test/keymap";

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
    const { view, press } = withKeymap(doc(p("text")));

    expect(press(combo)).toBe(true);

    expect(view.state.doc.firstChild?.type.name).toBe(type);
    expect(view.state.doc.firstChild?.attrs.level).toBe(level);
  });

  it("Mod-0 turns a heading back into a paragraph", () => {
    const { view, press } = withKeymap(doc(h(2, "text")));

    press("Mod-0");

    expect(view.state.doc.toJSON()).toEqual(doc(p("text")).toJSON());
  });

  it.each([
    ["Mod-b", "strong"],
    ["Mod-i", "em"],
    ["Mod-e", "code"],
  ])("%s marks the selection as %s", (combo, mark) => {
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

    expect(press(combo)).toBe(true);

    const marks = view.state.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.map((m) => m.type.name)).toEqual([mark]);
  });

  it.each([
    ["Mod-8", "bullet_list"],
    ["Mod-9", "ordered_list"],
  ])("%s wraps the block in a %s", (combo, type) => {
    const { view, press } = withKeymap(doc(p("item")));

    press(combo);

    expect(view.state.doc.firstChild?.type.name).toBe(type);
    expect(view.state.doc.textContent).toBe("item");
  });

  it("Tab indents a list item and Shift-Tab outdents it again", () => {
    const flat = doc(ul(li(p("one")), li(p("two"))));
    const { view, press } = withKeymap(flat);

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
      const { press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

      expect(press("Mod-k")).toBe(true);

      await vi.waitFor(() => expect(linkDialog.value?.text).toBe("text"));
    });

    it("is not handled in a code block", async () => {
      const { press } = withKeymap(doc(codeBlock("code")));

      expect(press("Mod-k")).toBe(false);
      await flushPromises();

      expect(linkDialog.value).toBeNull();
    });
  });

  it("Mod-g wraps the block in a blockquote", () => {
    const { view, press } = withKeymap(doc(p("quote")));

    press("Mod-g");

    expect(view.state.doc.toJSON()).toEqual(
      doc(blockquote(p("quote"))).toJSON(),
    );
  });

  it("Mod-h inserts a horizontal rule", () => {
    const { view, press } = withKeymap(doc(p("text")));

    press("Mod-h");

    const types: string[] = [];
    view.state.doc.forEach((node) => types.push(node.type.name));
    expect(types).toContain("horizontal_rule");
  });

  it("Shift-Enter inserts a hard break", () => {
    const { view, press } = withKeymap(doc(p("text")));

    expect(press("Shift-Enter")).toBe(true);

    expect(view.state.doc.firstChild?.lastChild?.type.name).toBe("hard_break");
  });

  it("Mod-Enter inserts a page break, splitting the paragraph", () => {
    const { view, press } = withKeymap(doc(p("before after")), { cursor: 8 });

    expect(press("Mod-Enter")).toBe(true);

    expect(view.state.doc.toJSON()).toEqual(
      doc(p("before "), schema.node("page_break"), p("after")).toJSON(),
    );
  });

  it("Backspace at the start of the next line removes a page break", () => {
    const pageBreak = schema.node("page_break");
    // the start of "b": after the paragraph "a" (3) and the break (1)
    const { view, press } = withKeymap(doc(p("a"), pageBreak, p("b")), {
      cursor: 5,
    });
    // the cursor is at the start of its line, which the stub view can't tell
    Object.assign(view, { endOfTextblock: () => true });

    press("Backspace");

    expect(view.state.doc.toJSON()).toEqual(doc(p("a"), p("b")).toJSON());
  });

  it("Mod-Enter leaves a code block, as before", () => {
    const { view, press } = withKeymap(doc(codeBlock("code")));

    press("Mod-Enter");

    expect(view.state.doc.toJSON()).toEqual(
      doc(codeBlock("code"), p()).toJSON(),
    );
  });

  it("Enter continues a list", () => {
    const { view, press } = withKeymap(doc(ol(li(p("one")))));

    press("Enter");

    expect(view.state.doc.toJSON()).toEqual(
      doc(ol(li(p("one")), li(p()))).toJSON(),
    );
  });

  it("Enter splits a paragraph", () => {
    const { view, press } = withKeymap(doc(p("text")));

    press("Enter");

    expect(view.state.doc.toJSON()).toEqual(doc(p("text"), p()).toJSON());
  });

  describe("in table cells", () => {
    const inCell = () => doc(table(tr(th("head")), tr(td("text"))), p());
    // the end of "text": table, header row, row, cell and paragraph open
    const cursor = (node: Node) =>
      node.firstChild!.firstChild!.nodeSize + 5 + 4;

    it.each(["Mod-1", "Mod-6", "Mod-h", "Mod-Enter"])(
      "%s does nothing",
      (combo) => {
        const node = inCell();
        const { view, press } = withKeymap(node, { cursor: cursor(node) });

        expect(press(combo)).toBe(false);
        expect(view.state.doc.eq(node)).toBe(true);
      },
    );

    it("Mod-8 starts a list in the cell", () => {
      const node = inCell();
      const { view, press } = withKeymap(node, { cursor: cursor(node) });

      press("Mod-8");
      const cell = view.state.doc.firstChild!.lastChild!.firstChild!;
      expect(cell.firstChild!.type.name).toBe("bullet_list");
    });
  });

  it("Mod-t opens the table picker", () => {
    const { view, press } = withKeymap(doc(p()), { cursor: 1 });
    Object.assign(view, { focus: () => {} });

    expect(press("Mod-t")).toBe(true);
    expect(tablePicker.value).toMatchObject({ cols: 3, rows: 3 });
    tablePicker.value = null;
  });

  it("Mod-z undoes and Mod-Shift-z redoes", () => {
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });
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
      const { press } = withKeymap(doc(p()));

      expect(press("Mod-Alt-t")).toBe(true);

      expect(theme.value).toBe(themes[1]);
    });

    it("Mod-Alt-l opens the language picker", () => {
      const { press } = withKeymap(doc(p()));

      expect(press("Mod-Alt-l")).toBe(true);

      expect(languagePicker.value.open).toBe(true);
    });

    it.each([
      ["Mod-Alt-h", "header"],
      ["Mod-Alt-f", "footer"],
    ])("%s opens the %s strip", (combo, band) => {
      const { press } = withKeymap(doc(p("text")));

      expect(press(combo)).toBe(true);

      expect(bandEditor.value).toMatchObject({ band });
      bandEditor.value = null;
    });

    it("Mod-Alt-i opens the image dialog", () => {
      const { press } = withKeymap(doc(p("text")));

      expect(press("Mod-Alt-i")).toBe(true);

      expect(imageDialog.value).toMatchObject({ isEdit: false });
      imageDialog.value = null;
    });

    it("Mod-Alt-w exports a Word document", async () => {
      const { press } = withKeymap(doc(p("text")));
      vi.mocked(save).mockResolvedValue(null);

      expect(press("Mod-Alt-w")).toBe(true);
      await flushPromises();

      expect(save).toHaveBeenCalledWith({
        filters: [{ name: "Word Document", extensions: ["docx"] }],
        defaultPath: "/notes.docx",
      });
    });

    it.each([
      ["Mod-n", "openNewTab", []],
      ["Ctrl-Tab", "cycleTab", [1]],
      ["Ctrl-Shift-Tab", "cycleTab", [-1]],
      ["Ctrl-PageDown", "cycleTab", [1]],
      ["Ctrl-PageUp", "cycleTab", [-1]],
      ["Mod-Shift-t", "reopenTab", []],
    ] as const)("%s runs %s", async (combo, action, args) => {
      const run = vi.spyOn(tabs, action).mockResolvedValue(undefined);
      const { press } = withKeymap(doc(p("text")));

      expect(press(combo)).toBe(true);
      await flushPromises();

      expect(run).toHaveBeenCalledWith(...args);
    });

    it("keeps Ctrl-PageDown for another command that has it", () => {
      config.value = {
        ...defaultConfig,
        keymap: {
          ...defaultConfig.keymap,
          [CommandIdentifier.FORMAT_BOLD]: "Ctrl-PageDown",
        },
      };
      const cycle = vi.spyOn(tabs, "cycleTab");
      const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

      expect(press("Ctrl-PageDown")).toBe(true);

      expect(cycle).not.toHaveBeenCalled();
      expect(view.state.doc.firstChild?.firstChild?.marks[0].type.name).toBe(
        "strong",
      );
    });
  });

  describe("the keys that work outside the editor", () => {
    it("leave a fixed key to any command bound to it", () => {
      config.value = {
        ...defaultConfig,
        keymap: {
          ...defaultConfig.keymap,
          [CommandIdentifier.FORMAT_BOLD]: "Ctrl-PageDown",
        },
      };
      const cycle = vi.spyOn(tabs, "cycleTab");
      const { view } = withKeymap(doc(p("text")));

      expect(
        commandKeys(WINDOW_COMMANDS)(view, keyEvent("Ctrl-PageDown")),
      ).toBe(false);
      expect(cycle).not.toHaveBeenCalled();
    });

    it("run the window's commands and nothing else", async () => {
      const run = vi.spyOn(tabs, "openNewTab").mockResolvedValue(undefined);
      const { view } = withKeymap(doc(p("text")));
      const keys = commandKeys(WINDOW_COMMANDS);

      expect(keys(view, keyEvent("Mod-n"))).toBe(true);
      expect(keys(view, keyEvent("Mod-b"))).toBe(false);
      await flushPromises();

      expect(run).toHaveBeenCalledOnce();
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
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

    expect(press("Mod-b")).toBe(false);
    expect(view.state.doc.firstChild?.firstChild?.marks).toHaveLength(0);

    expect(press("Mod-d")).toBe(true);
    expect(view.state.doc.firstChild?.firstChild?.marks[0].type.name).toBe(
      "strong",
    );
  });
  it("doesn't notify for the default keymap", () => {
    keymap();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("accepts Option, Command and Super as modifiers", () => {
    config.value = {
      ...defaultConfig,
      keymap: {
        ...defaultConfig.keymap,
        [CommandIdentifier.FORMAT_BOLD]: "Option-d",
        [CommandIdentifier.FORMAT_ITALIC]: "Command-j",
        [CommandIdentifier.FORMAT_CODE]: "super-u",
      },
    };
    const { view, press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

    expect(press("Alt-d")).toBe(true);
    expect(press("Meta-j")).toBe(true);
    expect(press("Meta-u")).toBe(true);
    expect(view.state.doc.firstChild?.firstChild?.marks).toHaveLength(3);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips bindings it can't use and notifies once", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    config.value = {
      ...defaultConfig,
      keymap: {
        ...defaultConfig.keymap,
        [CommandIdentifier.FORMAT_BOLD]: "Hyper-b",
        [CommandIdentifier.FORMAT_ITALIC]: "",
      },
    };

    const { press } = withKeymap(doc(p("text")), { cursor: [1, 5] });

    expect(press("Mod-s")).toBe(true);
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith(
      "Ignored invalid key bindings in blank.json: format.bold: Hyper-b, format.italic: ",
    );
  });
});

describe("normalizeBinding", () => {
  it.each([
    ["Mod-b", "Mod-b"],
    ["Mod-Shift-z", "Mod-Shift-z"],
    ["Tab", "Tab"],
    ["Shift-Tab", "Shift-Tab"],
    ["Mod--", "Mod--"],
    ["Mod-Space", "Mod-Space"],
    ["Ctrl-Alt-s", "Ctrl-Alt-s"],
    ["Control-Meta-s", "Control-Meta-s"],
    ["c-a-s-m-x", "c-a-s-m-x"],
    ["Cmd-p", "Meta-p"],
    ["Option-p", "Alt-p"],
    ["option-p", "Alt-p"],
    ["Command-Shift-s", "Meta-Shift-s"],
    ["COMMAND-s", "Meta-s"],
    ["Super-e", "Meta-e"],
  ])("normalizes %j to %j", (binding, expected) => {
    expect(normalizeBinding(binding)).toBe(expected);
  });

  it.each(["", "Hyper-b", "Win-b", "Command--p", "Fn-F1"])(
    "rejects %j",
    (binding) => {
      expect(normalizeBinding(binding)).toBeUndefined();
    },
  );

  it("rejects a binding that isn't a string", () => {
    expect(normalizeBinding(42 as unknown as string)).toBeUndefined();
  });
});
