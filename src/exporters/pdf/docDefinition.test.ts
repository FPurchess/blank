import { describe, expect, it, vi } from "vitest";
import pdfmake from "pdfmake";
import { schema } from "prosemirror-markdown";

import {
  blockquote,
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
import {
  BASE_DOCUMENT,
  BLOCKQUOTE_LAYOUT,
  HEADING_AFTER_HEADING_MARGIN_TOP,
  LIST_ITEM_BLOCK_MARGIN_TOP,
} from "./template";
import { FALLBACK_FONT } from "./fallback";
import { CONTENT_HEIGHT, CONTENT_WIDTH, PAGE_MARGIN } from "../page";
import { IMAGES, dataUrl } from "../../test/images";
import { rasterize } from "../../images/codec";

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
const exportDoc = async (node: ReturnType<typeof doc>) => {
  const buffer = new Uint8Array([37, 80, 68, 70]);
  const getBuffer = vi.fn().mockResolvedValue(buffer);
  createPdf.mockReturnValue({ getBuffer } as unknown as ReturnType<
    typeof pdfmake.createPdf
  >);

  const result = await toPDF(createState(node), { docPath: null });

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

    expect(result).toEqual({ contents: buffer, warnings: [] });
  });

  it("uses the base document styles", async () => {
    const { definition } = await exportDoc(doc(p("text")));

    expect(definition).toMatchObject({
      pageSize: BASE_DOCUMENT.pageSize,
      pageMargins: PAGE_MARGIN,
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

    await freshToPDF(createState(doc(p("a"))), { docPath: null });
    await freshToPDF(createState(doc(p("b"))), { docPath: null });

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
    expect(stack[0]).toEqual({
      image: "img0",
      width: CONTENT_WIDTH,
      height: CONTENT_WIDTH / 4,
    });
    expect(CONTENT_WIDTH / 4).toBeLessThan(CONTENT_HEIGHT);
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
