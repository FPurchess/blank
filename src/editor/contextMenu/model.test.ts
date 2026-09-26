import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, undoDepth } from "prosemirror-history";
import { schema } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

import { doc, p } from "../../test/editor";
import {
  type MenuItem,
  spellcheck,
  spellchecker,
  spellcheckStatus,
} from "../../state";
import type { Spellchecker } from "../../spellcheck/types";
import { update } from "../../spellcheck/service";
import {
  spellcheck as spellcheckPlugin,
  spellcheckKey,
} from "../plugins/spellcheck";
import { buildMenu, changeAll, copy, paste, replaceWord } from "./model";

vi.mock("../../spellcheck/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../spellcheck/service")>()),
  update: vi.fn(),
}));

type Item = Exclude<MenuItem, "separator">;

const checker = (): Spellchecker => ({
  tag: "en",
  isCorrect: () => true,
  check: vi.fn(async () => {}),
  suggest: vi.fn(async () => []),
  userEntry: () => undefined,
  addWord: vi.fn(async () => {}),
  removeWord: vi.fn(async () => {}),
  replaceWord: vi.fn(async () => {}),
});

let view: EditorView;

const setup = (node: Node = doc(p("wrng text"))) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema,
      doc: node,
      plugins: [history(), spellcheckPlugin()],
    }),
  });
  return view;
};

const ids = (items: MenuItem[]) =>
  items.map((item) => (item === "separator" ? "-" : item.id));

const find = (items: MenuItem[], id: string) =>
  items.find((item): item is Item => item !== "separator" && item.id === id)!;

const wrng = { from: 1, to: 5, word: "wrng" };

const text = () => view.state.doc.textContent;

describe("contextMenu model", () => {
  beforeEach(() => {
    spellcheck.value = true;
    spellchecker.value = checker();
    spellcheckStatus.value = { state: "ready", tag: "en" };
  });

  afterEach(() => {
    view?.destroy();
    spellchecker.value = null;
    spellcheck.value = false;
  });

  describe("items", () => {
    it("offers suggestions for a misspelled word, then editing and the toggle", () => {
      setup();

      const items = buildMenu(view, {
        misspelling: wrng,
        suggestions: ["wrong", "wring", "wing", "rung", "wang", "twang"],
      });

      expect(ids(items)).toEqual([
        "suggestion:wrong",
        "suggestion:wring",
        "suggestion:wing",
        "suggestion:rung",
        "suggestion:wang",
        "change-all",
        "-",
        "ignore-all",
        "add",
        "-",
        "undo",
        "redo",
        "-",
        "cut",
        "copy",
        "paste",
        "paste-plain",
        "delete",
        "select-all",
        "-",
        "disable",
      ]);
      expect(find(items, "change-all").children).toHaveLength(5);
      expect(find(items, "disable").shortcut).toBe("Mod-Alt-s");
      expect(find(items, "undo").shortcut).toBe("Mod-z");
    });

    it("shows that suggestions are loading or that there are none", () => {
      setup();

      const loading = buildMenu(view, { misspelling: wrng });
      const none = buildMenu(view, { misspelling: wrng, suggestions: [] });

      expect(find(loading, "loading").disabled).toBe(true);
      expect(ids(loading)).not.toContain("change-all");
      expect(find(none, "none").label).toBe("(No suggestions)");
    });

    it("offers to remove or edit a word of the personal dictionary", () => {
      setup(doc(p("blank")));

      const items = buildMenu(view, {
        userWord: { from: 1, to: 6, word: "Blank", entry: "blank" },
      });

      expect(ids(items).slice(0, 3)).toEqual(["remove", "edit", "-"]);
      expect(find(items, "edit").edit?.value).toBe("blank");
    });

    it("offers only editing and the toggle for other words", () => {
      setup();

      expect(ids(buildMenu(view, {}))[0]).toBe("undo");
    });

    it("disables what doesn't apply", () => {
      setup();

      const items = buildMenu(view, {});

      for (const id of ["undo", "redo", "cut", "copy", "delete"]) {
        expect(find(items, id).disabled).toBe(true);
      }
      expect(find(items, "paste").disabled).toBeFalsy();

      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)),
      );
      view.dispatch(view.state.tr.insertText("x"));
      const selected = buildMenu(view, {});
      expect(find(selected, "undo").disabled).toBe(false);
    });

    it("offers to turn spell check on while it is off", () => {
      setup();
      spellcheck.value = false;
      spellchecker.value = null;

      const items = buildMenu(view, {});
      find(items, "enable").run!();

      expect(ids(items).slice(-1)).toEqual(["enable"]);
      expect(spellcheck.value).toBe(true);
    });

    it("says when there is no dictionary for the language", () => {
      setup();
      spellcheckStatus.value = { state: "unavailable", tag: "fi" };

      const items = buildMenu(view, {});

      expect(find(items, "unavailable").label).toBe(
        "No spell check for Finnish",
      );
      expect(find(items, "unavailable").disabled).toBe(true);
    });

    it("offers to retry a failed download", () => {
      setup();
      spellcheckStatus.value = { state: "error", tag: "pl", message: "x" };

      find(buildMenu(view, {}), "retry").run!();

      expect(update).toHaveBeenCalled();
    });

    it("turns spell check off", () => {
      setup();

      find(buildMenu(view, {}), "disable").run!();

      expect(spellcheck.value).toBe(false);
    });
  });

  describe("actions", () => {
    it("replaces a word as one undo step and keeps its marks", () => {
      const strong = schema.marks.strong.create();
      setup(
        doc(
          schema.node("paragraph", null, [
            schema.text("wrng", [strong]),
            schema.text(" text"),
          ]),
        ),
      );

      replaceWord(view, wrng, "wrong");

      expect(text()).toBe("wrong text");
      expect(view.state.doc.firstChild!.firstChild!.marks).toEqual([strong]);
      expect(view.state.selection.from).toBe(6);
      undo(view.state, view.dispatch);
      expect(text()).toBe("wrng text");
    });

    it("replaces every occurrence in its case", async () => {
      setup(doc(p("wrng and Wrng"), p("WRNG")));

      changeAll(view, "wrng", "wrong");

      expect(
        view.state.doc.textBetween(0, view.state.doc.content.size, "|"),
      ).toBe("wrong and Wrong|WRONG");
      expect(undoDepth(view.state)).toBe(1);
    });

    it("changes nothing without occurrences", () => {
      setup(doc(p("text")));
      const dispatch = vi.spyOn(view, "dispatch");

      changeAll(view, "wrng", "wrong");

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("runs the spelling items", async () => {
      setup();
      const items = buildMenu(view, {
        misspelling: wrng,
        suggestions: ["wrong"],
      });

      find(items, "add").run!();
      expect(spellchecker.value!.addWord).toHaveBeenCalledWith("wrng");

      find(items, "ignore-all").run!();
      expect(spellcheckKey.getState(view.state)!.ignored.has("wrng")).toBe(
        true,
      );

      find(find(items, "change-all").children!, "change-all:wrong").run!();
      await vi.waitFor(() => expect(text()).toBe("wrong text"));

      undo(view.state, view.dispatch);
      find(items, "suggestion:wrong").run!();
      await vi.waitFor(() => expect(text()).toBe("wrong text"));
    });

    it("runs the personal dictionary items", () => {
      setup(doc(p("blank")));
      const items = buildMenu(view, {
        userWord: { from: 1, to: 6, word: "blank", entry: "blank" },
      });
      const { removeWord, replaceWord } = spellchecker.value!;

      find(items, "remove").run!();
      expect(removeWord).toHaveBeenCalledWith("blank");

      const { submit } = find(items, "edit").edit!;
      submit("  ");
      submit("two words");
      submit("blank");
      expect(replaceWord).not.toHaveBeenCalled();
      submit(" blanker ");
      expect(replaceWord).toHaveBeenCalledWith("blank", "blanker");
    });

    it("runs the editing items", async () => {
      setup();
      view.dispatch(view.state.tr.insertText("x ", 1));
      const items = () => buildMenu(view, {});

      find(items(), "undo").run!();
      await vi.waitFor(() => expect(text()).toBe("wrng text"));
      find(items(), "redo").run!();
      await vi.waitFor(() => expect(text()).toBe("x wrng text"));

      find(items(), "select-all").run!();
      await vi.waitFor(() =>
        expect(view.state.selection.to - view.state.selection.from).toBe(13),
      );
      find(items(), "delete").run!();
      await vi.waitFor(() => expect(text()).toBe(""));
    });

    it("logs an action that fails", async () => {
      setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(readText).mockRejectedValue(new Error("no clipboard"));

      find(buildMenu(view, {}), "paste-plain").run!();

      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          "context menu action failed",
          expect.any(Error),
        ),
      );
    });
  });

  describe("clipboard", () => {
    beforeEach(() => {
      // ProseMirror pastes through a ClipboardEvent, which jsdom lacks
      vi.stubGlobal(
        "ClipboardEvent",
        class extends Event {
          clipboardData = null;
        },
      );
    });

    const selectWord = () =>
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)),
      );

    it("copies and cuts like the keyboard shortcut", async () => {
      setup();
      selectWord();
      document.execCommand = vi.fn(() => true);

      await copy(view);
      await copy(view, true);

      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(document.execCommand).toHaveBeenCalledWith("cut");
      expect(writeText).not.toHaveBeenCalled();
    });

    it("copies and cuts plain text where the webview doesn't let it", async () => {
      setup();
      selectWord();
      document.execCommand = vi.fn(() => false);

      await copy(view);
      expect(writeText).toHaveBeenCalledWith("wrng");
      expect(text()).toBe("wrng text");

      await copy(view, true);
      expect(text()).toBe(" text");
    });

    it("pastes formatted text if the webview lets it read HTML", async () => {
      setup(doc(p("")));
      const html = new Blob(["<p><strong>bold</strong></p>"], {
        type: "text/html",
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          read: async () => [
            { types: ["text/plain"], getType: async () => new Blob(["x"]) },
            { types: ["text/html"], getType: async () => html },
          ],
        },
      });

      await paste(view);

      expect(text()).toBe("bold");
      expect(readText).not.toHaveBeenCalled();
    });

    it("pastes plain text otherwise, or when asked to", async () => {
      setup(doc(p("")));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { read: async () => [] },
      });
      vi.mocked(readText).mockResolvedValue("plain");

      await paste(view);
      expect(text()).toBe("plain");

      await paste(view, true);
      expect(text()).toBe("plainplain");

      vi.mocked(readText).mockResolvedValue("");
      await paste(view, true);
      expect(text()).toBe("plainplain");
    });
  });
});
