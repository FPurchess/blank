import { describe, expect, it, vi } from "vitest";

import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import * as documentModule from "../document";
import { createState, doc, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import openFile from "./openFile";

const state = createState(doc(p("current")));

describe("command.openFile", () => {
  it("reads the markdown file chosen in the dialog", async () => {
    vi.mocked(open).mockResolvedValue("/notes.md");
    const read = vi
      .spyOn(documentModule, "readDocumentFromFile")
      .mockResolvedValue(undefined);

    expect(openFile()(state)).toBe(true);
    await flushPromises();

    expect(open).toHaveBeenCalledWith({
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    expect(read).toHaveBeenCalledWith(state, "/notes.md");
  });

  it("does nothing when the dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const read = vi.spyOn(documentModule, "readDocumentFromFile");

    openFile()(state);
    await flushPromises();

    expect(read).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reports a failing dialog", async () => {
    vi.mocked(open).mockRejectedValue("dialog broke");
    const read = vi.spyOn(documentModule, "readDocumentFromFile");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    openFile()(state);
    await flushPromises();

    expect(read).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to open file: "dialog broke"',
    );
    expect(sendNotification).toHaveBeenCalledWith(
      'Failed to open file: "dialog broke"',
    );
  });
});
