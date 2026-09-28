import { describe, expect, it, vi } from "vitest";
import pdfmake from "pdfmake";
import { schema } from "../../markdown";

import {
  blockquote,
  captioned,
  createState,
  createTestView,
  doc,
  docWithFrontmatter,
  h,
  li,
  ol,
  p,
  table,
  td,
  th,
  tr,
  typeText,
  ul,
} from "../../test/editor";
import autocomplete from "../../editor/plugins/autocomplete";
import toPDF, { pageDefinition } from ".";
import {
  BASE_DOCUMENT,
  pageBreakBefore,
  BLOCKQUOTE_LAYOUT,
  HEADING_AFTER_HEADING_MARGIN_TOP,
  LIST_ITEM_BLOCK_MARGIN_TOP,
  RULE_LAYOUT,
} from "./template";
import { FALLBACK_FONT } from "./fallback";
import { tableLayout } from "./table";
import { TABLE_COLORS } from "../table";
import { pageGeometry } from "../../layout/resolve";
import type { Layout } from "../../layout/resolve";
import { IMAGES, dataUrl } from "../../test/images";
import { rasterize } from "../../images/codec";
import { allMargins } from "../../layout/settings";
import { testLayout } from "../../test/layout";

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

vi.mock("../../images/codec", () => ({
  decodeSize: vi.fn(),
  rasterize: vi.fn(),
}));

const createPdf = vi.mocked(pdfmake.createPdf);

/**
 * exportDoc runs `toPDF` for `node` and returns the pdfmake document
 * definition it produced together with the export result.
 */
const exportDoc = async (
  node: ReturnType<typeof doc>,
  layout: Layout = testLayout(),
) => {
  const buffer = new Uint8Array([37, 80, 68, 70]);
  const getBuffer = vi.fn().mockResolvedValue(buffer);
  createPdf.mockReturnValue({ getBuffer } as unknown as ReturnType<
    typeof pdfmake.createPdf
  >);

  const result = await toPDF(createState(node), { docPath: null, layout });

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

    // pdfmake is mocked, so it lays out no pages
    expect(result).toEqual({ contents: buffer, warnings: [], pages: 0 });
  });

  it("lays the document out on the page of its layout", async () => {
    const layout = testLayout({
      size: "letter",
      orientation: "landscape",
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
    });

    const { definition } = await exportDoc(doc(p("text")), layout);

    expect(definition).toMatchObject({
      pageSize: { width: 792, height: 612 },
      pageOrientation: "landscape",
      pageMargins: [40, 10, 20, 30],
    });
    expect(pageDefinition(layout)).toEqual({
      pageSize: { width: 792, height: 612 },
      pageOrientation: "landscape",
      pageMargins: [40, 10, 20, 30],
    });
  });

  it("starts a new page after a page break", async () => {
    const { definition } = await exportDoc(
      doc(p("a"), schema.node("page_break"), schema.node("page_break"), p("b")),
    );

    expect(definition.content).toMatchObject([
      { style: "paragraph" },
      { style: "page_break", text: "", pageBreak: "after" },
      { style: "page_break", text: "", pageBreak: "after" },
      { style: "paragraph", pageBreak: undefined },
    ]);
  });

  it("makes no empty first page for a page break at the start", async () => {
    const { definition } = await exportDoc(
      doc(schema.node("page_break"), schema.node("page_break"), p("b")),
    );

    expect(definition.content).toMatchObject([
      { style: "page_break", pageBreak: "after", marginTop: 0 },
      { style: "paragraph" },
    ]);
  });

  it("starts headings of the chosen levels on a new page", async () => {
    const { definition } = await exportDoc(
      doc(
        h(1, "Title"),
        p("intro"),
        h(1, "One"),
        h(2, "Section"),
        schema.node("page_break"),
        h(1, "Two"),
      ),
      testLayout({ newPageBefore: [1] }),
    );

    expect(
      (definition.content as { pageBreak?: string }[]).map(
        (block) => block.pageBreak,
      ),
    ).toEqual([
      // not the first block, nor after a page break: no empty pages
      undefined,
      undefined,
      "before",
      undefined,
      "after",
      undefined,
    ]);
  });

  it("draws a horizontal rule as wide as the text", async () => {
    const { definition } = await exportDoc(
      doc(p("a"), schema.node("horizontal_rule"), p("b")),
    );

    const [, rule] = definition.content as unknown as object[];
    expect(rule).toMatchObject({
      style: "horizontal_rule",
      table: { widths: ["*"] },
      layout: RULE_LAYOUT,
    });
    expect([0, 1].map((index) => RULE_LAYOUT.hLineWidth(index))).toEqual([
      0.75, 0,
    ]);
    expect(BASE_DOCUMENT.styles.horizontal_rule).toEqual({
      margin: [0, 14, 0, 22],
    });
  });

  it("draws no header or footer without text", async () => {
    const { definition } = await exportDoc(doc(p("text")));
    const band = (name: "header" | "footer") =>
      (definition[name] as (page: number, pages: number) => unknown)(1, 3);

    expect(band("header")).toBeNull();
    expect(band("footer")).toBeNull();
  });

  describe("header and footer", () => {
    type Band = {
      columns: { text: unknown; alignment: string }[];
      margin: number[];
      fontSize: number;
      color: string;
    } | null;
    const bandsOf = async (layout: Layout, node = doc(h(1, "Report"))) => {
      const { definition } = await exportDoc(node, layout);
      return (name: "header" | "footer", page: number, pages = 12) =>
        (definition[name] as (page: number, pages: number) => Band)(
          page,
          pages,
        );
    };
    const texts = (band: Band) =>
      band?.columns.map(({ text }) =>
        Array.isArray(text) ? text.map((run) => run.text).join("") : text,
      );

    it("writes the three slots with the values of each page", async () => {
      const band = await bandsOf(
        testLayout({
          header: { left: "{title}", center: "", right: "draft" },
          footer: { left: "", center: "Page {page} of {pages}", right: "" },
          startNumber: 3,
        }),
      );

      expect(texts(band("header", 1))).toEqual(["Report", "", "draft"]);
      expect(texts(band("footer", 2))).toEqual(["", "Page 4 of 12", ""]);
      expect(band("footer", 2)?.columns.map((c) => c.alignment)).toEqual([
        "left",
        "center",
        "right",
      ]);
    });

    it("sits in the margins, Word's distance from the edge, small and grey", async () => {
      const layout = testLayout({
        margins: { top: 72, right: 50, bottom: 80, left: 40 },
        header: { left: "x", center: "", right: "" },
        footer: { left: "", center: "{page}", right: "" },
      });
      const band = await bandsOf(layout);

      expect(band("header", 1)).toMatchObject({
        margin: [40, 36, 50, 0],
        fontSize: 11 / 1.25,
        color: "#666666",
      });
      // its line ends 36pt above the bottom edge
      const line = (11 / 1.25) * 1.3;
      expect(band("footer", 1)?.margin[1]).toBeCloseTo(80 - 36 - line);
    });

    it("leaves a plain first page without them", async () => {
      const band = await bandsOf(
        testLayout({
          footer: { left: "", center: "{page}", right: "" },
          firstPage: "plain",
        }),
      );

      expect(band("footer", 1)).toBeNull();
      expect(texts(band("footer", 2))).toEqual(["", "2", ""]);
    });

    it("gives the first and even pages theirs, in roman numerals", async () => {
      const band = await bandsOf(
        testLayout({
          footer: { left: "", center: "", right: "{page}" },
          firstPage: {
            header: { left: "ACME", center: "", right: "" },
            footer: { left: "", center: "Main St 1", right: "" },
          },
          evenPages: {
            header: { left: "", center: "", right: "" },
            footer: { left: "{page}", center: "", right: "" },
          },
          numberStyle: "i",
        }),
      );

      expect(texts(band("header", 1))).toEqual(["ACME", "", ""]);
      expect(texts(band("footer", 1))).toEqual(["", "Main St 1", ""]);
      expect(texts(band("footer", 2))).toEqual(["ii", "", ""]);
      expect(texts(band("footer", 3))).toEqual(["", "", "iii"]);
      expect(band("header", 3)).toBeNull();
    });
  });

  it("uses the base document styles", async () => {
    const { definition } = await exportDoc(doc(p("text")));

    expect(definition).toMatchObject({
      defaultStyle: BASE_DOCUMENT.defaultStyle,
      styles: BASE_DOCUMENT.styles,
    });
    expect(BASE_DOCUMENT).not.toHaveProperty("content");
  });

  it("keeps captions with their table on the page of the layout", async () => {
    const layout = testLayout({ size: "a5", margins: allMargins(36) });
    const { definition } = await exportDoc(doc(p("text")), layout);
    const { height, margins } = pageGeometry(layout);
    const caption = (top: number) => ({
      style: "table_caption",
      startPosition: { top },
    });
    const breakBefore = definition.pageBreakBefore as (
      node: object,
      nodes: object,
    ) => boolean;

    expect(breakBefore(caption(height - margins.bottom - 40), {})).toBe(true);
    expect(breakBefore(caption(height - margins.bottom - 200), {})).toBe(false);
  });

  it("titles the PDF by its first heading", async () => {
    const { definition } = await exportDoc(
      doc(p("intro"), h(2, "Report"), h(1, "Later")),
    );

    expect(definition.info).toEqual({ title: "Report", creator: "Blank" });
  });

  it("takes the title and author from the frontmatter", async () => {
    const { definition } = await exportDoc(
      docWithFrontmatter(
        "title: The Lighthouse\nauthor: Ada",
        h(1, "Chapter 1"),
      ),
    );

    expect(definition.info).toEqual({
      title: "The Lighthouse",
      author: "Ada",
      creator: "Blank",
    });
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

    await freshToPDF(createState(doc(p("a"))), {
      docPath: null,
      layout: testLayout(),
    });
    await freshToPDF(createState(doc(p("b"))), {
      docPath: null,
      layout: testLayout(),
    });

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

describe("exporter.pdf blocks", () => {
  // the parts of the exported blocks these tests look into
  type Block = {
    start?: number;
    table: {
      body: { stack: { marginTop?: number; marginBottom?: number }[] }[][];
    };
  };
  const blocks = (definition: { content: unknown }) =>
    definition.content as Block[];

  it("keeps the paragraphs of a blockquote apart", async () => {
    const { definition } = await exportDoc(
      doc(blockquote(p("Alpha"), p("Beta"))),
    );

    expect(definition.content).toMatchObject([
      {
        style: "blockquote",
        layout: BLOCKQUOTE_LAYOUT,
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    style: "paragraph",
                    text: [text("Alpha")],
                    marginTop: 0,
                  },
                  { style: "paragraph", text: [text("Beta")], marginBottom: 0 },
                ],
              },
            ],
          ],
        },
      },
    ]);
    const [cell] = blocks(definition)[0].table.body[0];
    expect(cell.stack[0].marginBottom).toBeUndefined();
    expect(cell.stack[1].marginTop).toBeUndefined();
  });

  it("keeps lists and headings inside a blockquote", async () => {
    const { definition } = await exportDoc(
      doc(blockquote(h(2, "Title"), ul(li(p("one")), li(p("two"))))),
    );

    const [cell] = blocks(definition)[0].table.body[0];
    expect(cell.stack).toMatchObject([
      { style: "heading2", text: [text("Title")], marginTop: 0 },
      {
        style: "bullet_list",
        ul: [
          { stack: [{ text: [text("one")] }] },
          { stack: [{ text: [text("two")] }] },
        ],
        marginBottom: 0,
      },
    ]);
  });

  it("draws the blockquote bar on the left only", () => {
    expect(BLOCKQUOTE_LAYOUT.vLineWidth(0)).toBeGreaterThan(0);
    expect(BLOCKQUOTE_LAYOUT.vLineWidth(1)).toBe(0);
    expect(BLOCKQUOTE_LAYOUT.hLineWidth()).toBe(0);
    expect(BLOCKQUOTE_LAYOUT.paddingLeft()).toBeGreaterThan(0);
    expect(BLOCKQUOTE_LAYOUT.paddingRight()).toBe(0);
    expect(BLOCKQUOTE_LAYOUT.paddingTop()).toBe(0);
    expect(BLOCKQUOTE_LAYOUT.paddingBottom()).toBe(0);
  });

  it("turns hard breaks into line breaks", async () => {
    const { definition } = await exportDoc(
      doc(
        schema.node("paragraph", null, [
          schema.text("Kind regards,"),
          schema.nodes.hard_break.create(),
          schema.text("Jane Doe"),
        ]),
      ),
    );

    expect(definition.content).toMatchObject([
      {
        style: "paragraph",
        text: [
          text("Kind regards,"),
          { style: "hard_break", text: "\n" },
          text("Jane Doe"),
        ],
      },
    ]);
  });

  it("keeps the number an ordered list starts with", async () => {
    const { definition } = await exportDoc(
      doc(
        schema.nodes.ordered_list.create({ order: 3 }, [
          li(p("three")),
          li(p("four")),
        ]),
        ol(li(p("one"))),
      ),
    );

    expect(blocks(definition)[0]).toMatchObject({
      style: "ordered_list",
      start: 3,
    });
    const [, fromOne] = blocks(definition);
    expect(fromOne.start).toBeUndefined();
  });
});

describe("exporter.pdf images", () => {
  const PNG = dataUrl("image/png", IMAGES.png);
  const image = (src: string, alt: string | null = null) =>
    schema.node("image", { src, alt });
  const paragraph = (...content: Parameters<typeof schema.node>[2][]) =>
    schema.node("paragraph", null, content.flat() as never);

  it("puts the images into the document, sized like in the editor", async () => {
    const { definition, result } = await exportDoc(
      doc(paragraph([image(PNG)])),
    );

    expect(definition.images).toEqual({ img0: PNG });
    expect(definition.content).toMatchObject([
      {
        style: "paragraph",
        stack: [{ image: "img0", width: 3 * 0.75, height: 2 * 0.75 }],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("splits text around images into blocks", async () => {
    const { definition } = await exportDoc(
      doc(
        paragraph([schema.text("before "), image(PNG), schema.text(" after")]),
      ),
    );

    const [block] = definition.content as { stack: object[] }[];
    expect(block.stack).toMatchObject([
      { text: [text("before ")] },
      { image: "img0" },
      { text: [text(" after")] },
    ]);
  });

  it("keeps the heading level of a heading with an image", async () => {
    const { definition } = await exportDoc(
      doc(schema.node("heading", { level: 2 }, [image(PNG)])),
    );

    expect(definition.content).toMatchObject([
      { style: "heading2", headlineLevel: 2, stack: [{ image: "img0" }] },
    ]);
  });

  it("scales large images down to the page", async () => {
    vi.mocked(rasterize).mockResolvedValue({
      bytes: Uint8Array.from(atob(IMAGES.png), (c) => c.charCodeAt(0)),
      mime: "image/png",
      size: { width: 4000, height: 1000 },
    });

    const { definition } = await exportDoc(
      doc(paragraph([image(dataUrl("image/webp", IMAGES.webpLossy))])),
    );

    const [{ stack }] = definition.content as { stack: object[] }[];
    const { contentWidth, contentHeight } = pageGeometry(testLayout());
    expect(stack[0]).toEqual({
      image: "img0",
      width: contentWidth,
      height: contentWidth / 4,
    });
    expect(contentWidth / 4).toBeLessThan(contentHeight);
  });

  it("scales large images down to a landscape page", async () => {
    vi.mocked(rasterize).mockResolvedValue({
      bytes: Uint8Array.from(atob(IMAGES.png), (c) => c.charCodeAt(0)),
      mime: "image/png",
      size: { width: 4000, height: 1000 },
    });

    const { definition } = await exportDoc(
      doc(paragraph([image(dataUrl("image/webp", IMAGES.webpLossy))])),
      testLayout({ orientation: "landscape" }),
    );

    const [{ stack }] = definition.content as { stack: object[] }[];
    const { contentWidth, contentHeight } = pageGeometry(
      testLayout({ orientation: "landscape" }),
    );
    expect(stack[0]).toEqual({
      image: "img0",
      width: contentWidth,
      height: contentWidth / 4,
    });
    expect(contentWidth / 4).toBeLessThan(contentHeight);
  });

  it("writes the alt text of images that can't be loaded", async () => {
    const { definition, result } = await exportDoc(
      doc(paragraph([image("img/a.png", "Chart"), image("img/b.png")])),
    );

    const [{ stack }] = definition.content as { stack: object[] }[];
    expect(stack).toEqual([
      { text: [{ text: "Chart", italics: true }] },
      { text: [{ text: "img/b.png", italics: true }] },
    ]);
    expect(result.warnings).toEqual([
      "2 images could not be embedded: Chart, img/b.png",
    ]);
  });
});

describe("exporter.pdf pageBreakBefore", () => {
  // where the text ends on the page, e.g. 800pt from the top
  const bottom = 800;
  const breakBefore = pageBreakBefore(bottom);
  const heading = { headlineLevel: 2 };
  const body = {};
  const nodes = (onPage: object[], onNextPage: object[] = [body]) => ({
    getFollowingNodesOnPage: () => onPage,
    getNodesOnNextPage: () => onNextPage,
  });

  it("moves a heading that ends a page to the next page", () => {
    expect(breakBefore(heading, nodes([]))).toBe(true);
  });

  it("moves a run of headings that ends a page as a whole", () => {
    expect(breakBefore(heading, nodes([heading]))).toBe(true);
  });

  it("keeps a heading that is followed by content", () => {
    expect(breakBefore(heading, nodes([heading, body]))).toBe(false);
  });

  it("keeps a heading that ends the document", () => {
    expect(breakBefore(heading, nodes([], []))).toBe(false);
  });

  it("never breaks before other blocks", () => {
    expect(breakBefore(body, nodes([]))).toBe(false);
  });

  it("moves a caption without room for its table below it", () => {
    const caption = (top: number) => ({
      style: "table_caption",
      startPosition: { top },
    });

    expect(breakBefore(caption(bottom - 40), nodes([body]))).toBe(true);
    expect(breakBefore(caption(bottom - 200), nodes([body]))).toBe(false);
  });
});

describe("exporter.pdf tables", () => {
  type TableBlock = {
    style: string;
    table: {
      headerRows: number;
      keepWithHeaderRows?: number;
      dontBreakRows: boolean;
      widths: string[];
      body: Record<string, unknown>[][];
    };
    layout: ReturnType<typeof tableLayout>;
    stack?: object[];
  };
  const exportTable = async (node: ReturnType<typeof table>) => {
    const { definition } = await exportDoc(doc(node));
    return (definition.content as unknown as TableBlock[])[0];
  };

  it("renders a table with its header rows, widths and cells", async () => {
    const block = await exportTable(
      table(
        tr(th("Name"), th("Qty", { align: "right" })),
        tr(td("Apples"), td("3", { align: "right" })),
      ),
    );

    expect(block.style).toBe("table");
    expect(block.table).toMatchObject({
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: ["66.667%", "33.333%"],
    });
    expect(block.table.body).toMatchObject([
      [
        {
          bold: true,
          fillColor: TABLE_COLORS.headerFill,
          stack: [{ text: [text("Name")] }],
        },
        { bold: true, alignment: "right" },
      ],
      [
        { stack: [{ style: "paragraph", marginTop: 0, marginBottom: 0 }] },
        { alignment: "right" },
      ],
    ]);
    expect(block.table.body[1][0]).not.toHaveProperty("bold");
  });

  it("gives merged cells their spans and pdfmake an empty cell where they reach", async () => {
    const block = await exportTable(
      table(
        tr(th("a", { colspan: 2 })),
        tr(td("b", { rowspan: 2 }), td("c")),
        tr(td("d")),
      ),
    );

    expect(block.table.body).toMatchObject([
      [{ colSpan: 2 }, {}],
      [{ rowSpan: 2 }, { stack: [{ text: [text("c")] }] }],
      [{}, { stack: [{ text: [text("d")] }] }],
    ]);
    expect(block.table.body[0][1]).toEqual({});
    expect(block.table.body[2][0]).toEqual({});
  });

  it("keeps the blocks of a cell apart, without space around them", async () => {
    const block = await exportTable(
      table(tr(th("a")), tr(td([p("one"), ul(li(p("two")))]))),
    );

    expect(block.table.body[1][0]).toMatchObject({
      stack: [
        { style: "paragraph", marginTop: 0 },
        { ul: [{}], marginBottom: 0 },
      ],
    });
  });

  it("lets rows break across pages when a cell might not fit on one", async () => {
    const block = await exportTable(
      table(tr(th("a")), tr(td("x".repeat(700)))),
    );

    expect(block.table.dontBreakRows).toBe(false);
  });

  it("doesn't repeat a table without a header row", async () => {
    const block = await exportTable(table(tr(td("a")), tr(td("b"))));

    expect(block.table.headerRows).toBe(0);
    expect(block.table).not.toHaveProperty("keepWithHeaderRows");
  });

  it("puts the caption above the table", async () => {
    const block = await exportTable(
      captioned("Stock", tr(th("a")), tr(td("b"))),
    );

    expect(block.style).toBe("table");
    expect(block.stack).toMatchObject([
      { text: "Stock", style: "table_caption" },
      { table: { headerRows: 1 } },
    ]);
  });

  const imageTable = (src: string) =>
    table(
      tr(th("a"), th("b".repeat(40))),
      tr(
        td(schema.node("paragraph", null, [schema.node("image", { src })])),
        td("x"),
      ),
    );
  const cellImage = (block: TableBlock) =>
    (block.table.body[1][0].stack as { stack: object[] }[])[0].stack[0] as {
      width: number;
      height: number;
    };

  it("keeps the size of an image that fits its cell", async () => {
    const block = await exportTable(
      imageTable(dataUrl("image/png", IMAGES.png)),
    );

    expect(cellImage(block)).toMatchObject({
      width: 3 * 0.75,
      height: 2 * 0.75,
    });
  });

  it("fits a large image to its cell", async () => {
    vi.mocked(rasterize).mockResolvedValue({
      bytes: Uint8Array.from(atob(IMAGES.png), (c) => c.charCodeAt(0)),
      mime: "image/png",
      size: { width: 4000, height: 1000 },
    });
    const block = await exportTable(
      imageTable(dataUrl("image/webp", IMAGES.webpLossy)),
    );

    // the first column is 3 of 43 characters wide, less its padding
    const cellWidth =
      (3 / 43) * pageGeometry(testLayout()).contentWidth - 2 * 0.7 * 11;
    expect(cellImage(block).width).toBeCloseTo(cellWidth);
    expect(cellImage(block).height).toBeCloseTo(cellWidth / 4);
  });

  it("draws lines like the editor: none at the top and sides", () => {
    const layout = tableLayout(1);
    const node = { table: { widths: ["50%", "50%"] } };

    expect([0, 1, 2, 3].map((i) => layout.hLineWidth(i))).toEqual([
      0, 1.2, 0.6, 0.6,
    ]);
    expect([0, 1, 2].map((i) => layout.vLineWidth(i, node))).toEqual([
      0, 0.6, 0,
    ]);
    expect(layout.hLineColor(1)).toBe(TABLE_COLORS.headerLine);
    expect(layout.hLineColor(2)).toBe(TABLE_COLORS.line);
    expect(layout.vLineColor()).toBe(TABLE_COLORS.line);
    expect(tableLayout(0).hLineWidth(1)).toBe(0.6);
  });
});
