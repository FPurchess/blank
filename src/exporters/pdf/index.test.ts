import { beforeAll, describe, expect, it, vi } from "vitest";
import pdfmake from "pdfmake";
import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

import vfs from "./pdfmake-vfs";
import toPDF, { hasMark } from "./index";

// vite resolves pdfmake to its browser build, so test against the same bundle
vi.mock("pdfmake", async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const browserBuild = await import("pdfmake/build/pdfmake.js");
  return { default: browserBuild.default ?? browserBuild };
});

const SAMPLE = `# Heading 1

## Heading 2

A paragraph with *emphasis* and **strong** text.

> A blockquote

- first bullet
- second bullet

1. first item
2. second item
`;

const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

beforeAll(() => {
  pdfmake.addVirtualFileSystem(vfs);

  pdfmake.addFonts({
    "DejaVu Sans": {
      normal: "dejavu-sans.ttf",
      bold: "dejavu-sans.ttf",
      italics: "dejavu-sans.ttf",
      bolditalics: "dejavu-sans.ttf",
    },
  });
});

describe("exporters.pdf", () => {
  describe("hasMark", () => {
    it("detects marks on a node", () => {
      const doc = defaultMarkdownParser.parse("**bold** plain");
      const [bold, plain] = [
        doc.firstChild!.child(0),
        doc.firstChild!.child(1),
      ];
      expect(hasMark(bold, "strong")).toBe(true);
      expect(hasMark(bold, "em")).toBe(false);
      expect(hasMark(plain, "strong")).toBe(false);
    });
  });

  describe("toPDF", () => {
    it("renders a markdown document to a valid PDF", async () => {
      const state = EditorState.create({
        schema,
        doc: defaultMarkdownParser.parse(SAMPLE),
      });

      const pdf = await toPDF(state);

      expect(pdf).toBeInstanceOf(Uint8Array);
      const bytes = pdf as Uint8Array;
      expect(bytes.length).toBeGreaterThan(1000);
      const text = decode(bytes);
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    });
  });
});
