import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-markdown";

import { doc, keyEvent, p } from "../../test/editor";
import {
  contextMenu,
  spellcheck,
  spellchecker,
  spellcheckMessage,
  spellcheckStatus,
} from "../../state";
import type { Spellchecker } from "../../spellcheck/types";
import { keymap } from "../plugins/keymap";
import { spellcheck as spellcheckPlugin } from "../plugins/spellcheck";

const checker: Spellchecker = {
  tag: "en",
  isCorrect: (word) => !["wrng", "tset"].includes(word),
  check: async () => {},
  suggest: async () => [],
  userEntry: () => undefined,
  addWord: async () => {},
  removeWord: async () => {},
  replaceWord: async () => {},
};

let view: EditorView;

const setup = async (text = "wrng this tset") => {
  const plugin = keymap();
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema,
      doc: doc(p(text)),
      plugins: [spellcheckPlugin(), plugin],
    }),
  });
  vi.spyOn(view, "coordsAtPos").mockReturnValue({
    left: 1,
    right: 1,
    top: 2,
    bottom: 3,
  });
  await vi.runAllTimersAsync();
  const press = (combo: string) =>
    plugin.props.handleKeyDown!.call(plugin, view, keyEvent(combo));
  return press;
};

const selected = () =>
  view.state.doc.textBetween(
    view.state.selection.from,
    view.state.selection.to,
  );

describe("spell check commands", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spellcheck.value = true;
    spellchecker.value = checker;
    spellcheckStatus.value = { state: "ready", tag: "en" };
    spellcheckMessage.value = null;
    contextMenu.value = null;
  });

  afterEach(() => {
    view.destroy();
    contextMenu.value = null;
    spellchecker.value = null;
    spellcheck.value = false;
  });

  it("turns spell check on and off", async () => {
    const press = await setup();

    expect(press("Mod-Alt-s")).toBe(true);
    expect(spellcheck.value).toBe(false);
    press("Mod-Alt-s");
    expect(spellcheck.value).toBe(true);
  });

  it("selects the next misspelling and opens its menu", async () => {
    const press = await setup();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );

    expect(press("Mod-Alt-n")).toBe(true);
    expect(selected()).toBe("tset");
    expect(contextMenu.value?.keyboard).toBe(true);

    press("Mod-Alt-n");
    expect(selected()).toBe("wrng");

    press("Mod-Alt-Shift-n");
    expect(selected()).toBe("tset");

    // where Shift makes the key a capital letter
    press("Mod-Alt-Shift-N");
    expect(selected()).toBe("wrng");
  });

  it("says when there are no misspellings", async () => {
    const press = await setup("this");

    expect(press("Mod-Alt-n")).toBe(true);
    expect(spellcheckMessage.value).toBe("No spelling errors");
    expect(contextMenu.value).toBeNull();
  });

  it("says when spell check isn't ready", async () => {
    const press = await setup();
    spellcheckStatus.value = { state: "downloading", tag: "en" };

    expect(press("Mod-Alt-n")).toBe(true);
    expect(spellcheckMessage.value).toBe("Spell check isn't ready");
  });

  it("leaves the keys alone while spell check is off", async () => {
    const press = await setup();
    spellcheck.value = false;

    expect(press("Mod-Alt-n")).toBe(false);
  });

  it("opens the menu at the cursor", async () => {
    const press = await setup();

    expect(press("Shift-F10")).toBe(true);
    expect(contextMenu.value).toMatchObject({
      keyboard: true,
      anchor: { left: 1, top: 2, bottom: 3 },
    });
  });
});
