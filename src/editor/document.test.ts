import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { path as _path, transaction } from "../state";
import * as storage from "../storage";
import { doc, p } from "../test/editor";
import { mockCliArgs, mockTauriPath } from "../test/tauri";
import {
  applyDocument,
  applyInitialDocument,
  readDocumentFromCliArgs,
  readDocumentFromFile,
  restoreDocument,
  setDefaultDocument,
} from "./document";

import welcomeMessage from "./welcome.md?raw";

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
  transaction.value = null;
  mockTauriPath();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyDocument", () => {
  it("should apply the new document to the editor state", () => {
    const newState = applyDocument(emptyState(), hello);

    expect(newState.doc).toEqual(hello);
    expect(transaction.value?.doc).toEqual(hello);
    expect(_path.value).toBeNull();
  });

  it("should update the path if provided", () => {
    const newState = applyDocument(emptyState(), hello, "/path/to/document");

    expect(newState.doc).toEqual(hello);
    expect(_path.value).toBe("/path/to/document");
  });
});

describe("setDefaultDocument", () => {
  it("should set the welcome document to the editor state", () => {
    const newState = setDefaultDocument(emptyState());

    expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
    expect(transaction.value).not.toBeNull();
    expect(_path.value).toBeNull();
  });
});

describe("restoreDocument", () => {
  it("should restore the document from storage if it exists", async () => {
    const storedDoc = doc(p("Restored document!"));
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
    vi.spyOn(storage, "getPathfromStorage").mockResolvedValue("/stored.md");

    const newState = await restoreDocument(emptyState());

    expect(newState?.doc).toEqual(storedDoc);
    expect(transaction.value).not.toBeNull();
    expect(_path.value).toBe("/stored.md");
  });

  it("should return undefined if no document is found in storage", async () => {
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

    const newState = await restoreDocument(emptyState());

    expect(newState).toBeUndefined();
    expect(transaction.value).toBeNull();
    expect(_path.value).toBeNull();
  });
});

describe("readDocumentFromFile", () => {
  it("should read and apply the document from the given file path", async () => {
    mockFile("# Hello, world!");

    const newState = await readDocumentFromFile(emptyState(), "/doc.md");

    expect(newState?.doc).toEqual(
      defaultMarkdownParser.parse("# Hello, world!"),
    );
    expect(readTextFile).toHaveBeenCalledWith("/doc.md");
    expect(transaction.value).not.toBeNull();
    expect(_path.value).toBe("/doc.md");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("should return undefined for an empty path", async () => {
    const newState = await readDocumentFromFile(emptyState(), "");

    expect(newState).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("should return undefined if the file does not exist", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    const newState = await readDocumentFromFile(emptyState(), "/missing.md");

    expect(newState).toBeUndefined();
    expect(readTextFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      "File not found: /missing.md",
    );
  });

  it("should handle errors when reading the file", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue("Read error");

    const newState = await readDocumentFromFile(emptyState(), "/doc.md");

    expect(newState).toBeUndefined();
    expect(_path.value).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith(
      `Failed to read file: "Read error"`,
    );
  });

  it("should not send notifications if silent is true", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await readDocumentFromFile(emptyState(), "/missing.md", true);

    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue("Read error");
    await readDocumentFromFile(emptyState(), "/doc.md", true);

    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("readDocumentFromCliArgs", () => {
  it("should read the file passed as path argument", async () => {
    mockCliArgs("/cli.md");
    mockFile("from the cli");

    const newState = await readDocumentFromCliArgs(emptyState());

    expect(newState?.doc.textContent).toBe("from the cli");
    expect(_path.value).toBe("/cli.md");
  });

  it("should return undefined without a path argument", async () => {
    mockCliArgs();

    expect(await readDocumentFromCliArgs(emptyState())).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });
});

describe("applyInitialDocument", () => {
  const storedDoc = doc(p("stored"));

  it("should prefer the file passed on the command line", async () => {
    mockCliArgs("/cli.md");
    mockFile("from the cli");
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc.textContent).toBe("from the cli");
  });

  it("should fall back to the stored document", async () => {
    mockCliArgs();
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
    vi.spyOn(storage, "getPathfromStorage").mockResolvedValue(null);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc).toEqual(storedDoc);
  });

  it("should fall back to the welcome document", async () => {
    mockCliArgs("/missing.md");
    vi.mocked(exists).mockResolvedValue(false);
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
  });
});
