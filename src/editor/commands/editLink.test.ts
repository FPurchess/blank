import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { schema } from "prosemirror-markdown";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { linkDialog, type LinkDialogRequest } from "../../state";
import { deferred, flushPromises } from "../../test/async";
import {
  codeBlock,
  createState,
  createTestView,
  doc,
  p,
  type StateOptions,
} from "../../test/editor";
import editLink, { _openLinkDialog, findLinkTarget } from "./editLink";

const link = (href: string, title: string | null = null) =>
  schema.marks.link.create({ href, title });
const text = (content: string, marks = [] as ReturnType<typeof link>[]) =>
  schema.text(content, marks);
const para = (...nodes: Node[]) => schema.node("paragraph", null, nodes);

// "see " + link "Blank" + " now": the link spans the positions 5 to 10
const withLink = (href = "https://blank.app", title: string | null = null) =>
  doc(para(text("see "), text("Blank", [link(href, title)]), text(" now")));

/**
 * setup creates a test view of `node` that also supports `focus`
 */
const setup = (node: Node, options: StateOptions = {}) => {
  const view = createTestView(
    createState(node, { ...options, plugins: [history()] }),
  );
  view.focus = vi.fn();
  return view;
};

/**
 * open runs the command and returns the dialog request it creates
 */
const open = async (view: ReturnType<typeof setup>) => {
  expect(editLink()(view.state, view.dispatch, view)).toBe(true);
  await vi.waitFor(() => expect(linkDialog.value).not.toBeNull());
  return linkDialog.value as LinkDialogRequest;
};

describe("command.editLink", () => {
  beforeEach(() => {
    linkDialog.value = null;
    vi.mocked(readText).mockResolvedValue("");
  });

  describe("findLinkTarget", () => {
    it.each([
      ["in the middle", 7],
      ["at the start", 5],
      ["at the end", 10],
    ])("finds the link with the cursor %s of it", (_, cursor) => {
      const state = createState(withLink(), { cursor });

      expect(findLinkTarget(state)).toEqual({
        from: 5,
        to: 10,
        text: "Blank",
        mark: link("https://blank.app"),
      });
    });

    it("finds a selection inside a link", () => {
      const state = createState(withLink(), { cursor: [6, 8] });

      expect(findLinkTarget(state)).toMatchObject({ from: 5, to: 10 });
    });

    it("prefers the link before the cursor between two links", () => {
      const node = doc(
        para(text("one", [link("https://one.app")]), text("two", [link("x")])),
      );
      const state = createState(node, { cursor: 4 });

      expect(findLinkTarget(state)).toMatchObject({
        from: 1,
        to: 4,
        text: "one",
        mark: link("https://one.app"),
      });
    });

    it("treats a selection partly overlapping a link as a new link", () => {
      const state = createState(withLink(), { cursor: [7, 13] });

      expect(findLinkTarget(state)).toEqual({
        from: 7,
        to: 13,
        text: "ank no",
        mark: null,
      });
    });

    it("uses the selected text for a new link", () => {
      const state = createState(doc(p("some text")), { cursor: [6, 10] });

      expect(findLinkTarget(state)).toEqual({
        from: 6,
        to: 10,
        text: "text",
        mark: null,
      });
    });

    it("uses an empty text for a bare cursor", () => {
      const state = createState(doc(p("text")), { cursor: 3 });

      expect(findLinkTarget(state)).toEqual({
        from: 3,
        to: 3,
        text: "",
        mark: null,
      });
    });

    it("shows a hard break as a space", () => {
      const node = doc(
        para(text("a"), schema.nodes.hard_break.create(), text("b")),
      );
      const state = createState(node, { cursor: [1, 4] });

      expect(findLinkTarget(state)?.text).toBe("a b");
    });

    it("finds nothing in a code block", () => {
      const state = createState(doc(codeBlock("code")), { cursor: 2 });

      expect(findLinkTarget(state)).toBeNull();
    });

    it("finds nothing for a selection across blocks", () => {
      const state = createState(doc(p("one"), p("two")), { cursor: [2, 7] });

      expect(findLinkTarget(state)).toBeNull();
    });

    it("finds nothing for a selected horizontal rule", () => {
      const state = createState(
        doc(p("one"), schema.nodes.horizontal_rule.create()),
      );
      const selected = state.apply(
        state.tr.setSelection(NodeSelection.create(state.doc, 5)),
      );

      expect(findLinkTarget(selected)).toBeNull();
    });
  });

  describe("opening the dialog", () => {
    it("prefills the URL from the clipboard", async () => {
      vi.mocked(readText).mockResolvedValue(" https://example.com/a b\n");
      const view = setup(doc(p("some text")), { cursor: [6, 10] });

      expect(await open(view)).toMatchObject({
        url: "https://example.com/a%20b",
        text: "text",
        isEdit: false,
      });
    });

    it.each([
      ["text that is no URL", () => mockClipboard("not a url")],
      ["an unsafe URL", () => mockClipboard("javascript:alert(1)")],
      ["a failing read", () => vi.mocked(readText).mockRejectedValue("empty")],
      [
        "no clipboard text",
        () =>
          vi.mocked(readText).mockResolvedValue(undefined as unknown as string),
      ],
    ])("leaves the URL empty for %s", async (_, mock) => {
      mock();
      const view = setup(doc(p("text")));

      expect((await open(view)).url).toBe("");
    });

    it("prefills an existing link without reading the clipboard", async () => {
      vi.mocked(readText).mockResolvedValue("https://example.com");
      const view = setup(withLink(), { cursor: 7 });

      expect(await open(view)).toMatchObject({
        url: "https://blank.app",
        text: "Blank",
        isEdit: true,
      });
      expect(readText).not.toHaveBeenCalled();
    });

    it("ignores Mod+K while the dialog is opening or open", async () => {
      const clipboard = deferred<string>();
      vi.mocked(readText).mockReturnValue(clipboard.promise);
      const view = setup(doc(p("text")));

      editLink()(view.state, view.dispatch, view);
      editLink()(view.state, view.dispatch, view);
      clipboard.resolve("");
      await open(view);
      expect(editLink()(view.state, view.dispatch, view)).toBe(true);
      await flushPromises();

      expect(readText).toHaveBeenCalledTimes(1);
    });

    it("uses the selection after the clipboard was read", async () => {
      const clipboard = deferred<string>();
      vi.mocked(readText).mockReturnValue(clipboard.promise);
      const view = setup(doc(p("some text")), { cursor: [1, 5] });

      const opened = _openLinkDialog(view);
      view.dispatch(view.state.tr.setSelection(createSelection(view, 6, 10)));
      clipboard.resolve("");
      await opened;

      expect(linkDialog.value?.text).toBe("text");
    });

    it("does nothing when the selection moved into a code block", async () => {
      const clipboard = deferred<string>();
      vi.mocked(readText).mockReturnValue(clipboard.promise);
      const view = setup(doc(p("text"), codeBlock("code")), { cursor: 2 });

      const opened = _openLinkDialog(view);
      view.dispatch(view.state.tr.setSelection(createSelection(view, 9, 9)));
      clipboard.resolve("");
      await opened;

      expect(linkDialog.value).toBeNull();
    });

    it("only checks applicability without dispatch", () => {
      expect(editLink()(createState(doc(p("text"))))).toBe(true);
      expect(editLink()(createState(doc(codeBlock("code"))))).toBe(false);
      expect(readText).not.toHaveBeenCalled();
    });
  });

  describe("submit", () => {
    it("links the selected text", async () => {
      const view = setup(doc(p("some text")), { cursor: [6, 10] });

      (await open(view)).submit("https://example.com", "text");

      expect(view.state.doc.toJSON()).toEqual(
        doc(
          para(text("some "), text("text", [link("https://example.com")])),
        ).toJSON(),
      );
      expect(view.state.selection.from).toBe(10);
      expect(view.focus).toHaveBeenCalled();
    });

    it("inserts the URL as link text at a bare cursor", async () => {
      const view = setup(doc(p("see ")));

      (await open(view)).submit("https://example.com", "  ");

      expect(view.state.doc.toJSON()).toEqual(
        doc(
          para(
            text("see "),
            text("https://example.com", [link("https://example.com")]),
          ),
        ).toJSON(),
      );
      expect(view.state.selection.from).toBe(24);
    });

    it("edits a link and keeps its title and formatting", async () => {
      const bold = schema.marks.strong.create();
      const old = link("https://old.app", "Title");
      const node = doc(para(text("Bl", [bold, old]), text("ank", [old])));
      const view = setup(node, { cursor: 2 });

      (await open(view)).submit("https://new.app", "Blank");

      const updated = link("https://new.app", "Title");
      expect(view.state.doc.toJSON()).toEqual(
        doc(para(text("Bl", [bold, updated]), text("ank", [updated]))).toJSON(),
      );
    });

    it("replaces the text and keeps the marks of its start", async () => {
      const em = schema.marks.em.create();
      const view = setup(doc(para(text("some", [em]), text(" text"))), {
        cursor: [1, 10],
      });

      (await open(view)).submit("https://example.com", "Example");

      expect(view.state.doc.toJSON()).toEqual(
        doc(para(text("Example", [em, link("https://example.com")]))).toJSON(),
      );
      expect(view.state.selection.from).toBe(8);
    });

    it("encodes spaces in the URL", async () => {
      const view = setup(doc(p("text")), { cursor: [1, 5] });

      (await open(view)).submit(" https://example.com/a b ", "text");

      expect(view.state.doc.firstChild?.firstChild?.marks).toEqual([
        link("https://example.com/a%20b"),
      ]);
    });

    it.each(["", "javascript:alert(1)"])("ignores the URL %j", async (url) => {
      const view = setup(doc(p("text")), { cursor: [1, 5] });
      const before = view.state.doc;

      (await open(view)).submit(url, "text");

      expect(view.state.doc).toBe(before);
      expect(view.focus).toHaveBeenCalled();
    });

    it("aborts when the document changed", async () => {
      const view = setup(doc(p("text")), { cursor: [1, 5] });
      const request = await open(view);
      view.dispatch(view.state.tr.insertText("new "));
      const changed = view.state.doc;

      request.submit("https://example.com", "text");

      expect(view.state.doc).toBe(changed);
      expect(sendNotification).toHaveBeenCalledWith(
        "Failed to change the link: the document changed",
      );
    });

    it("is undone in one step", async () => {
      const view = setup(doc(p("some text")), { cursor: [6, 10] });
      const before = view.state.doc;

      (await open(view)).submit("https://example.com", "Example");
      undo(view.state, view.dispatch);

      expect(view.state.doc.toJSON()).toEqual(before.toJSON());
    });
  });

  it("converts a link to text", async () => {
    const view = setup(withLink(), { cursor: 7 });

    (await open(view)).convertToText();

    expect(view.state.doc.toJSON()).toEqual(doc(p("see Blank now")).toJSON());
    expect(view.focus).toHaveBeenCalled();
  });

  it("returns the focus on cancel", async () => {
    const view = setup(doc(p("text")));
    const before = view.state.doc;

    (await open(view)).cancel();

    expect(view.state.doc).toBe(before);
    expect(view.focus).toHaveBeenCalled();
  });
});

const mockClipboard = (content: string) =>
  vi.mocked(readText).mockResolvedValue(content);

const createSelection = (
  view: ReturnType<typeof setup>,
  from: number,
  to: number,
) => TextSelection.create(view.state.doc, from, to);
