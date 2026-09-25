import { describe, expect, it, vi } from "vitest";
import pdfmake from "pdfmake";
import { schema } from "prosemirror-markdown";

import {
  createState,
  createTestView,
  doc,
  h,
  li,
  ol,
  p,
  typeText,
  ul,
} from "../../test/editor";
import autocomplete from "../../editor/plugins/autocomplete";
import toPDF from ".";
import { BASE_DOCUMENT } from "./template";

vi.mock("pdfmake", () => ({ default: { createPdf: vi.fn() } }));

const createPdf = vi.mocked(pdfmake.createPdf);

/**
 * exportDoc runs `toPDF` for `node` and returns the pdfmake document
 * definition it produced together with the export result.
 */
const exportDoc = async (node: ReturnType<typeof doc>) => {
  const buffer = new Uint8Array([37, 80, 68, 70]);
  const getBuffer = vi.fn().mockResolvedValue(buffer);
  createPdf.mockReturnValue({ getBuffer } as unknown as ReturnType<
    typeof pdfmake.createPdf
  >);

  const result = await toPDF(createState(node));

  const [definition] = createPdf.mock.calls[0];
  return { definition, result, buffer };
};

const text = (content: string, extra = {}) => ({
  style: "text",
  text: content,
  bold: false,
  italics: false,
  ...extra,
});

// pdfmake itself is mocked: these tests check the document definition that
// is handed to it, index.test.ts renders real PDFs
describe("exporter.pdf document definition", () => {
  it("returns the rendered PDF", async () => {
    const { result, buffer } = await exportDoc(doc(p("text")));

    expect(result).toBe(buffer);
  });

  it("uses the base document styles", async () => {
    const { definition } = await exportDoc(doc(p("text")));

    expect(definition).toMatchObject({
      defaultStyle: BASE_DOCUMENT.defaultStyle,
      styles: BASE_DOCUMENT.styles,
    });
    expect(BASE_DOCUMENT).not.toHaveProperty("content");
  });

  it("styles headings by level", async () => {
    const { definition } = await exportDoc(doc(h(1, "One"), h(2, "Two")));

    expect(definition.content).toMatchObject([
      { style: "heading1", text: [text("One")] },
      { style: "heading2", text: [text("Two")] },
    ]);
  });

  it("keeps bold and italic text runs", async () => {
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("plain "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text("both", [
          schema.marks.em.create(),
          schema.marks.strong.create(),
        ]),
      ]),
    );

    const { definition } = await exportDoc(node);

    expect(definition.content).toMatchObject([
      {
        style: "paragraph",
        text: [
          text("plain "),
          text("bold", { bold: true }),
          text("both", { bold: true, italics: true }),
        ],
      },
    ]);
  });

  it("turns links into clickable, underlined text", async () => {
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("see "),
        schema.text("Blank", [
          schema.marks.link.create({ href: "https://blank.app" }),
        ]),
      ]),
    );

    const { definition } = await exportDoc(node);

    const [paragraph] = definition.content as { text: object[] }[];
    const [see, blank] = paragraph.text;
    expect(blank).toEqual(
      text("Blank", { decoration: "underline", link: "https://blank.app" }),
    );
    expect(see).not.toHaveProperty("link");
    expect(see).toMatchObject({ decoration: undefined });
  });

  it("exports links typed as markdown as clickable text", async () => {
    const plugin = autocomplete();
    const view = createTestView(
      createState(doc(p("[Blank](https://blank.app)")), { plugins: [plugin] }),
    );
    typeText(view, plugin, " ");

    const { definition } = await exportDoc(view.state.doc);

    expect(definition.content).toMatchObject([
      { text: [{ text: "Blank", link: "https://blank.app" }, { text: " " }] },
    ]);
  });

  it("turns lists into pdfmake lists", async () => {
    const { definition } = await exportDoc(
      doc(ul(li(p("a")), li(p("b"))), ol(li(p("1")))),
    );

    const item = (content: string) => ({
      style: "list_item",
      text: [{ style: "paragraph", text: [text(content)] }],
    });
    expect(definition.content).toMatchObject([
      { style: "bullet_list", ul: [item("a"), item("b")] },
      { style: "ordered_list", ol: [item("1")] },
    ]);
  });
});
