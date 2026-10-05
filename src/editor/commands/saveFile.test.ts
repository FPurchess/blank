import { beforeEach, describe, expect, it, vi } from "vitest";

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { createState, doc, h, p } from "../../test/editor";
import type { DocumentFile } from "../document";
import { _saveFile } from "./saveFile";

const state = createState(doc(h(1, "Title"), p("Some text")));
const markdown = "# Title\n\nSome text";
const markdownFilter = { filters: [{ name: "Markdown", extensions: ["md"] }] };

// the document's file, set by each test
let file: DocumentFile;
// where it was saved, by the last _saveFile
let saved: string | null;

describe("_saveFile", () => {
  beforeEach(() => {
    file = { path: null, importedFrom: null };
  });

  it("suggests a markdown file next to an imported Word document", async () => {
    file.importedFrom = "/docs/report.docx";
    vi.mocked(save).mockResolvedValue("/docs/report.md");

    saved = await _saveFile(state, file, {});

    expect(save).toHaveBeenCalledWith({
      ...markdownFilter,
      defaultPath: "/docs/report.md",
    });
    expect(writeTextFile).toHaveBeenCalledWith("/docs/report.md", markdown);
    expect(saved).toBe("/docs/report.md");
  });

  it.each(["/docs/report.docx", "/docs/report.PDF", "/docs/notes.odt"])(
    "refuses to write markdown into %s",
    async (target) => {
      file.importedFrom = "/docs/report.docx";
      vi.mocked(save).mockResolvedValue(target);

      saved = await _saveFile(state, file, {});

      expect(writeTextFile).not.toHaveBeenCalled();
      expect(saved).toBeNull();
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("Choose a .md file name"),
      );
    },
  );

  it("asks for a new name instead of overwriting a Word document", async () => {
    file.path = "/docs/report.docx";
    vi.mocked(save).mockResolvedValue("/docs/report.md");

    saved = await _saveFile(state, file, {});

    expect(save).toHaveBeenCalledWith({
      ...markdownFilter,
      defaultPath: "/docs/report.md",
    });
    expect(writeTextFile).toHaveBeenCalledWith("/docs/report.md", markdown);
  });

  it("writes to the current path without asking", async () => {
    file.path = "/notes.md";

    saved = await _saveFile(state, file, {});

    expect(save).not.toHaveBeenCalled();
    expect(writeTextFile).toHaveBeenCalledWith("/notes.md", markdown);
    expect(saved).toBe("/notes.md");
    expect(sendNotification).toHaveBeenCalledWith("Your file has been saved");
  });

  it("asks for a path for an untitled document and remembers it", async () => {
    vi.mocked(save).mockResolvedValue("/new.md");

    saved = await _saveFile(state, file, {});

    expect(save).toHaveBeenCalledWith(markdownFilter);
    expect(saved).toBe("/new.md");
    expect(writeTextFile).toHaveBeenCalledWith("/new.md", markdown);
  });

  it("asks for a new path when forced (save as)", async () => {
    file.path = "/old.md";
    vi.mocked(save).mockResolvedValue("/copy.md");

    saved = await _saveFile(state, file, { force: true });

    expect(save).toHaveBeenCalledOnce();
    expect(saved).toBe("/copy.md");
    expect(writeTextFile).toHaveBeenCalledWith("/copy.md", markdown);
  });

  it("does nothing when the dialog is cancelled", async () => {
    file.path = "/old.md";
    vi.mocked(save).mockResolvedValue(null);

    saved = await _saveFile(state, file, { force: true });

    expect(saved).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("keeps the current file when saving as fails", async () => {
    file.path = "/old.md";
    vi.mocked(save).mockResolvedValue("/readonly/copy.md");
    vi.mocked(writeTextFile).mockRejectedValue("permission denied");

    saved = await _saveFile(state, file, { force: true });

    expect(writeTextFile).toHaveBeenCalledWith("/readonly/copy.md", markdown);
    expect(saved).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to save file: permission denied",
    );
  });

  it("stays untitled when the first save fails", async () => {
    vi.mocked(save).mockResolvedValue("/readonly/new.md");
    vi.mocked(writeTextFile).mockRejectedValue(new Error("disk full"));

    saved = await _saveFile(state, file, {});

    expect(saved).toBeNull();
  });

  it.each([
    ["an Error", new Error("disk full"), "disk full"],
    ["a string", "permission denied", "permission denied"],
    ["any other value", { code: 13 }, '{"code":13}'],
  ])("reports a failed write with %s", async (_, error, message) => {
    file.path = "/notes.md";
    vi.mocked(writeTextFile).mockRejectedValue(error);

    saved = await _saveFile(state, file, {});

    expect(sendNotification).toHaveBeenCalledWith(
      `Failed to save file: ${message}`,
    );
  });
});
