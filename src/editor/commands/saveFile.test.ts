import { beforeEach, describe, expect, it, vi } from "vitest";

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { importedFrom, path } from "../../state";
import { createState, doc, h, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import saveFile, { _saveFile } from "./saveFile";

const state = createState(doc(h(1, "Title"), p("Some text")));
const markdown = "# Title\n\nSome text";
const markdownFilter = { filters: [{ name: "Markdown", extensions: ["md"] }] };

describe("command.saveFile", () => {
  beforeEach(() => {
    path.value = null;
    importedFrom.value = null;
  });

  it("suggests a markdown file next to an imported Word document", async () => {
    importedFrom.value = "/docs/report.docx";
    vi.mocked(save).mockResolvedValue("/docs/report.md");

    await _saveFile(state, {});

    expect(save).toHaveBeenCalledWith({
      ...markdownFilter,
      defaultPath: "/docs/report.md",
    });
    expect(writeTextFile).toHaveBeenCalledWith("/docs/report.md", markdown);
    expect(path.value).toBe("/docs/report.md");
    expect(importedFrom.value).toBeNull();
  });

  it.each(["/docs/report.docx", "/docs/report.PDF", "/docs/notes.odt"])(
    "refuses to write markdown into %s",
    async (target) => {
      importedFrom.value = "/docs/report.docx";
      vi.mocked(save).mockResolvedValue(target);

      await _saveFile(state, {});

      expect(writeTextFile).not.toHaveBeenCalled();
      expect(path.value).toBeNull();
      expect(importedFrom.value).toBe("/docs/report.docx");
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("Choose a .md file name"),
      );
    },
  );

  it("asks for a new name instead of overwriting a Word document", async () => {
    path.value = "/docs/report.docx";
    vi.mocked(save).mockResolvedValue("/docs/report.md");

    await _saveFile(state, {});

    expect(save).toHaveBeenCalledWith({
      ...markdownFilter,
      defaultPath: "/docs/report.md",
    });
    expect(writeTextFile).toHaveBeenCalledWith("/docs/report.md", markdown);
  });

  it("writes to the current path without asking", async () => {
    path.value = "/notes.md";

    await _saveFile(state, {});

    expect(save).not.toHaveBeenCalled();
    expect(writeTextFile).toHaveBeenCalledWith("/notes.md", markdown);
    expect(sendNotification).toHaveBeenCalledWith("Your file has been saved");
  });

  it("asks for a path for an untitled document and remembers it", async () => {
    vi.mocked(save).mockResolvedValue("/new.md");

    await _saveFile(state, {});

    expect(save).toHaveBeenCalledWith(markdownFilter);
    expect(path.value).toBe("/new.md");
    expect(writeTextFile).toHaveBeenCalledWith("/new.md", markdown);
  });

  it("asks for a new path when forced (save as)", async () => {
    path.value = "/old.md";
    vi.mocked(save).mockResolvedValue("/copy.md");

    await _saveFile(state, { force: true });

    expect(save).toHaveBeenCalledOnce();
    expect(path.value).toBe("/copy.md");
    expect(writeTextFile).toHaveBeenCalledWith("/copy.md", markdown);
  });

  it("does nothing when the dialog is cancelled", async () => {
    path.value = "/old.md";
    vi.mocked(save).mockResolvedValue(null);

    await _saveFile(state, { force: true });

    expect(path.value).toBe("/old.md");
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("keeps the current file when saving as fails", async () => {
    path.value = "/old.md";
    vi.mocked(save).mockResolvedValue("/readonly/copy.md");
    vi.mocked(writeTextFile).mockRejectedValue("permission denied");

    await _saveFile(state, { force: true });

    expect(writeTextFile).toHaveBeenCalledWith("/readonly/copy.md", markdown);
    expect(path.value).toBe("/old.md");
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to save file: permission denied",
    );
  });

  it("stays untitled when the first save fails", async () => {
    vi.mocked(save).mockResolvedValue("/readonly/new.md");
    vi.mocked(writeTextFile).mockRejectedValue(new Error("disk full"));

    await _saveFile(state, {});

    expect(path.value).toBeNull();
  });

  it.each([
    ["an Error", new Error("disk full"), "disk full"],
    ["a string", "permission denied", "permission denied"],
    ["any other value", { code: 13 }, '{"code":13}'],
  ])("reports a failed write with %s", async (_, error, message) => {
    path.value = "/notes.md";
    vi.mocked(writeTextFile).mockRejectedValue(error);

    await _saveFile(state, {});

    expect(sendNotification).toHaveBeenCalledWith(
      `Failed to save file: ${message}`,
    );
  });

  describe("command", () => {
    it("saves in the background and returns true", async () => {
      path.value = "/notes.md";

      expect(saveFile()(state)).toBe(true);
      await flushPromises();

      expect(save).not.toHaveBeenCalled();
      expect(writeTextFile).toHaveBeenCalledWith("/notes.md", markdown);
    });

    it("passes the force option on", async () => {
      path.value = "/notes.md";
      vi.mocked(save).mockResolvedValue(null);

      expect(saveFile({ force: true })(state)).toBe(true);
      await flushPromises();

      expect(save).toHaveBeenCalledOnce();
    });
  });
});
