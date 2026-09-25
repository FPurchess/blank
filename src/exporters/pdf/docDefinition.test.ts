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
  ul,
} from "../../test/editor";
import linkTransformer from "../../editor/plugins/autocomplete/transformers/link";
import toPDF from ".";
import {
  BASE_DOCUMENT,
  HEADING_AFTER_HEADING_MARGIN_TOP,
  LIST_ITEM_BLOCK_MARGIN_TOP,
} from "./template";
import { FALLBACK_FONT } from "./fallback";

vi.mock("pdfmake", () => ({
  default: {
    createPdf: vi.fn(),
    addVirtualFileSystem: vi.fn(),
    addFonts: vi.fn(),
  },
}));
vi.mock("./pdfmake-vfs", () => ({
  default: { "IBMPlexSans-Regular.ttf": "font" },
}));

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
      pageSize: BASE_DOCUMENT.pageSize,
      defaultStyle: BASE_DOCUMENT.defaultStyle,
      styles: BASE_DOCUMENT.styles,
      pageBreakBefore: BASE_DOCUMENT.pageBreakBefore,
    });
    expect(BASE_DOCUMENT).not.toHaveProperty("content");
  });

  it("styles headings by level", async () => {
    const { definition } = await exportDoc(doc(p("intro"), h(1, "One")));

    expect(definition.content).toMatchObject([
      { style: "paragraph", headlineLevel: undefined },
      { style: "heading1", headlineLevel: 1, text: [text("One")] },
    ]);
  });

  it("leaves bold and italics of heading runs to the heading style", async () => {
    const { definition } = await exportDoc(doc(h(1, "One")));

    const [run] = (definition.content as { text: object[] }[])[0].text;
    expect(run).not.toHaveProperty("bold", false);
    expect(run).not.toHaveProperty("italics", false);
  });

  it("drops the top margin of the first block", async () => {
    const { definition } = await exportDoc(doc(h(1, "One"), p("text")));

    expect(definition.content).toMatchObject([{ marginTop: 0 }, {}]);
    expect((definition.content as object[])[1]).not.toHaveProperty("marginTop");
  });

  it("tightens the space between consecutive headings", async () => {
    const { definition } = await exportDoc(
      doc(p("text"), h(2, "Two"), h(3, "Three")),
    );

    expect((definition.content as object[])[1]).not.toHaveProperty("marginTop");
    expect((definition.content as object[])[2]).toMatchObject({
      marginTop: HEADING_AFTER_HEADING_MARGIN_TOP,
    });
  });

  it("registers the embedded fonts once", async () => {
    vi.resetModules();
    const { default: freshPdfmake } = await import("pdfmake");
    const { default: freshToPDF } = await import(".");
    vi.mocked(freshPdfmake.createPdf).mockReturnValue({
      getBuffer: vi.fn(),
    } as unknown as ReturnType<typeof pdfmake.createPdf>);

    await freshToPDF(createState(doc(p("a"))));
    await freshToPDF(createState(doc(p("b"))));

    expect(freshPdfmake.addVirtualFileSystem).toHaveBeenCalledTimes(1);
    expect(freshPdfmake.addFonts).toHaveBeenCalledTimes(1);
    expect(freshPdfmake.addFonts).toHaveBeenCalledWith({
      "IBM Plex Sans": {
        normal: "IBMPlexSans-Regular.ttf",
        bold: "IBMPlexSans-Bold.ttf",
        italics: "IBMPlexSans-Italic.ttf",
        bolditalics: "IBMPlexSans-BoldItalic.ttf",
      },
      "IBM Plex Sans Medium": {
        normal: "IBMPlexSans-Medium.ttf",
        bold: "IBMPlexSans-Bold.ttf",
        italics: "IBMPlexSans-MediumItalic.ttf",
        bolditalics: "IBMPlexSans-BoldItalic.ttf",
      },
      "DejaVu Sans": {
        normal: "dejavu-sans.ttf",
        bold: "dejavu-sans-bold.ttf",
        italics: "dejavu-sans-oblique.ttf",
        bolditalics: "dejavu-sans-bold-oblique.ttf",
      },
    });
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

  it("sets characters IBM Plex Sans lacks in the fallback font", async () => {
    const { definition } = await exportDoc(doc(p("a ⇒ b")));

    expect(definition.content).toMatchObject([
      {
        text: [
          {
            text: [
              { text: "a " },
              { text: "⇒", font: FALLBACK_FONT },
              { text: " b" },
            ],
          },
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

  it("keeps links and marks on fallback runs", async () => {
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("go ⇒", [
          schema.marks.em.create(),
          schema.marks.link.create({ href: "https://blank.app" }),
        ]),
      ]),
    );

    const { definition } = await exportDoc(node);

    const link = {
      italics: true,
      decoration: "underline",
      link: "https://blank.app",
    };
    expect(definition.content).toMatchObject([
      {
        text: [
          {
            text: [
              { text: "go ", ...link },
              { text: "⇒", font: FALLBACK_FONT, ...link },
            ],
          },
        ],
      },
    ]);
  });

  it("exports links typed as markdown as clickable text", async () => {
    const typed = "[Blank](https://blank.app)";
    const view = createTestView(createState(doc(p(typed))));
    const props = linkTransformer.activate(typed);
    if (!props) throw new Error("link did not activate");
    linkTransformer.transform(view, typed, props);

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
      stack: [
        { style: "paragraph", text: [text(content)], margin: [0, 0, 0, 0] },
      ],
    });
    expect(definition.content).toMatchObject([
      { style: "bullet_list", ul: [item("a"), item("b")] },
      { style: "ordered_list", ol: [item("1")] },
    ]);
  });

  it("keeps nested lists inside their list item", async () => {
    const { definition } = await exportDoc(doc(ul(li(p("a"), ul(li(p("b")))))));

    expect(definition.content).toMatchObject([
      {
        ul: [
          {
            style: "list_item",
            stack: [
              { style: "paragraph", margin: [0, 0, 0, 0] },
              {
                style: "bullet_list",
                margin: [0, LIST_ITEM_BLOCK_MARGIN_TOP, 0, 0],
                ul: [{ stack: [{ text: [text("b")] }] }],
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("exporter.pdf pageBreakBefore", () => {
  const heading = { headlineLevel: 2 };
  const body = {};
  const nodes = (onPage: object[], onNextPage: object[] = [body]) => ({
    getFollowingNodesOnPage: () => onPage,
    getNodesOnNextPage: () => onNextPage,
  });

  it("moves a heading that ends a page to the next page", () => {
    expect(BASE_DOCUMENT.pageBreakBefore(heading, nodes([]))).toBe(true);
  });

  it("moves a run of headings that ends a page as a whole", () => {
    expect(BASE_DOCUMENT.pageBreakBefore(heading, nodes([heading]))).toBe(true);
  });

  it("keeps a heading that is followed by content", () => {
    expect(BASE_DOCUMENT.pageBreakBefore(heading, nodes([heading, body]))).toBe(
      false,
    );
  });

  it("keeps a heading that ends the document", () => {
    expect(BASE_DOCUMENT.pageBreakBefore(heading, nodes([], []))).toBe(false);
  });

  it("never breaks before other blocks", () => {
    expect(BASE_DOCUMENT.pageBreakBefore(body, nodes([]))).toBe(false);
  });
});
