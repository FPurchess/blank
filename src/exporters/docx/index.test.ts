import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  createForm,
  definitionKey,
  parseMarkdown,
  schema,
} from "../../markdown";
import {
  LETTER,
  LETTER_KEY,
  RECIPE,
  SHORT_KEY,
  SHORT_RECIPE,
} from "../../test/forms";
import type { Node } from "prosemirror-model";

import { createState, doc, li, p, ul } from "../../test/editor";
import { box } from "../../test/embeds";
import { IMAGES, dataUrl } from "../../test/images";
import toDOCX from ".";
import { pageGeometry } from "../../layout/resolve";
import { testLayout } from "../../test/layout";
import { NO_SLOTS } from "../../layout/settings";
import { datePicture } from "./bands";
import { setPageEngine } from "../../engine/engine";
import { testEngine } from "../../test/engine";

vi.mock("./font", () => ({
  loadFonts: async () => [
    { name: "IBM Plex Sans", data: new TextEncoder().encode("not a font") },
    { name: "IBM Plex Mono", data: new TextEncoder().encode("nor this") },
  ],
}));

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

interface Exported {
  zip: JSZip;
  warnings: string[];
  xml: (name: string) => Promise<Document>;
  text: (name: string) => Promise<string>;
}

const exportDoc = async (
  doc: Node,
  docPath: string | null = null,
  layout = testLayout(),
) => {
  const { contents, warnings } = await toDOCX(createState(doc), {
    docPath,
    layout,
  });
  const zip = await JSZip.loadAsync(contents);
  const text = async (name: string) => {
    const file = zip.file(name);
    if (!file) throw new Error(`${name} is missing`);
    return file.async("string");
  };
  const xml = async (name: string) =>
    new DOMParser().parseFromString(await text(name), "application/xml");
  return { zip, warnings, xml, text } satisfies Exported;
};

const exportMarkdown = (markdown: string) => exportDoc(parseMarkdown(markdown));

const all = (root: Document | Element, tag: string) => [
  ...root.getElementsByTagNameNS(W, tag),
];
const attr = (element: Element | undefined, name: string) =>
  element?.getAttributeNS(W, name) ?? null;
const child = (element: Element, tag: string) =>
  all(element, tag)[0] as Element | undefined;

const files = ({ zip }: Exported, folder: string) =>
  Object.values(zip.files)
    .filter((file) => !file.dir && file.name.startsWith(folder))
    .map((file) => file.name);

// the paragraphs of the body with their style, numbering and text
const paragraphs = async ({ xml }: Exported) =>
  all(await xml("word/document.xml"), "p").map((p) => ({
    style: attr(child(p, "pStyle"), "val"),
    numId: attr(child(p, "numId"), "val"),
    level: attr(child(p, "ilvl"), "val"),
    text: all(p, "t")
      .map((t) => t.textContent)
      .join(""),
    p,
  }));

describe("exporter.docx", () => {
  it("styles headings, paragraphs, quotes, code and rules", async () => {
    const exported = await exportMarkdown(
      [
        "# One",
        "## Two",
        "text",
        "> quoted",
        "```\nline 1\n\n  line 3\n```",
        "---",
        "###### Six",
      ].join("\n\n"),
    );

    expect(
      (await paragraphs(exported)).map(({ style, text }) => [style, text]),
    ).toEqual([
      ["Heading1", "One"],
      ["Heading2", "Two"],
      [null, "text"],
      ["Quote", "quoted"],
      ["CodeBlock", "line 1"],
      ["CodeBlock", ""],
      ["CodeBlock", "  line 3"],
      ["HorizontalLine", ""],
      ["Heading6", "Six"],
    ]);
  });

  it("leaves out content blocks Blank can't show, and says so", async () => {
    const exported = await exportMarkdown(
      ["a", "<!-- blank:toc@9 -->", "<!-- blank:x@1 -->", "b"].join("\n\n"),
    );
    expect((await paragraphs(exported)).map(({ text }) => text)).toEqual([
      "a",
      "b",
    ]);
    expect(exported.warnings).toEqual([
      "2 blocks Blank can't show were left out",
    ]);
  });

  describe("a table of contents", () => {
    const markdown = [
      '<!-- blank:toc@1 depth="2" title="Contents" -->',
      "# One",
      "text",
      "## Two",
      "### Three",
      "# Four",
    ].join("\n\n");

    // the table of contents' field, its entries, and where they link to
    const tocOf = async (exported: Exported) => {
      const xml = await exported.xml("word/document.xml");
      const sdt = all(xml, "sdt")[0];
      return {
        sdt,
        instruction: all(sdt, "instrText")
          .map((text) => text.textContent)
          .join(""),
        entries: all(sdt, "p")
          .filter((p) => attr(child(p, "pStyle"), "val")?.startsWith("TOC"))
          .map((p) => ({
            style: attr(child(p, "pStyle"), "val"),
            text: all(p, "t").map((t) => t.textContent),
            anchor: attr(child(p, "hyperlink"), "anchor"),
          })),
        bookmarks: all(xml, "bookmarkStart").map((mark) => attr(mark, "name")),
        tab: attr(
          all(sdt, "tab").find((tab) => attr(tab, "val") === "right"),
          "pos",
        ),
      };
    };

    afterEach(() => setPageEngine(null));

    it("is Word's own, linked to the headings up to its depth", async () => {
      const exported = await exportMarkdown(markdown);
      const toc = await tocOf(exported);
      expect(toc.instruction).toMatch(/^TOC\b/);
      expect(toc.instruction).toContain('\\o "1-2"');
      expect(toc.instruction).toContain("\\h");
      expect(toc.entries.map(({ style, text }) => [style, text[0]])).toEqual([
        ["TOC1", "One"],
        ["TOC2", "Two"],
        ["TOC1", "Four"],
      ]);
      expect(toc.bookmarks).toEqual([
        "_BlankToc1",
        "_BlankToc2",
        "_BlankToc3",
        "_BlankToc4",
      ]);
      expect(toc.entries.map(({ anchor }) => anchor)).toEqual([
        "_BlankToc1",
        "_BlankToc2",
        "_BlankToc4",
      ]);
      // from Word's gallery of tables of contents
      expect(
        all(toc.sdt, "docPartGallery").map((part) => attr(part, "val")),
      ).toEqual(["Table of Contents"]);
      // the title before it, in Word's style for it
      const titled = (await paragraphs(exported)).find(
        ({ text }) => text === "Contents",
      );
      expect(titled?.style).toBe("TOCHeading");
      // the page numbers at the right edge of the text
      const { contentWidth } = pageGeometry(testLayout());
      expect(Number(toc.tab)).toBe(Math.round(contentWidth * 20));
    });

    it("has the page numbers of Blank's pages", async () => {
      const doc = parseMarkdown(
        markdown.replace("text", "text\n\n<!-- pagebreak -->"),
      );
      const engine = testEngine();
      engine.sync(doc, () => undefined);
      setPageEngine(engine);
      const toc = await tocOf(await exportDoc(doc));
      expect(toc.entries.map(({ text }) => text[text.length - 1])).toEqual([
        "1",
        "2",
        "2",
      ]);
    });

    it("gives a heading that comes twice two bookmarks", async () => {
      // ProseMirror may share one node between two places, e.g. after a copy
      const twice = schema.node("heading", { level: 1 }, schema.text("Again"));
      const node = schema.node("doc", null, [schema.node("toc"), twice, twice]);
      const toc = await tocOf(await exportDoc(node));
      expect(toc.bookmarks).toEqual(["_BlankToc1", "_BlankToc2"]);
      expect(toc.entries.map(({ anchor }) => anchor)).toEqual([
        "_BlankToc1",
        "_BlankToc2",
      ]);
    });

    it("leaves the headings without bookmarks when there is none", async () => {
      const exported = await exportMarkdown("# One\n\ntext");
      const xml = await exported.xml("word/document.xml");
      expect(all(xml, "bookmarkStart")).toEqual([]);
    });
  });

  describe("a form", () => {
    const recipe = SHORT_RECIPE;
    const key = SHORT_KEY;
    const form = (title: Node) =>
      schema.node("doc", { definitions: { [key]: recipe } }, [
        schema.node("paragraph", null, schema.text("Intro")),
        schema.node("form_block", { def: key }, [
          schema.node("form_field", { name: "title" }, [title]),
          schema.node("form_field", { name: "steps" }, [
            schema.node("paragraph", null, schema.text("Mix.")),
          ]),
        ]),
      ]);

    it("is a locked group of content controls, one per field", async () => {
      const exported = await exportDoc(
        form(schema.node("heading", { level: 1 }, schema.text("Pancakes"))),
      );
      const xml = await exported.xml("word/document.xml");
      const controls = all(xml, "sdt").map((sdt) => ({
        tag: attr(child(sdt, "tag"), "val"),
        alias: attr(child(sdt, "alias"), "val"),
        lock: attr(child(sdt, "lock"), "val"),
        group: !!child(child(sdt, "sdtPr")!, "group"),
        text: all(child(sdt, "sdtContent")!, "t")
          .map((t) => t.textContent)
          .join(""),
      }));
      expect(controls).toEqual([
        {
          tag: `blank:form@1:${key}`,
          alias: "Recipe",
          lock: "sdtLocked",
          group: true,
          text: "PancakesMix.",
        },
        {
          tag: "blank:field:title",
          alias: "Title",
          lock: "sdtLocked",
          group: false,
          text: "Pancakes",
        },
        {
          tag: "blank:field:steps",
          alias: "Steps",
          lock: "sdtLocked",
          group: false,
          text: "Mix.",
        },
      ]);
      // no marker is left, and the form starts a new page
      const styles = (await paragraphs(exported)).map(({ style }) => style);
      expect(styles).not.toContain("BlankControlOpen");
      const title = (await paragraphs(exported)).find(
        ({ text }) => text === "Pancakes",
      )!;
      expect(child(title.p, "pageBreakBefore")).toBeDefined();
      expect(title.style).toBe("Heading1");
      // the definitions go along
      const custom = await exported.text("customXml/item1.xml");
      expect(custom).toContain("id: blank/recipe");
    });

    it("says an empty field's placeholder", async () => {
      const exported = await exportDoc(
        form(schema.node("heading", { level: 1 })),
      );
      const xml = await exported.xml("word/document.xml");
      const title = all(xml, "sdt")[1];
      expect(child(child(title, "sdtPr")!, "showingPlcHdr")).toBeDefined();
      expect(all(title, "t")[0].textContent).toBe("Recipe name");
      expect(attr(child(title, "rStyle"), "val")).toBe("PlaceholderText");
    });

    it("starts a new page before a form that starts with a table", async () => {
      const table = { ...RECIPE, newPage: true, fields: [RECIPE.fields[2]] };
      const tableKey = definitionKey(table);
      const exported = await exportDoc(
        schema.node("doc", { definitions: { [tableKey]: table } }, [
          schema.node("paragraph", null, schema.text("Intro")),
          createForm(table, tableKey),
        ]),
      );
      const xml = await exported.xml("word/document.xml");
      const field = all(xml, "sdt")[1];
      const first = child(field, "sdtContent")!.firstElementChild!;
      expect(first.localName).toBe("p");
      expect(child(first, "pageBreakBefore")).toBeDefined();
      expect(first.nextElementSibling!.localName).toBe("tbl");
    });

    it("puts the columns of a grid side by side in a table without lines", async () => {
      const grid = {
        ...RECIPE,
        layout: [
          { field: "title" },
          {
            grid: { columns: ["1fr", "1fr"] },
            cells: [
              [{ field: "photo" }],
              [{ field: "ingredients" }, { field: "steps" }],
            ],
          },
        ],
      };
      const gridKey = definitionKey(grid);
      const exported = await exportDoc(
        schema.node("doc", { definitions: { [gridKey]: grid } }, [
          createForm(grid, gridKey),
        ]),
      );
      const xml = await exported.xml("word/document.xml");
      const tags = (parent: Element) =>
        all(parent, "tag").map((tag) => attr(tag, "val"));
      const control = all(xml, "sdt").find(
        (sdt) =>
          attr(child(child(sdt, "sdtPr")!, "tag"), "val") === "blank:grid",
      )!;
      const table = child(child(control, "sdtContent")!, "tbl")!;
      expect(
        all(child(table, "tblPr")!, "tblBorders").flatMap((borders) =>
          [...borders.children].map((border) => attr(border, "val")),
        ),
      ).toEqual(Array(6).fill("none"));
      const cells = all(table, "tc").filter(
        (cell) => cell.parentNode?.parentNode === table,
      );
      expect(cells.map(tags)).toEqual([
        ["blank:field:photo"],
        ["blank:field:ingredients", "blank:field:steps"],
      ]);
      // each cell ends with a paragraph, as Word wants
      for (const cell of cells) {
        expect(cell.lastElementChild!.localName).toBe("p");
      }
      // the ingredients' table is as wide as its column
      const inner = all(cells[1], "tbl")[0];
      const width = Number(attr(child(child(inner, "tblPr")!, "tblW"), "w"));
      const column = Number(attr(child(child(cells[1], "tcPr")!, "tcW"), "w"));
      expect(width).toBeLessThanOrEqual(column);
    });

    it("puts the fields of frames in Word's frames, the text below them", async () => {
      const exported = await exportDoc(
        schema.node("doc", { definitions: { [LETTER_KEY]: LETTER } }, [
          schema.node("paragraph", null, schema.text("Intro")),
          createForm(LETTER, LETTER_KEY),
        ]),
      );
      const written = await paragraphs(exported);
      const date = written.find(({ text }) => text === "The date")!;
      const frame = child(date.p, "framePr")!;
      const mm = (value: number) =>
        String(Math.round((value * 72 * 20) / 25.4));
      expect(attr(frame, "x")).toBe(mm(125));
      expect(attr(frame, "y")).toBe(mm(50));
      expect(attr(frame, "w")).toBe(mm(75));
      expect(attr(frame, "hAnchor")).toBe("page");
      expect(attr(frame, "vAnchor")).toBe("page");
      // the letter's text starts 100mm below the page's top edge
      const body = written[written.indexOf(date) + 1];
      expect(child(body.p, "framePr")).toBeUndefined();
      const margin = pageGeometry(testLayout()).margins.top;
      expect(attr(child(body.p, "spacing"), "before")).toBe(
        String(Math.round(((100 * 72) / 25.4 - margin) * 20)),
      );
    });

    it("spaces the blocks in fields as if the markers weren't there", async () => {
      const exported = await exportDoc(
        schema.node("doc", { definitions: { [key]: recipe } }, [
          schema.node("form_block", { def: key }, [
            schema.node("form_field", { name: "title" }, [
              schema.node("heading", { level: 1 }, schema.text("Pancakes")),
            ]),
            schema.node("form_field", { name: "steps" }, [
              schema.node("heading", { level: 2 }, schema.text("Batter")),
            ]),
          ]),
        ]),
      );
      const [title, batter] = await paragraphs(exported);
      const before = (p: Element) => attr(child(p, "spacing"), "before");
      // the document's first block, and a heading after a heading
      expect(before(title.p)).toBe("0");
      expect(before(batter.p)).toBe("80");
    });
  });

  it("writes an embed as a picture in a content control, its data in a part", async () => {
    const embed = schema.nodes.embed.create({
      type: "org.blank.test/box@1",
      id: "k3x9",
      alt: "A red box",
      data: '{"color":"red"}',
      svg: box("red"),
    });
    const exported = await exportDoc(schema.node("doc", null, [embed]));
    const xml = await exported.xml("word/document.xml");
    const sdt = all(xml, "sdt")[0];
    expect(attr(child(sdt, "tag"), "val")).toBe("blank:embed@1:k3x9");
    expect(attr(child(sdt, "alias"), "val")).toBe("A red box");
    const part = await exported.text("customXml/item2.xml");
    expect(part).toContain("https://blank-writer.xyz/2026/embeds");
    expect(part).toContain("org.blank.test/box@1");
  });

  it("defines the styles the import maps back", async () => {
    const styles = await (await exportMarkdown("text")).xml("word/styles.xml");

    const names = Object.fromEntries(
      all(styles, "style").map((style) => [
        attr(style, "styleId"),
        attr(child(style, "name"), "val"),
      ]),
    );
    expect(names).toMatchObject({
      Quote: "Quote",
      CodeBlock: "Code Block",
      HorizontalLine: "Horizontal Line",
      InlineCode: "Inline Code",
      Heading1: "Heading 1",
    });
  });

  it("spaces headings like the PDF", async () => {
    const [first, second, third] = await paragraphs(
      await exportMarkdown("# One\n\n## Two\n\ntext\n\n## Three"),
    );
    const before = (p: Element) => attr(child(p, "spacing"), "before");

    expect(before(first.p)).toBe("0");
    expect(before(second.p)).toBe("80");
    expect(child(third.p, "spacing")).toBeUndefined();
  });

  it("keeps bold, italic and inline code runs and hard breaks", async () => {
    const [p] = await paragraphs(
      await exportMarkdown("plain **bold** *em* `code`  \nnext"),
    );

    const runs = all(p.p, "r").map((r) => ({
      text: all(r, "t")[0]?.textContent ?? null,
      bold: child(r, "b") !== undefined,
      italic: child(r, "i") !== undefined,
      style: attr(child(r, "rStyle"), "val"),
      br: child(r, "br") !== undefined,
    }));
    expect(runs).toEqual([
      { text: "plain ", bold: false, italic: false, style: null, br: false },
      { text: "bold", bold: true, italic: false, style: null, br: false },
      { text: " ", bold: false, italic: false, style: null, br: false },
      { text: "em", bold: false, italic: true, style: null, br: false },
      { text: " ", bold: false, italic: false, style: null, br: false },
      {
        text: "code",
        bold: false,
        italic: false,
        style: "InlineCode",
        br: false,
      },
      { text: null, bold: false, italic: false, style: null, br: true },
      { text: "next", bold: false, italic: false, style: null, br: false },
    ]);
  });

  it("links text to its url", async () => {
    const exported = await exportMarkdown(
      "see [Blank **app**](https://blank.app) and [anchor](#top)",
    );
    const [p] = await paragraphs(exported);

    const [link] = all(p.p, "hyperlink");
    expect(all(link, "t").map((t) => t.textContent)).toEqual(["Blank ", "app"]);
    expect(all(link, "rStyle").map((style) => attr(style, "val"))).toEqual([
      "Hyperlink",
      "Hyperlink",
    ]);
    expect(all(p.p, "hyperlink")).toHaveLength(1);

    const id = link.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    );
    const rels = await exported.text("word/_rels/document.xml.rels");
    expect(rels).toMatch(
      new RegExp(
        `Id="${id}"[^>]*Target="https://blank.app"[^>]*TargetMode="External"`,
      ),
    );
  });

  it("restarts the numbering of every list", async () => {
    const exported = await exportMarkdown(
      "1. one\n2. two\n\ntext\n\n1. again\n\n- bullet",
    );

    const numbered = (await paragraphs(exported)).filter((p) => p.numId);
    expect(numbered.map((p) => p.text)).toEqual([
      "one",
      "two",
      "again",
      "bullet",
    ]);
    const [one, two, again, bullet] = numbered.map((p) => p.numId);
    expect(one).toBe(two);
    expect(new Set([one, again, bullet]).size).toBe(3);
  });

  it("starts ordered lists at their number", async () => {
    const exported = await exportMarkdown("3. three\n4. four");
    const numbering = await exported.xml("word/numbering.xml");

    const [{ numId }] = await paragraphs(exported);
    const num = all(numbering, "num").find((n) => attr(n, "numId") === numId)!;
    const abstractId = attr(child(num, "abstractNumId"), "val");
    const abstract = all(numbering, "abstractNum").find(
      (a) => attr(a, "abstractNumId") === abstractId,
    )!;
    const level0 = all(abstract, "lvl")[0];
    expect(attr(child(level0, "start"), "val")).toBe("3");
    expect(attr(child(level0, "numFmt"), "val")).toBe("decimal");
  });

  it("keeps bullets of a list nested in a numbered list", async () => {
    const exported = await exportMarkdown("1. one\n   - nested\n2. two");
    const numbering = await exported.xml("word/numbering.xml");

    const [one, nested] = await paragraphs(exported);
    expect([one.level, nested.level]).toEqual(["0", "1"]);
    const formatAt = (numId: string | null, level: number) => {
      const num = all(numbering, "num").find(
        (n) => attr(n, "numId") === numId,
      )!;
      const abstract = all(numbering, "abstractNum").find(
        (a) =>
          attr(a, "abstractNumId") === attr(child(num, "abstractNumId"), "val"),
      )!;
      return attr(child(all(abstract, "lvl")[level], "numFmt"), "val");
    };
    expect(formatAt(one.numId, 0)).toBe("decimal");
    expect(formatAt(nested.numId, 1)).toBe("bullet");
  });

  it("indents further blocks of a list item without a number", async () => {
    const exported = await exportMarkdown("- first\n\n  second paragraph");

    const [first, second] = await paragraphs(exported);
    expect(first.numId).not.toBeNull();
    expect(second.numId).toBeNull();
    expect(attr(child(second.p, "ind"), "left")).toBe("720");
  });

  it("tightens the items of tight lists", async () => {
    const tight = await paragraphs(await exportMarkdown("- a\n- b"));
    const loose = await paragraphs(await exportMarkdown("- a\n\n- b"));

    expect(attr(child(tight[0].p, "spacing"), "after")).toBe("40");
    expect(attr(child(loose[0].p, "spacing"), "after")).toBeNull();
    // the last item is spaced from the next block
    expect(attr(child(tight[1].p, "spacing"), "after")).toBe("160");
    expect(attr(child(loose[1].p, "spacing"), "after")).toBe("160");
  });

  it("borders lists in blockquotes instead of styling them as quotes", async () => {
    const [item] = await paragraphs(await exportMarkdown("> - item"));

    expect(item.style).not.toBe("Quote");
    expect(item.numId).not.toBeNull();
    expect(child(child(item.p, "pBdr")!, "left")).toBeDefined();
    expect(attr(child(item.p, "ind"), "left")).toBe("1080");
  });

  it("embeds images, sized like in the editor and at most page wide", async () => {
    const exported = await exportMarkdown(
      `![pixel](${dataUrl("image/png", IMAGES.png)} "Title")`,
    );

    const media = files(exported, "word/media/");
    expect(media).toHaveLength(1);
    const document = await exported.text("word/document.xml");
    expect(document).toContain(`cx="${3 * 9525}" cy="${2 * 9525}"`);
    expect(document).toMatch(/descr="pixel"/);
    expect(document).toMatch(/title="Title"/);
    expect(exported.warnings).toEqual([]);
  });

  it("writes the alt text of images that can't be loaded", async () => {
    const image = schema.node("image", { src: "missing.png", alt: "Chart" });
    const exported = await exportDoc(
      schema.node("doc", null, [schema.node("paragraph", null, [image])]),
    );

    const [p] = await paragraphs(exported);
    expect(p.text).toBe("Chart");
    expect(child(p.p, "i")).toBeDefined();
    expect(exported.warnings).toEqual(["1 image could not be embedded: Chart"]);
  });

  describe("page", () => {
    const section = async (exported: Exported) => {
      const sectPr = all(await exported.xml("word/document.xml"), "sectPr");
      expect(sectPr).toHaveLength(1);
      const [pgSz] = all(sectPr[0], "pgSz");
      const [pgMar] = all(sectPr[0], "pgMar");
      const attrs = (element: Element, names: string[]) =>
        Object.fromEntries(names.map((name) => [name, attr(element, name)]));
      return {
        size: attrs(pgSz, ["w", "h", "orient"]),
        margins: attrs(pgMar, [
          "top",
          "right",
          "bottom",
          "left",
          "header",
          "footer",
          "gutter",
        ]),
      };
    };

    it("lays out on A4 with 2.5 cm margins by default", async () => {
      expect(await section(await exportMarkdown("text"))).toEqual({
        size: { w: "11906", h: "16838", orient: "portrait" },
        margins: {
          top: "1417",
          right: "1417",
          bottom: "1417",
          left: "1417",
          header: "720",
          footer: "720",
          gutter: "0",
        },
      });
    });

    it("turns landscape pages, with their margins", async () => {
      const layout = testLayout({
        size: "letter",
        orientation: "landscape",
        margins: { top: 36, right: 54, bottom: 72, left: 90 },
      });

      const exported = await exportDoc(parseMarkdown("text"), null, layout);

      expect(await section(exported)).toMatchObject({
        size: { w: "15840", h: "12240", orient: "landscape" },
        margins: { top: "720", right: "1080", bottom: "1440", left: "1800" },
      });
    });
  });

  describe("page breaks", () => {
    // what starts a new page: Word's "Page break before" on each paragraph
    const breaks = async (exported: Exported) =>
      (await paragraphs(exported)).map(({ p, text }) => [
        text,
        child(p, "pageBreakBefore") !== undefined,
      ]);

    it("starts the page of the block after a page break", async () => {
      const exported = await exportMarkdown(
        "a\n\n<!-- pagebreak -->\n\nb\n\n* c",
      );

      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["b", true],
        ["c", false],
      ]);
    });

    it("leaves an empty page between two page breaks, and after the last", async () => {
      const exported = await exportMarkdown(
        "a\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nb\n\n<!-- pagebreak -->",
      );

      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["", true],
        ["b", true],
        ["", true],
      ]);
    });

    it("starts the page of a table with an empty paragraph", async () => {
      const exported = await exportMarkdown(
        "a\n\n<!-- pagebreak -->\n\n| b | c |\n| - | - |\n| d | e |",
      );

      const body = (
        await exported.xml("word/document.xml")
      ).getElementsByTagNameNS(W, "body")[0];
      const blocks = [...body.children]
        .filter((element) => element.localName !== "sectPr")
        .map((element) =>
          element.localName === "tbl"
            ? "table"
            : [
                element.textContent,
                child(element, "pageBreakBefore") !== undefined,
              ],
        );
      expect(blocks).toEqual([["a", false], ["", true], "table"]);
    });

    it("starts a page in a quote", async () => {
      const exported = await exportMarkdown(
        "> a\n>\n> <!-- pagebreak -->\n>\n> b",
      );

      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["b", true],
      ]);
    });

    it("starts a page in a list item", async () => {
      const exported = await exportMarkdown(
        "- a\n\n  <!-- pagebreak -->\n\n  b\n- c",
      );

      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["b", true],
        ["c", false],
      ]);
    });

    it("starts a page with a list item that begins with a page break", async () => {
      const pageBreak = schema.nodes.page_break.create();
      const exported = await exportDoc(
        doc(p("a"), ul(li(pageBreak, p("b")), li(p("c")))),
      );

      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["b", true],
        ["c", false],
      ]);
    });

    it("starts the page after a list item that ends with a page break", async () => {
      const pageBreak = schema.nodes.page_break.create();
      const exported = await exportDoc(doc(ul(li(p("a"), pageBreak)), p("b")));

      // the item's break leaves an empty paragraph that starts the page, as a
      // break at the end of a quote does
      expect(await breaks(exported)).toEqual([
        ["a", false],
        ["", true],
        ["b", false],
      ]);
    });

    const headingBreaks = async (exported: Exported) =>
      all(await exported.xml("word/styles.xml"), "style")
        .filter((style) => /^Heading\d$/.test(attr(style, "styleId") ?? ""))
        .filter((style) => child(style, "pageBreakBefore"))
        .map((style) => attr(style, "styleId"));

    it("starts headings of the chosen levels on a new page", async () => {
      const exported = await exportDoc(
        parseMarkdown("# One\n\n## Section\n\n# Two"),
        null,
        testLayout({ newPageBefore: [1, 3] }),
      );

      expect(await headingBreaks(exported)).toEqual(["Heading1", "Heading3"]);
      expect(await headingBreaks(await exportMarkdown("# One"))).toEqual([]);
    });
  });

  describe("header and footer", () => {
    const partsOf = async (exported: Exported) => {
      const names = files(exported, "word/").filter((name) =>
        /word\/(header|footer)\d+\.xml$/.test(name),
      );
      return Promise.all(names.map((name) => exported.text(name)));
    };
    const exportWith = (settings: Parameters<typeof testLayout>[0]) =>
      exportDoc(
        parseMarkdown("---\ntitle: The Lighthouse\n---\n\ntext"),
        null,
        testLayout(settings),
      );

    it("writes none without text", async () => {
      const exported = await exportMarkdown("text");

      expect(await partsOf(exported)).toEqual([]);
      const sectPr = all(await exported.xml("word/document.xml"), "sectPr")[0];
      expect(child(sectPr, "titlePg")).toBeUndefined();
    });

    it("writes Word's fields between tab stops", async () => {
      const exported = await exportWith({
        header: { left: "{title}", center: "", right: "by {author}" },
        footer: { left: "", center: "Page {page} of {pages}", right: "" },
      });
      const document = await exported.xml("word/document.xml");
      const [sectPr] = all(document, "sectPr");

      expect(
        all(sectPr, "headerReference").map((r) => attr(r, "type")),
      ).toEqual(["default"]);
      const [header, footer] = (await partsOf(exported)).sort();
      const parse = (xml: string) =>
        new DOMParser().parseFromString(xml, "application/xml");
      const footerXml = parse(footer.includes("w:ftr") ? footer : header);
      const headerXml = parse(footer.includes("w:ftr") ? header : footer);

      // the header: the title as a TITLE field, then two tabs to the right
      expect(attr(all(headerXml, "pStyle")[0], "val")).toBe("Header");
      expect(all(headerXml, "fldSimple").map((f) => attr(f, "instr"))).toEqual([
        "TITLE",
        "AUTHOR",
      ]);
      expect(
        all(headerXml, "tab").filter((t) => t.parentElement?.localName === "r"),
      ).toHaveLength(2);
      expect(
        all(headerXml, "tab")
          .filter((t) => t.parentElement?.localName === "tabs")
          .map((t) => attr(t, "val")),
      ).toEqual(["center", "right"]);
      expect(
        all(headerXml, "t")
          .map((t) => t.textContent)
          .join(""),
      ).toContain("The Lighthouse");
      // the footer: PAGE and NUMPAGES fields in the center
      const instructions = all(footerXml, "instrText").map((t) =>
        t.textContent?.trim(),
      );
      expect(instructions).toEqual(["PAGE", "NUMPAGES"]);
      expect(attr(all(footerXml, "pStyle")[0], "val")).toBe("Footer");
    });

    it("styles headers and footers small and grey, like the PDF", async () => {
      const exported = await exportWith({
        footer: { left: "", center: "{page}", right: "" },
      });
      const style = all(await exported.xml("word/styles.xml"), "style").find(
        (s) => attr(s, "styleId") === "Footer",
      )!;

      expect(attr(child(style, "sz"), "val")).toBe("18");
      expect(attr(child(style, "color"), "val")).toBe("666666");
    });

    it("leaves a plain first page empty, and starts the numbers where asked", async () => {
      const exported = await exportWith({
        footer: { left: "", center: "{page}", right: "" },
        firstPage: "plain",
        startNumber: 3,
      });
      const [sectPr] = all(await exported.xml("word/document.xml"), "sectPr");

      expect(child(sectPr, "titlePg")).toBeDefined();
      expect(
        all(sectPr, "footerReference")
          .map((r) => attr(r, "type"))
          .sort(),
      ).toEqual(["default", "first"]);
      expect(attr(child(sectPr, "pgNumType"), "start")).toBe("3");
    });

    it("writes the chapter, date and file as Word's fields", async () => {
      const exported = await exportWith({
        header: { left: "{chapter}", center: "{date}", right: "{file}" },
      });
      const [header] = await partsOf(exported);
      const xml = new DOMParser().parseFromString(header, "application/xml");

      expect(all(xml, "fldSimple").map((f) => attr(f, "instr"))).toEqual([
        'STYLEREF "Heading 1"',
        `DATE \\@ "${datePicture()}"`,
        "FILENAME",
      ]);
    });

    it("gives the first and even pages their own parts", async () => {
      const exported = await exportWith({
        footer: { left: "", center: "", right: "{page}" },
        firstPage: {
          header: { left: "ACME", center: "", right: "" },
          footer: NO_SLOTS,
        },
        evenPages: {
          header: NO_SLOTS,
          footer: { left: "{page}", center: "", right: "" },
        },
        numberStyle: "i",
      });
      const [sectPr] = all(await exported.xml("word/document.xml"), "sectPr");
      const types = (name: string) =>
        all(sectPr, name)
          .map((r) => attr(r, "type"))
          .sort();

      // every band has a part for each of the pages, with a paragraph
      expect(types("headerReference")).toEqual(["default", "even", "first"]);
      expect(types("footerReference")).toEqual(["default", "even", "first"]);
      for (const part of await partsOf(exported)) {
        expect(part).toMatch(/<w:p\b/);
      }
      expect(child(sectPr, "titlePg")).toBeDefined();
      expect(attr(child(sectPr, "pgNumType"), "fmt")).toBe("lowerRoman");
      const settings = await exported.xml("word/settings.xml");
      expect(all(settings, "evenAndOddHeaders")).toHaveLength(1);
    });

    it("writes no header for a band without text", async () => {
      const exported = await exportWith({
        footer: { left: "", center: "{page}", right: "" },
        firstPage: "plain",
      });
      const [sectPr] = all(await exported.xml("word/document.xml"), "sectPr");

      expect(all(sectPr, "headerReference")).toEqual([]);
      expect(files(exported, "word/header")).toEqual([]);
    });
  });

  it("embeds the regular faces of IBM Plex Sans and IBM Plex Mono", async () => {
    const exported = await exportMarkdown("text");

    const fonts = files(exported, "word/fonts/");
    expect(fonts).toHaveLength(2);
    const table = await exported.text("word/fontTable.xml");
    for (const name of ["IBM Plex Sans", "IBM Plex Mono"]) {
      const entry = new RegExp(
        `<w:font w:name="${name}">.*?<w:embedRegular\\b.*?</w:font>`,
        "s",
      );
      expect(table).toMatch(entry);
    }
  });

  it("sets code in IBM Plex Mono, in the styles the import maps back", async () => {
    const exported = await exportMarkdown(
      "text `inline` code\n\n```\nlet x = 1;\n```",
    );
    const styles = await exported.xml("word/styles.xml");
    for (const id of ["CodeBlock", "InlineCode"]) {
      const style = all(styles, "style").find(
        (element) => attr(element, "styleId") === id,
      )!;
      expect(attr(child(style, "rFonts"), "ascii")).toBe("IBM Plex Mono");
      // on the fill the pages and the PDF show
      expect(attr(child(style, "shd"), "fill")).toBe("EFF0F1");
    }
    expect(await exported.text("word/styles.xml")).not.toMatch(/Courier/);
    // monospaced where a reader lacks it, so code keeps its columns
    const font = all(await exported.xml("word/fontTable.xml"), "font").find(
      (element) => attr(element, "name") === "IBM Plex Mono",
    )!;
    expect(attr(child(font, "pitch"), "val")).toBe("fixed");
  });

  it("titles the document by its first heading", async () => {
    const core = await (
      await exportMarkdown("text\n\n## Report\n\n# Later")
    ).text("docProps/core.xml");

    expect(core).toMatch(/<dc:title>Report<\/dc:title>/);
    // Word would show "Blank" as the author
    expect(core).not.toMatch(/Blank/);
  });

  it("takes the title and author from the frontmatter", async () => {
    const core = await (
      await exportMarkdown(
        "---\ntitle: The Lighthouse\nauthor: [Ada, Grace]\n---\n\n# Chapter 1",
      )
    ).text("docProps/core.xml");

    expect(core).toMatch(/<dc:title>The Lighthouse<\/dc:title>/);
    expect(core).toMatch(/<dc:creator>Ada, Grace<\/dc:creator>/);
    expect(core).toMatch(/<cp:lastModifiedBy>Ada, Grace<\/cp:lastModifiedBy>/);
  });

  it("keeps the frontmatter in a custom property", async () => {
    const frontmatter = "# kept\ntags: [a, b]\ntitle: <Hi & bye>";
    const exported = await exportMarkdown(`---\n${frontmatter}\n---\n\ntext`);

    const custom = await exported.xml("docProps/custom.xml");
    const property = [...custom.getElementsByTagName("property")].find(
      (element) => element.getAttribute("name") === "BlankFrontmatter",
    );
    expect(property?.textContent).toBe(frontmatter);
  });

  it("writes no custom property without frontmatter", async () => {
    const exported = await exportMarkdown("text");

    const custom = exported.zip.file("docProps/custom.xml");
    expect(custom ? await custom.async("string") : "").not.toMatch(
      /BlankFrontmatter/,
    );
  });

  it("leaves out the empty comments that Google Drive rejects", async () => {
    const exported = await exportMarkdown("text");

    expect(exported.zip.file("word/comments.xml")).toBeNull();
    expect(await exported.text("word/_rels/document.xml.rels")).not.toMatch(
      /comments\.xml/,
    );
    expect(await exported.text("[Content_Types].xml")).not.toMatch(
      /comments\.xml/,
    );
  });
});

describe("exporter.docx tables", () => {
  // the rows of the first table with, per cell, its text and properties
  const tableOf = async (exported: Exported) => {
    const [table] = all(await exported.xml("word/document.xml"), "tbl");
    const rows = all(table, "tr").map((row) => ({
      header: child(row, "tblHeader") !== undefined,
      cantSplit: child(row, "cantSplit") !== undefined,
      cells: all(row, "tc").map((cell) => ({
        text: all(cell, "t")
          .map((t) => t.textContent)
          .join(""),
        span: attr(child(cell, "gridSpan"), "val"),
        merge: child(cell, "vMerge")
          ? (attr(child(cell, "vMerge"), "val") ?? "continue")
          : null,
        fill: attr(child(cell, "shd"), "fill"),
        style: attr(child(cell, "pStyle"), "val"),
        align: attr(child(cell, "jc"), "val"),
      })),
    }));
    return { table, rows };
  };

  it("writes a table with its header row repeated and rows kept whole", async () => {
    const exported = await exportMarkdown(
      "| Name | Qty |\n| ---- | --: |\n| a    |   1 |",
    );
    const { rows } = await tableOf(exported);

    expect(rows.map(({ header, cantSplit }) => [header, cantSplit])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(rows[0].cells).toMatchObject([
      { text: "Name", fill: "F1F2F3", style: "TableHeading", align: null },
      { text: "Qty", style: "TableHeading", align: "right" },
    ]);
    expect(rows[1].cells).toMatchObject([
      { text: "a", fill: null, style: null },
      { text: "1", align: "right" },
    ]);
    // the line under the header row, in the colour of the PDF's
    expect(await exported.text("word/document.xml")).toMatch(
      /w:color="82898E"/,
    );
  });

  it("draws lines like the PDF and sizes the columns by their content", async () => {
    const { table } = await tableOf(
      await exportMarkdown("| Name | Description |\n| --- | --- |\n| a | b |"),
    );
    const borders = child(table, "tblBorders")!;
    const border = (side: string) => attr(child(borders, side), "val");

    expect(["top", "left", "right"].map(border)).toEqual([
      "none",
      "none",
      "none",
    ]);
    expect(["bottom", "insideH", "insideV"].map(border)).toEqual([
      "single",
      "single",
      "single",
    ]);
    const widths = all(child(table, "tblGrid")!, "gridCol").map((col) =>
      Number(attr(col, "w")),
    );
    expect(widths[0] / widths[1]).toBeCloseTo(4 / 11);
    expect(attr(child(table, "tblLayout"), "type")).toBe("fixed");
  });

  it("is as wide as the text of the page", async () => {
    const widthOn = async (layout: ReturnType<typeof testLayout>) => {
      const exported = await exportDoc(
        parseMarkdown("| a | b |\n| - | - |\n| c | d |"),
        null,
        layout,
      );
      const { table } = await tableOf(exported);
      return Number(attr(child(table, "tblW"), "w"));
    };
    const landscape = testLayout({ orientation: "landscape" });

    expect(await widthOn(testLayout())).toBe(
      Math.round(pageGeometry(testLayout()).contentWidth * 20),
    );
    expect(await widthOn(landscape)).toBe(
      Math.round(pageGeometry(landscape).contentWidth * 20),
    );
  });

  it("merges cells across columns and rows", async () => {
    const { rows } = await tableOf(
      await exportMarkdown(
        [
          "<table>",
          '  <tr><th colspan="2">Q1</th></tr>',
          '  <tr><td rowspan="2">Jan</td><td>1</td></tr>',
          "  <tr><td>2</td></tr>",
          "</table>",
        ].join("\n"),
      ),
    );

    expect(rows[0].cells).toMatchObject([{ text: "Q1", span: "2" }]);
    expect(rows[1].cells).toMatchObject([
      { text: "Jan", merge: "restart" },
      { text: "1" },
    ]);
    expect(rows[2].cells).toMatchObject([
      { text: "", merge: "continue" },
      { text: "2" },
    ]);
  });

  it("puts the caption above the table in Word's caption style", async () => {
    const exported = await exportMarkdown(
      "<table><caption>Stock</caption><tr><th>a</th></tr><tr><td>b</td></tr></table>",
    );

    const [caption] = await paragraphs(exported);
    expect(caption).toMatchObject({ style: "Caption", text: "Stock" });
    const [body] = all(await exported.xml("word/document.xml"), "body");
    expect(body.firstElementChild?.localName).toBe("p");
    expect(body.firstElementChild?.nextElementSibling?.localName).toBe("tbl");
  });

  it("styles the header cells of a header column", async () => {
    const { rows } = await tableOf(
      await exportMarkdown(
        '<table><tr><th>a</th><th>b</th></tr><tr><th scope="row">c</th><td>d</td></tr></table>',
      ),
    );

    expect(rows[1].cells).toMatchObject([
      { style: "TableHeading", fill: "F1F2F3" },
      { style: null, fill: null },
    ]);
  });

  it("indents a table in a list like the list's text", async () => {
    const { table } = await tableOf(
      await exportMarkdown("- item\n\n  | a |\n  | - |\n  | b |"),
    );

    expect(attr(child(table, "tblInd"), "w")).toBe("720");
  });

  it("spaces the block after a table", async () => {
    const exported = await exportMarkdown("| a |\n| - |\n| b |\n\nafter");

    const [, , after] = await paragraphs(exported);
    expect(after.text).toBe("after");
    expect(attr(child(after.p, "spacing"), "before")).toBe("160");
  });

  it("lets rows break across pages when a cell might not fit on one", async () => {
    const { rows } = await tableOf(
      await exportMarkdown(`| a |\n| - |\n| ${"x".repeat(700)} |`),
    );

    expect(rows.every(({ cantSplit }) => !cantSplit)).toBe(true);
  });

  it("fits images to their cell", async () => {
    const png = dataUrl("image/png", IMAGES.png);
    const exported = await exportMarkdown(
      `| a | ${"b".repeat(40)} |\n| - | - |\n| ![x](${png}) | c |`,
    );

    const extent = (await exported.text("word/document.xml")).match(
      /<wp:extent cx="(\d+)"/,
    );
    // 3 × 2 pixels fit the first column, which is 3 of 43 characters wide
    expect(Number(extent![1])).toBe(3 * 9525);
  });
});
