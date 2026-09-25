import { describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser, schema } from "prosemirror-markdown";

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

    it("embeds the medium, bold, italic and fallback faces", async () => {
      const state = EditorState.create({
        schema,
        doc: defaultMarkdownParser.parse(SAMPLE + "\n***both*** ⇒\n"),
      });

      const text = decode((await toPDF(state)) as Uint8Array);

      for (const face of [
        "IBMPlexSans",
        "IBMPlexSans-Medm",
        "IBMPlexSans-Bold",
        "IBMPlexSans-Italic",
        "IBMPlexSans-BoldItalic",
        // the fallback, for the ⇒ arrow
        "DejaVuSans",
      ]) {
        expect(text).toMatch(new RegExp(`/FontName /[A-Z]{6}\\+${face}\\b`));
      }
    });

    it("renders links as clickable link annotations", async () => {
      const state = EditorState.create({
        schema,
        doc: defaultMarkdownParser.parse("see [Blank](https://blank.app)"),
      });

      const text = decode((await toPDF(state)) as Uint8Array);

      expect(text).toContain("/URI (https://blank.app)");
    });
  });
});
