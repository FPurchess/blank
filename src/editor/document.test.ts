// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { EditorState } from "prosemirror-state";
import { Node } from "prosemirror-model";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

// import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { path as _path, transaction } from "../state";
import {
  applyDocument,
  readDocumentFromFile,
  setDefaultDocument,
} from "./document";

import welcomeMessage from "./welcome.md?raw";
import { restoreDocument } from "./document";
import * as storage from "../storage";
import { mockIPC } from "@tauri-apps/api/mocks";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

beforeEach(() => {
  _path.value = null;
  transaction.value = null;
});

describe("applyDocument", () => {
  it("should apply the new document to the editor state", () => {
    const initialState = EditorState.create({ schema });
    const newDoc = Node.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello, world!" }],
        },
      ],
    });

    const newState = applyDocument(initialState, newDoc);

    expect(newState.doc).toEqual(newDoc);
    expect(transaction.value).toBeDefined();
  });

  it("should update the path if provided", () => {
    const initialState = EditorState.create({ schema });
    const newDoc = Node.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello, world!" }],
        },
      ],
    });

    const path = "/path/to/document";
    const newState = applyDocument(initialState, newDoc, path);

    expect(newState.doc).toEqual(newDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBe(path);
  });

  it("should not update the path if not provided", () => {
    const initialState = EditorState.create({ schema });
    const newDoc = Node.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello, world!" }],
        },
      ],
    });

    const newState = applyDocument(initialState, newDoc);

    expect(newState.doc).toEqual(newDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBeNull();
  });
});

describe("setDefaultDocument", () => {
  it("should set the welcome document to the editor state", () => {
    const initialState = EditorState.create({ schema });
    const newState = setDefaultDocument(initialState);
    const expectedDoc = defaultMarkdownParser.parse(welcomeMessage);

    expect(newState.doc).toEqual(expectedDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBeNull();
  });
});

describe("restoreDocument", () => {
  it("should restore the document from storage if it exists", async () => {
    const initialState = EditorState.create({ schema });
    const storedDoc = Node.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Restored document!" }],
        },
      ],
    });
    const storedPath = "/path/to/stored/document";

    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(storedDoc);
    vi.spyOn(storage, "getPathfromStorage").mockResolvedValue(storedPath);

    const newState = await restoreDocument(initialState);

    expect(newState?.doc).toEqual(storedDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBe(storedPath);
  });

  it("should return undefined if no document is found in storage", async () => {
    const initialState = EditorState.create({ schema });

    vi.spyOn(storage, "getDocumentFromStorage").mockResolvedValue(undefined);

    const newState = await restoreDocument(initialState);

    expect(newState).toBeUndefined();
    expect(transaction.value).toBeNull();
    expect(_path.value).toBeNull();
  });
});

describe("readDocumentFromFile", () => {
  mockIPC(async (cmd, args) => {
    if (cmd === "plugin:path|resolve")
      return (args as unknown as { [key: string]: string[] })["paths"];
    return Promise.resolve(undefined);
  });

  it("should read and apply the document from the given file path", async () => {
    const initialState = EditorState.create({ schema });
    const filePath = "/path/to/document.md";
    const fileContent = "# Hello, world!";
    const expectedDoc = defaultMarkdownParser.parse(fileContent);

    (exists as MockedFunction<typeof exists>).mockResolvedValue(true);
    (readTextFile as MockedFunction<typeof readTextFile>).mockResolvedValue(
      fileContent,
    );
    const newState = await readDocumentFromFile(initialState, filePath);

    expect(newState?.doc).toEqual(expectedDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBe(filePath);
  });

  it("should return undefined if the file does not exist", async () => {
    const initialState = EditorState.create({ schema });
    const filePath = "/path/to/nonexistent.md";

    (exists as MockedFunction<typeof exists>).mockResolvedValue(false);
    const newState = await readDocumentFromFile(initialState, filePath);

    expect(newState).toBeUndefined();
    expect(sendNotification).toHaveBeenCalledWith(
      `File not found: ${filePath}`,
    );
  });

  it("should handle errors when reading the file", async () => {
    const initialState = EditorState.create({ schema });
    const filePath = "/path/to/document.md";

    (exists as MockedFunction<typeof exists>).mockResolvedValue(true);
    (readTextFile as MockedFunction<typeof readTextFile>).mockRejectedValue(
      "Read error",
    );
    const newState = await readDocumentFromFile(initialState, filePath);

    expect(newState).toBeUndefined();
    expect(sendNotification).toHaveBeenCalledWith(
      `Failed to read file: "Read error"`,
    );
  });

  it("should not send notifications if silent is true", async () => {
    const initialState = EditorState.create({ schema });
    const filePath = "/path/to/document.md";
    const fileContent = "# Hello, world!";
    const expectedDoc = defaultMarkdownParser.parse(fileContent);

    (exists as MockedFunction<typeof exists>).mockResolvedValue(true);
    (readTextFile as MockedFunction<typeof readTextFile>).mockResolvedValue(
      fileContent,
    );
    const newState = await readDocumentFromFile(initialState, filePath, true);

    expect(newState?.doc).toEqual(expectedDoc);
    expect(transaction.value).toBeDefined();
    expect(_path.value).toBe(filePath);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
