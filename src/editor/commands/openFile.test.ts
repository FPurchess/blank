import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMarkdownParser } from "prosemirror-markdown";

import { open } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { path, transaction } from "../../state";
import { createState, createTestView, doc, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import { mockTauriPath } from "../../test/tauri";
import openFile from "./openFile";
import { _saveFile } from "./saveFile";

const opened = "# Notes\n\nFrom the file.";

describe("command.openFile", () => {
  beforeEach(() => {
    path.value = null;
    transaction.value = null;
    mockTauriPath();
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(opened);
  });

  it("shows the markdown file chosen in the dialog", async () => {
    vi.mocked(open).mockResolvedValue("/notes.md");
    const view = createTestView(createState(doc(p("current"))));

    expect(openFile()(view.state, undefined, view)).toBe(true);
    await vi.waitFor(() => expect(path.value).toBe("/notes.md"));

    expect(open).toHaveBeenCalledWith({
      filters: [
        { name: "Documents", extensions: ["md", "docx"] },
        { name: "Markdown", extensions: ["md"] },
        { name: "Word Document", extensions: ["docx"] },
      ],
    });
    expect(readTextFile).toHaveBeenCalledWith("/notes.md");
    expect(view.state.doc.eq(defaultMarkdownParser.parse(opened))).toBe(true);
    expect(transaction.value?.doc.eq(view.state.doc)).toBe(true);
  });

  it("saves the opened content, not the previous document", async () => {
    vi.mocked(open).mockResolvedValue("/notes.md");
    const view = createTestView(createState(doc(p("current"))));

    openFile()(view.state, undefined, view);
    await vi.waitFor(() => expect(path.value).toBe("/notes.md"));
    await _saveFile(view.state, {});

    expect(writeTextFile).toHaveBeenCalledWith("/notes.md", opened);
  });

  it("keeps the document when the file can't be read", async () => {
    vi.mocked(open).mockResolvedValue("/missing.md");
    vi.mocked(exists).mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = createTestView(createState(doc(p("current"))));
    const before = view.state;

    openFile()(view.state, undefined, view);
    await vi.waitFor(() =>
      expect(sendNotification).toHaveBeenCalledWith(
        "File not found: /missing.md",
      ),
    );

    expect(view.state).toBe(before);
    expect(path.value).toBeNull();
  });

  it("needs a view", () => {
    expect(openFile()(createState(doc(p("current"))))).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("does nothing when the dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const view = createTestView(createState(doc(p("current"))));
    const before = view.state;

    openFile()(view.state, undefined, view);
    await flushPromises();

    expect(readTextFile).not.toHaveBeenCalled();
    expect(view.state).toBe(before);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reports a failing dialog", async () => {
    vi.mocked(open).mockRejectedValue("dialog broke");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const view = createTestView(createState(doc(p("current"))));

    openFile()(view.state, undefined, view);
    await flushPromises();

    expect(readTextFile).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to open file: "dialog broke"',
    );
    expect(sendNotification).toHaveBeenCalledWith(
      'Failed to open file: "dialog broke"',
    );
  });
});
