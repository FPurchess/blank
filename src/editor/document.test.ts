import { beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { mockIPC } from "@tauri-apps/api/mocks";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

import { getMatches } from "@tauri-apps/plugin-cli";
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

  it("should keep the plugins and start a fresh history", () => {
    const state = EditorState.create({ schema, plugins: [history()] });

    const newState = applyDocument(state, hello);

    expect(newState.plugins).toEqual(state.plugins);
    expect(undo(newState)).toBe(false);
    expect(transaction.value?.doc).toBe(newState.doc);
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

  it("should read and remember the resolved path of a relative one", async () => {
    mockIPC(((cmd: string, args?: { paths?: string[] }) => {
      if (cmd === "plugin:path|resolve")
        return "/cwd/" + args?.paths?.join("/");
    }) as Parameters<typeof mockIPC>[0]);
    mockFile("relative");

    const newState = await readDocumentFromFile(emptyState(), "../x.md");

    expect(newState?.doc.textContent).toBe("relative");
    expect(exists).toHaveBeenCalledWith("/cwd/../x.md");
    expect(readTextFile).toHaveBeenCalledWith("/cwd/../x.md");
    expect(_path.value).toBe("/cwd/../x.md");
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

  describe("can't undo the loaded document", () => {
    const withHistory = () =>
      EditorState.create({ schema, plugins: [history()] });

    it("from the command line", async () => {
      mockCliArgs("/cli.md");
      mockFile("from the cli");

      const newState = await applyInitialDocument(withHistory());

      expect(newState.doc.textContent).toBe("from the cli");
      expect(undo(newState)).toBe(false);
    });

    it("from storage", async () => {
      mockCliArgs();
      vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
      vi.spyOn(storage, "getPathfromStorage").mockResolvedValue("/stored.md");

      const newState = await applyInitialDocument(withHistory());

      expect(newState.doc).toEqual(storedDoc);
      expect(undo(newState)).toBe(false);
    });

    it("the welcome document", async () => {
      mockCliArgs();
      vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

      const newState = await applyInitialDocument(withHistory());

      expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
      expect(undo(newState)).toBe(false);
    });
  });

  it("should fall back to the welcome document", async () => {
    mockCliArgs("/missing.md");
    vi.mocked(exists).mockResolvedValue(false);
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
  });
  it("should notify and fall back when the command-line arguments are invalid", async () => {
    vi.mocked(getMatches).mockRejectedValue(
      "Found argument 'b.md' which wasn't expected",
    );
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
    vi.spyOn(storage, "getPathfromStorage").mockResolvedValue(null);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc).toEqual(storedDoc);
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Blank opens one file at a time.*Found argument 'b\.md' which wasn't expected$/,
      ),
    );
  });

  it.each([
    [{ code: 2 }, '{"code":2}'],
    [undefined, "undefined"],
    [BigInt(1), "1"],
  ])(
    "should describe a command-line error of %s as %j",
    async (error, text) => {
      vi.mocked(getMatches).mockRejectedValue(error);
      vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

      await applyInitialDocument(emptyState());

      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`: ${text}$`)),
      );
    },
  );

  it("should fall back when the file from the command line can't be checked", async () => {
    mockCliArgs("/cli.md");
    vi.mocked(exists).mockRejectedValue(new Error("forbidden"));
    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
    vi.spyOn(storage, "getPathfromStorage").mockResolvedValue(null);

    const newState = await applyInitialDocument(emptyState());

    expect(newState.doc).toEqual(storedDoc);
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to open file: forbidden",
    );
  });

  describe("with a stored document that can't be restored", () => {
    const corrupt = { type: "doc", content: [{ type: "no_such_node" }] };

    beforeEach(async () => {
      await localforage.clear();
      await localforage.setItem("doc", corrupt);
      mockCliArgs();
    });

    it("should back it up and fall back to the welcome document", async () => {
      const newState = await applyInitialDocument(emptyState());

      expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
      expect(await localforage.getItem("doc-backup")).toEqual(corrupt);
      expect(sendNotification).toHaveBeenCalledOnce();
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('A copy was kept as "doc-backup".'),
      );
    });

    it("should still start when the backup fails", async () => {
      vi.spyOn(localforage, "setItem").mockRejectedValue(new Error("full"));

      const newState = await applyInitialDocument(emptyState());

      expect(newState.doc).toEqual(defaultMarkdownParser.parse(welcomeMessage));
      expect(sendNotification).toHaveBeenCalledWith(
        expect.not.stringContaining("doc-backup"),
      );
    });
  });
});
