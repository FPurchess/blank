import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { mockIPC } from "@tauri-apps/api/mocks";
import { markdownParser, schema } from "../markdown";

import { exists, readFile, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { path as _path, importedFrom, transaction } from "../state";
import { importDocx } from "../importers/docx";
import { doc, p, table, td, th, tr } from "../test/editor";
import { tableGuard } from "./plugins";
import { mockTauriPath } from "../test/tauri";
import {
  documentState,
  emptyDocument,
  readDocument,
  showDocument,
  welcomeDocument,
} from "./document";

import welcomeMessage from "./welcome.md?raw";

vi.mock("../importers/docx", () => ({ importDocx: vi.fn() }));

const emptyState = () => EditorState.create({ schema });
const hello = doc(p("Hello, world!"));

/**
 * mockFile makes the fs plugin report a file with `content` at any path.
 */
const mockFile = (content: string) => {
  vi.mocked(exists).mockResolvedValue(true);
  vi.mocked(readTextFile).mockResolvedValue(content);
};

beforeEach(() => {
  _path.value = null;
  importedFrom.value = null;
  transaction.value = null;
  mockTauriPath();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("documentState", () => {
  it("builds the state of the document", () => {
    expect(documentState(emptyState(), hello).doc).toEqual(hello);
  });

  it("keeps the plugins and starts a fresh history", () => {
    const state = EditorState.create({ schema, plugins: [history()] });

    const next = documentState(state, hello);

    expect(next.plugins).toEqual(state.plugins);
    expect(undo(next)).toBe(false);
  });

  it("keeps the paragraphs next to tables right away, with nothing to undo", () => {
    const state = EditorState.create({
      schema,
      plugins: [history(), tableGuard()],
    });
    const startsWithTable = doc(table(tr(th("a")), tr(td("b"))));

    const next = documentState(state, startsWithTable);

    expect(next.doc.eq(doc(p(), ...startsWithTable.children, p()))).toBe(true);
    expect(undo(next)).toBe(false);
  });
});

describe("showDocument", () => {
  it("publishes the document and where it comes from", () => {
    _path.value = "/before.md";
    const state = documentState(emptyState(), hello);

    showDocument(state, { path: null, importedFrom: "/report.docx" });

    expect(transaction.value?.doc).toBe(state.doc);
    expect(_path.value).toBeNull();
    expect(importedFrom.value).toBe("/report.docx");
  });
});

describe("welcomeDocument and emptyDocument", () => {
  it("returns the welcome document", () => {
    expect(welcomeDocument()).toEqual(markdownParser.parse(welcomeMessage));
  });

  it("returns one empty paragraph", () => {
    expect(emptyDocument()).toEqual(doc(p()));
  });
});

describe("readDocument", () => {
  it("reads the document at the given path", async () => {
    mockFile("# Hello, world!");

    const loaded = await readDocument("/doc.md");

    expect(loaded?.doc).toEqual(markdownParser.parse("# Hello, world!"));
    expect(loaded?.path).toBe("/doc.md");
    expect(loaded?.importedFrom).toBeNull();
    expect(readTextFile).toHaveBeenCalledWith("/doc.md");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("should read and remember the resolved path of a relative one", async () => {
    mockIPC(((cmd: string, args?: { paths?: string[] }) => {
      if (cmd === "plugin:path|resolve")
        return "/cwd/" + args?.paths?.join("/");
    }) as Parameters<typeof mockIPC>[0]);
    mockFile("relative");

    const loaded = await readDocument("../x.md");

    expect(loaded?.doc.textContent).toBe("relative");
    expect(exists).toHaveBeenCalledWith("/cwd/../x.md");
    expect(readTextFile).toHaveBeenCalledWith("/cwd/../x.md");
    expect(loaded?.path).toBe("/cwd/../x.md");
  });

  it("should return undefined for an empty path", async () => {
    const loaded = await readDocument("");

    expect(loaded).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("should return undefined if the file does not exist", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    const loaded = await readDocument("/missing.md");

    expect(loaded).toBeUndefined();
    expect(readTextFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      "File not found: /missing.md",
    );
  });

  it("should handle errors when reading the file", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue("Read error");

    const loaded = await readDocument("/doc.md");

    expect(loaded).toBeUndefined();
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to read file: Read error",
    );
  });

  it("should not send notifications if silent is true", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await readDocument("/missing.md", true);

    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue("Read error");
    await readDocument("/doc.md", true);

    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("readDocument with a Word document", () => {
  const imported = doc(p("From Word"));
  const bytes = new Uint8Array([0x50, 0x4b]);

  beforeEach(() => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(stat).mockResolvedValue({ size: 1000 } as Awaited<
      ReturnType<typeof stat>
    >);
    vi.mocked(readFile).mockResolvedValue(bytes);
    vi.mocked(importDocx).mockResolvedValue({
      doc: imported,
      warnings: [],
      page: null,
    });
  });

  it("imports it into an untitled document", async () => {
    const loaded = await readDocument("/docs/Report.DOCX");

    expect(importDocx).toHaveBeenCalledWith(bytes);
    expect(loaded?.doc).toEqual(imported);
    // saving must not overwrite the Word document
    expect(loaded?.path).toBeNull();
    expect(loaded?.importedFrom).toBe("/docs/Report.DOCX");
    expect(readTextFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      "Imported Report.DOCX. Save it with Mod+S as a markdown file",
    );
  });

  it("tells which page setup came along", async () => {
    vi.mocked(importDocx).mockResolvedValue({
      doc: imported,
      warnings: [],
      page: "Letter landscape",
    });

    await readDocument("/docs/Report.docx");

    expect(sendNotification).toHaveBeenCalledWith(
      "Imported Report.docx. Save it with Mod+S as a markdown file. Its Letter landscape pages came along",
    );
  });

  it("reports what the import left out", async () => {
    vi.mocked(importDocx).mockResolvedValue({
      doc: imported,
      warnings: ["1 table inside a table became text", "2 comments left out"],
      page: null,
    });

    await readDocument("/report.docx");

    expect(sendNotification).toHaveBeenCalledWith(
      "Imported report.docx. Save it with Mod+S as a markdown file. 1 table inside a table became text. 2 comments left out",
    );
  });

  it("refuses documents larger than 50 MB", async () => {
    vi.mocked(stat).mockResolvedValue({ size: 50 * 1024 * 1024 + 1 } as Awaited<
      ReturnType<typeof stat>
    >);

    expect(await readDocument("/big.docx")).toBeUndefined();

    expect(readFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to import big.docx: the file is larger than 50 MB",
    );
  });

  it("reports documents it can't import", async () => {
    vi.mocked(importDocx).mockRejectedValue(new Error("not a Word document"));

    expect(await readDocument("/fake.docx")).toBeUndefined();

    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to import fake.docx: not a Word document",
    );
  });

  it("stays silent when asked to", async () => {
    await readDocument("/report.docx", true);
    vi.mocked(importDocx).mockRejectedValue("broken");
    await readDocument("/broken.docx", true);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it.each(["doc", "odt", "rtf", "pages"])(
    "refuses .%s files instead of reading them as markdown",
    async (extension) => {
      expect(await readDocument(`/old.${extension}`)).toBeUndefined();

      expect(readTextFile).not.toHaveBeenCalled();
      expect(sendNotification).toHaveBeenCalledWith(
        `Blank can't read .${extension} files. Save it as .docx and open that.`,
      );
    },
  );
});
