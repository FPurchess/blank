import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  markdownSerializer,
  parseMarkdown,
  schema,
  serializeMarkdown,
} from "../../markdown";

import toDOCX from "../../exporters/docx";
import type { Node } from "prosemirror-model";

import { blockquote, createState, doc, p } from "../../test/editor";
import { resolveLayout } from "../../layout/resolve";
import { allMargins, DEFAULT_PAGE } from "../../layout/settings";
import { rewriteDocx } from "../../test/docx";
import { IMAGES, dataUrl } from "../../test/images";
import { importDocx } from ".";

vi.mock("../../images/codec", () => ({
  decodeSize: vi.fn(),
  rasterize: vi.fn(),
}));
vi.mock("../../exporters/docx/font", () => ({
  loadFonts: async () => [
    { name: "IBM Plex Sans", data: new TextEncoder().encode("font") },
    { name: "IBM Plex Mono", data: new TextEncoder().encode("font") },
  ],
}));

// made by scripts/build-docx-fixtures.sh; tests run from the project root
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join("src/importers/docx/__fixtures__", name)));

const toMarkdown = async (bytes: Uint8Array) => {
  const { doc, warnings, page } = await importDocx(bytes, DEFAULT_PAGE);
  return { markdown: serializeMarkdown(doc), warnings, page, doc };
};

/**
 * exportDocx exports `markdown` as a Word document on the page its
 * frontmatter and Blank's defaults give, like exportAs
 */
const exportDocx = async (markdown: string | Node) => {
  const doc = typeof markdown === "string" ? parseMarkdown(markdown) : markdown;
  const { layout } = resolveLayout(doc.attrs.frontmatter, DEFAULT_PAGE);
  return (await toDOCX(createState(doc), { docPath: null, layout })).contents;
};

/**
 * roundTrip exports `markdown` as a Word document and imports it again
 */
const roundTrip = async (markdown: string | Node) =>
  (await toMarkdown(await exportDocx(markdown))).markdown;

// sets the title and author of a Word document, like Word's File → Info
const setCore = (bytes: Uint8Array, title: string, author: string) =>
  rewriteDocx(bytes, "docProps/core.xml", (xml = "") =>
    xml
      .replace(/<dc:(title|creator)>[^<]*<\/dc:\1>/g, "")
      .replace(
        /<cp:coreProperties[^>]*>/,
        (start) =>
          `${start}<dc:title>${title}</dc:title><dc:creator>${author}</dc:creator>`,
      ),
  );

const PNG = dataUrl("image/png", IMAGES.png);

describe("importers.docx", () => {
  // The first Word export and import load docx and mammoth
  // (src/exporters/docx/index.ts, ./index.ts) and set them up: about 350 ms
  // here, against 110 ms for each one after it, and many times that on a
  // loaded machine. Pay that once, here, with a timeout of its own, rather
  // than in whichever test runs first.
  beforeAll(async () => {
    await roundTrip("warm up");
  }, 60_000);

  // each test writes a .docx and reads it back through docx, JSZip and
  // mammoth, about 110 ms here; give them room on a machine under heavy load
  describe("round trip through the Word export", { timeout: 20_000 }, () => {
    it.each([
      ["a pipe table", "| Name | Qty |\n| ---- | --- |\n| a    | 1   |"],
      [
        "formatting and line breaks in cells",
        "| a<br>b | c     |\n| ------ | ----- |\n| `x\\|y` | **z** |",
      ],
      [
        "merged cells and a caption",
        [
          "<table>",
          "  <caption>Stock</caption>",
          "  <thead>",
          "    <tr>",
          '      <th scope="col" colspan="2">Q1</th>',
          "    </tr>",
          "  </thead>",
          "  <tbody>",
          "    <tr>",
          '      <td rowspan="2">Jan</td>',
          "      <td>1</td>",
          "    </tr>",
          "    <tr>",
          "      <td>2</td>",
          "    </tr>",
          "  </tbody>",
          "</table>",
        ].join("\n"),
      ],
      [
        "a header column",
        [
          "<table>",
          "  <thead>",
          "    <tr>",
          '      <th scope="col">a</th>',
          '      <th scope="col">b</th>',
          "    </tr>",
          "  </thead>",
          "  <tbody>",
          "    <tr>",
          '      <th scope="row">c</th>',
          "      <td>d</td>",
          "    </tr>",
          "  </tbody>",
          "</table>",
        ].join("\n"),
      ],
    ])("keeps %s", async (_, markdown) => {
      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps everything markdown in Blank can express", async () => {
      const markdown = [
        "# Heading 1",
        "## Heading 2",
        "### Heading 3",
        "#### Heading 4",
        "##### Heading 5",
        "###### Heading 6",
        "A paragraph with *emphasis*, **strong**, `code` and a [link](https://example.com).\\\nAfter a hard break.",
        "> A quote.\n>\n> Its second paragraph.",
        "```\nfunction hello() {\n\n  return 1;\n}\n```",
        "---",
        "* bullet\n* list\n  * nested\n  * items\n* end",
        "1. ordered\n2. list",
        `An image: ![alt text](${PNG})`,
      ].join("\n\n");

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps the frontmatter as it was written", async () => {
      const markdown =
        "---\n# notes\ntitle: The Lighthouse\nauthor: [Ada, Grace]\ntags: [sea]\n---\n\n# Chapter 1\n\ntext";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("adds no frontmatter to a document without it", async () => {
      const markdown = "# Report\n\ntext";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("takes the title and author changed in Word", async () => {
      const exported = await exportDocx(
        "---\ntitle: Draft\ntags: [sea]\n---\n\n# Chapter 1",
      );

      const { markdown } = await toMarkdown(
        await setCore(exported, "The Lighthouse", "Ada"),
      );

      expect(markdown).toBe(
        "---\ntitle: The Lighthouse\ntags: [sea]\nauthor: Ada\n---\n\n# Chapter 1",
      );
    });

    it("drops the title and author removed in Word", async () => {
      const exported = await exportDocx(
        "---\ntitle: Draft\nauthor: Ada\ntags: [sea]\n---\n\n# Chapter 1",
      );

      const { markdown } = await toMarkdown(await setCore(exported, "", ""));

      expect(markdown).toBe("---\ntags: [sea]\n---\n\n# Chapter 1");
    });

    it("keeps frontmatter it can't read, whatever Word changed", async () => {
      const exported = await exportDocx("---\ntitle: a: b\n---\n\n# Chapter 1");

      const { markdown } = await toMarkdown(
        await setCore(exported, "The Lighthouse", "Ada"),
      );

      expect(markdown).toBe("---\ntitle: a: b\n---\n\n# Chapter 1");
    });

    it("keeps the page setup", async () => {
      const markdown =
        "---\npage:\n  size: a5\n  orientation: landscape\n  margins:\n    top: 3cm\n    right: 2cm\n    bottom: 2cm\n    left: 2cm\n---\n\ntext";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps a custom paper size", async () => {
      const markdown = "---\npage:\n  size: 170mm x 240mm\n---\n\ntext";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("takes the page setup changed in Word", async () => {
      const exported = await exportDocx(
        "---\ntags: [sea]\npage:\n  size: a5\n---\n\ntext",
      );
      // landscape Letter with 1 inch margins, as Word's page setup writes it
      const changed = await rewriteDocx(
        exported,
        "word/document.xml",
        (xml = "") =>
          xml
            .replace(
              /<w:pgSz [^>]*\/>/,
              '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>',
            )
            .replace(
              /<w:pgMar [^>]*\/>/,
              '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>',
            ),
      );

      const { markdown, page } = await toMarkdown(changed);

      expect(markdown).toBe(
        "---\ntags: [sea]\npage:\n  size: letter\n  orientation: landscape\n  margins: 1in\n---\n\ntext",
      );
      expect(page).toBe("Letter landscape");
    });

    it("keeps page breaks: single, in a row and at the end", async () => {
      const markdown = [
        "a",
        "<!-- pagebreak -->",
        "b",
        "<!-- pagebreak -->",
        "<!-- pagebreak -->",
        "c",
        "<!-- pagebreak -->",
      ].join("\n\n");

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps the header, footer, plain first page and start number", async () => {
      const markdown =
        '---\ntitle: The Lighthouse\nauthor: Ada\npage:\n  header: {left: "{title}", right: "by {author}"}\n  footer: {center: "Page {page} of {pages}"}\n  first-page: plain\n  start-number: 0\n---\n\n# Chapter 1';

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps the first and even pages' own, the fields and roman numbers", async () => {
      const markdown =
        '---\npage:\n  header: {left: "{chapter}", right: "{date}"}\n  footer: {right: "{page}"}\n  first-page:\n    header: {left: ACME, right: "{file}"}\n  even-pages:\n    header: {left: "{date}", right: "{chapter}"}\n    footer: {left: "{page}"}\n  number-style: i\n---\n\n# Chapter 1';

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps braces typed in a header", async () => {
      const markdown =
        '---\npage:\n  header: {left: "{{draft} {page}"}\n---\n\ntext';

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps a page break before a table", async () => {
      const markdown =
        "a\n\n<!-- pagebreak -->\n\n| b   | c   |\n| --- | --- |\n| d   | e   |";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    it("keeps chapters on new pages, and a page break before one", async () => {
      const markdown =
        "---\npage:\n  new-page-before: [1, 2]\n---\n\n# One\n\na\n\n<!-- pagebreak -->\n\n# Two\n\n## Section";

      expect(await roundTrip(markdown)).toBe(markdown);
    });

    // what a Word document written by Blank can't carry back, one test each so
    // an improvement shows up here

    it("loses the start number of ordered lists", async () => {
      expect(await roundTrip("3. three\n4. four")).toBe("1. three\n2. four");
    });

    it("makes loose lists of single paragraphs tight", async () => {
      expect(await roundTrip("* a\n\n* b")).toBe("* a\n* b");
    });

    it("loses the language of code blocks", async () => {
      expect(await roundTrip("```js\nlet a;\n```")).toBe("```\nlet a;\n```");
    });

    it("loses the titles of links and images", async () => {
      expect(
        await roundTrip(
          `[a](https://example.com "Title") ![b](${PNG} "Title")`,
        ),
      ).toBe(`[a](https://example.com) ![b](${PNG})`);
    });

    it("takes lists and headings out of blockquotes", async () => {
      expect(await roundTrip("> # Title\n>\n> * item")).toBe(
        "# Title\n\n* item",
      );
    });

    it("loses the alignment of table columns", async () => {
      expect(
        await roundTrip("| a   |   b |\n| :-- | --: |\n| c   |   d |"),
      ).toBe("| a   | b   |\n| --- | --- |\n| c   | d   |");
    });

    it("splits a quote at a page break in it", async () => {
      expect(await roundTrip("> a\n>\n> <!-- pagebreak -->\n>\n> b")).toBe(
        "> a\n\n<!-- pagebreak -->\n\n> b",
      );
    });

    it("merges adjacent blockquotes", async () => {
      expect(
        await roundTrip(doc(blockquote(p("one")), blockquote(p("two")))),
      ).toBe("> one\n>\n> two");
    });
  });

  describe.each(["pandoc", "libreoffice"])("a document from %s", (writer) => {
    it("keeps headings, formatting, links, quotes, lists, code and images", async () => {
      const { markdown } = await toMarkdown(fixture(`${writer}.docx`));

      expect(markdown).toContain("# Fixture\n\n## Formatting");
      expect(markdown).toContain(
        "A paragraph with *emphasis*, **strong**, `inline code` and a [link](https://example.com",
      );
      expect(markdown).toContain("A hard break follows:\\\nthe next line.");
      expect(markdown).toContain("> A quoted paragraph.");
      expect(markdown).toContain(
        "* first\n* second\n  1. nested one\n  2. nested two\n* third",
      );
      expect(markdown).toContain(
        '```\nfunction hello() {\n  return "world";\n}\n```',
      );
      expect(markdown).toContain(`${dataUrl("image/png", "")}`);
      expect(markdown).toContain(`${dataUrl("image/jpeg", "")}`);
    });

    it("keeps tables with merged cells and footnotes at the end", async () => {
      const { markdown, warnings } = await toMarkdown(
        fixture(`${writer}.docx`),
      );

      // pandoc keeps the caption, which makes it an HTML table; the
      // LibreOffice fixture loses its caption style on the way through ODT
      expect(markdown).toContain(
        writer === "pandoc"
          ? "      <td>a</td>\n      <td>1</td>"
          : "| a    | 1     |\n| b    | 2     |",
      );
      expect(markdown).toContain('      <th scope="col" colspan="3">Q1</th>');
      expect(markdown).toContain('      <td colspan="2">North</td>');
      expect(markdown).toMatch(/A sentence with a footnote\.\\\[1\\\]/);
      expect(markdown).toMatch(/---\n\n1\. The footnote\.\s*$/);
      expect(warnings).toEqual(["1 footnote moved to the end"]);
    });
  });

  it("keeps pandoc's table captions", async () => {
    const { markdown } = await toMarkdown(fixture("pandoc.docx"));

    expect(markdown).toContain("<table>\n  <caption>Values</caption>");
  });

  it("keeps LibreOffice's horizontal lines", async () => {
    const { markdown } = await toMarkdown(fixture("libreoffice.docx"));

    expect(markdown).toContain("}\n```\n\n---\n\n");
  });

  it("writes the alt text of images it can't import", async () => {
    const contents = await exportDocx(`![Chart](${PNG})`);
    // replace the embedded image with an EMF, which the webview can't decode
    const zip = await JSZip.loadAsync(contents);
    const [media] = zip.file(/^word\/media\//);
    const emf = new Uint8Array(88);
    emf.set([0x20, 0x45, 0x4d, 0x46], 40);
    zip.file(media.name, emf);
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const { markdown, warnings } = await toMarkdown(bytes);

    expect(markdown).toBe("*Chart*");
    expect(warnings).toEqual(["1 image couldn't be imported"]);
  });

  it("leaves out comments", async () => {
    const docx = await import("docx");
    const document = new docx.Document({
      comments: {
        children: [
          { id: 0, author: "A", children: [new docx.Paragraph("a remark")] },
        ],
      },
      sections: [
        {
          children: [
            new docx.Paragraph({
              children: [
                new docx.CommentRangeStart(0),
                new docx.TextRun("commented"),
                new docx.CommentRangeEnd(0),
                new docx.TextRun({ children: [new docx.CommentReference(0)] }),
              ],
            }),
          ],
        },
      ],
    });

    const { doc, warnings } = await toMarkdown(
      await docx.Packer.pack(document, "uint8array"),
    );

    expect(markdownSerializer.serialize(doc)).toBe("commented");
    expect(warnings).toEqual(["1 comment left out"]);
  });

  it("writes the page setup of a Word document that differs from the user's", async () => {
    const docx = await import("docx");
    // docx's default page: A4 with 1 inch margins
    const bytes = await docx.Packer.pack(
      new docx.Document({
        sections: [{ children: [new docx.Paragraph("text")] }],
      }),
      "uint8array",
    );

    const { markdown, page } = await toMarkdown(bytes);

    expect(markdown).toBe(
      "---\npage:\n  size: a4\n  margins: 1in\n---\n\ntext",
    );
    expect(page).toBe("A4");
  });

  it("writes nothing for the page the user's defaults give", async () => {
    const docx = await import("docx");
    const bytes = await docx.Packer.pack(
      new docx.Document({
        sections: [{ children: [new docx.Paragraph("text")] }],
      }),
      "uint8array",
    );

    const { doc, page } = await importDocx(bytes, {
      ...DEFAULT_PAGE,
      size: "a4",
      margins: allMargins(72),
    });

    expect(doc.attrs.frontmatter).toBeNull();
    expect(page).toBeNull();
  });

  it("keeps the page breaks of a Word document", async () => {
    const docx = await import("docx");
    const bytes = await docx.Packer.pack(
      new docx.Document({
        sections: [
          {
            children: [
              new docx.Paragraph({
                children: [
                  new docx.TextRun("a"),
                  new docx.PageBreak(),
                  new docx.TextRun("b"),
                ],
              }),
              new docx.Paragraph({ text: "c", pageBreakBefore: true }),
            ],
          },
          { children: [new docx.Paragraph("next section")] },
        ],
      }),
      "uint8array",
    );

    const { doc } = await toMarkdown(bytes);

    expect(markdownSerializer.serialize(doc)).toBe(
      [
        "a",
        "<!-- pagebreak -->",
        "b",
        "<!-- pagebreak -->",
        "c",
        "<!-- pagebreak -->",
        "next section",
      ].join("\n\n"),
    );
  });

  it("imports an empty document as an empty paragraph", async () => {
    const docx = await import("docx");
    const bytes = await docx.Packer.pack(
      new docx.Document({ sections: [{ children: [] }] }),
      "uint8array",
    );

    const { doc } = await importDocx(bytes);

    expect(doc.content.toJSON()).toEqual(
      schema.node("doc", null, [schema.node("paragraph")]).content.toJSON(),
    );
  });

  it("refuses files that aren't Word documents", async () => {
    await expect(
      importDocx(new TextEncoder().encode("# markdown")),
    ).rejects.toThrow("not a Word document");
  });
});
