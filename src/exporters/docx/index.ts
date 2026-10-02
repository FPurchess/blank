import type {
  IParagraphOptions,
  ParagraphChild,
  INumberingOptions,
  Paragraph,
  Table,
} from "docx";
import type { Mark, Node } from "prosemirror-model";

import { type exporterFunc } from "../../exporters";
import { fitBox } from "../../images/fit";
import {
  type PreparedImage,
  failureWarning,
  prepareImages,
} from "../../images/prepare";
import { pageGeometry } from "../../layout/resolve";
import { POINTS_PER_PIXEL } from "../../layout/units";
import {
  cellShare,
  hasTallRows,
  tableGrid,
  type GridCell,
  type TableGrid,
} from "../table";
import { documentFields } from "../../layout/bands";
import { bandSections } from "./bands";
import { fixPackage } from "./fixups";
import { FRONTMATTER_PROPERTY } from "./properties";
import {
  BLOCK_SPACING,
  BULLET_LEVELS,
  HEADING_AFTER_HEADING_SPACING,
  LIST_HANGING,
  LIST_INDENT,
  LIST_ITEM_SPACING,
  QUOTE_BORDER,
  QUOTE_INDENT,
  STYLE,
  TABLE_BORDERS,
  TABLE_CELL_MARGINS,
  TABLE_HEADER_BORDER,
  TABLE_HEADER_SHADING,
  orderedLevels,
  pageProperties,
  stylesFor,
  twips,
} from "./template";
import { loadFonts } from "./font";

type Docx = typeof import("docx");

// the images Word can embed as they are, others are converted to PNG
const EMBEDDABLE = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/bmp",
] as const;
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
} as const;

const BULLET_REFERENCE = "bullet";
const orderedReference = (start: number) => `ordered-${start}`;

// where a block sits: inside how many blockquotes and list levels
interface Position {
  quotes: number;
  // whether the block is a direct child of a blockquote
  inQuote: boolean;
  // list nesting depth, -1 outside of lists
  level: number;
}

const TOP: Position = { quotes: 0, inQuote: false, level: -1 };

// a paragraph, or a table, which is a block of its own in Word
type Block = IParagraphOptions | Table;

// Word measures images in pixels, and tables in twentieths of a point
const twipsToPixels = (twips: number) => twips / 20 / POINTS_PER_PIXEL;

class Serializer {
  // the ordered list starts that need a numbering definition
  private starts = new Set<number>();
  // each list gets its own numbering instance, so it counts from its start
  private instances = 0;
  private imageCount = 0;
  // the width of the text, in twentieths of a point
  private contentWidth: number;
  // the largest image that fits the page, or the cell being serialized, in
  // pixels at 96 dpi like Word
  private maxImageWidth: number;
  private maxImageHeight: number;

  constructor(
    private docx: Docx,
    private images: Map<string, PreparedImage>,
    // the room for the text on the page, in points
    content: { width: number; height: number },
  ) {
    this.contentWidth = twips(content.width);
    this.maxImageWidth = content.width / POINTS_PER_PIXEL;
    this.maxImageHeight = content.height / POINTS_PER_PIXEL;
  }

  numbering(): INumberingOptions {
    return {
      config: [
        { reference: BULLET_REFERENCE, levels: BULLET_LEVELS },
        ...[...this.starts].map((start) => ({
          reference: orderedReference(start),
          levels: orderedLevels(start),
        })),
      ],
    };
  }

  /**
   * indent returns the left indent of a block that isn't numbered, so it
   * lines up with the text of its list item and its blockquotes
   */
  private indent(position: Position) {
    const left = indentOf(position);
    return left ? { indent: { left } } : {};
  }

  isTable(block: Block): block is Table {
    return block instanceof this.docx.Table;
  }

  /**
   * decoration returns the formatting that marks a block as quoted: the quote
   * style for paragraphs of a blockquote, its border for other blocks (e.g. a
   * list in a blockquote), which keep their own style
   */
  private decoration(position: Position, isParagraph: boolean) {
    if (position.quotes === 0) return {};
    if (isParagraph && position.inQuote) return { style: STYLE.quote };
    return { border: { left: QUOTE_BORDER } };
  }

  /**
   * blocks writes the blocks of `parent`, from its child `from` on
   */
  blocks(parent: Node, position: Position, from = 0): Block[] {
    const blocks: Block[] = [];
    // A page break starts the page of the block after it, as Word's "Page
    // break before": a paragraph that holds a break would start the next
    // page with an empty line. Two breaks in a row leave an empty page, and
    // a table, which can't start a page itself, gets an empty paragraph that
    // does before it.
    let pageBreak = false;
    const newPage = () => ({ pageBreakBefore: true, ...this.indent(position) });
    parent.forEach((node, _, index) => {
      if (index < from) return;
      if (node.type.name === "page_break") {
        if (pageBreak) blocks.push(newPage());
        pageBreak = true;
        return;
      }
      const converted = this.block(node, position);
      if (pageBreak && converted.length) {
        const [first] = converted;
        if (this.isTable(first)) blocks.push(newPage());
        else converted[0] = { ...first, pageBreakBefore: true };
        pageBreak = false;
      }
      blocks.push(...converted);
    });
    if (pageBreak) blocks.push(newPage());
    return blocks;
  }

  private block(node: Node, position: Position): Block[] {
    const { HeadingLevel } = this.docx;

    switch (node.type.name) {
      case "heading":
        return [
          {
            heading:
              HeadingLevel[
                `HEADING_${node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6}`
              ],
            children: this.inline(node),
            ...this.decoration(position, false),
            ...this.indent(position),
          },
        ];

      case "paragraph":
        return [
          {
            children: this.inline(node),
            ...this.decoration(position, true),
            ...this.indent(position),
          },
        ];

      case "blockquote":
        return this.blocks(node, {
          ...position,
          quotes: position.quotes + 1,
          inQuote: true,
        });

      case "code_block": {
        const lines = node.textContent.split("\n");
        return lines.map((text, index) => ({
          style: STYLE.codeBlock,
          children: text ? [new this.docx.TextRun(text)] : [],
          ...this.decoration(position, false),
          ...this.indent(position),
          ...(index === lines.length - 1
            ? { spacing: { after: BLOCK_SPACING } }
            : {}),
        }));
      }

      case "horizontal_rule":
        return [{ style: STYLE.horizontalLine, ...this.indent(position) }];

      case "bullet_list":
      case "ordered_list":
        return this.list(node, position);

      case "table":
        return this.table(node, position);

      default:
        // there are no other block nodes in the markdown schema
        return [];
    }
  }

  private list(node: Node, position: Position): Block[] {
    const ordered = node.type.name === "ordered_list";
    const start = (node.attrs.order as number | undefined) ?? 1;
    if (ordered) this.starts.add(start);
    const reference = ordered ? orderedReference(start) : BULLET_REFERENCE;
    const instance = ++this.instances;
    const tight = node.attrs.tight as boolean;
    const level = position.level + 1;
    const itemPosition = { ...position, inQuote: false, level };

    const blocks: Block[] = [];
    node.forEach((item) => {
      const first = item.firstChild;
      if (first?.type.name !== "paragraph") {
        // an item can start with any block, e.g. a page break, and then has
        // no bullet or number
        blocks.push(...this.blocks(item, itemPosition));
        return;
      }
      // the item's own paragraph carries the bullet or number, indented by
      // the numbering unless it is quoted
      blocks.push({
        children: this.inline(first),
        numbering: { reference, level, instance },
        ...this.decoration(itemPosition, false),
        ...(position.quotes
          ? {
              indent: {
                left:
                  QUOTE_INDENT * position.quotes + LIST_INDENT * (level + 1),
                hanging: LIST_HANGING,
              },
            }
          : {}),
        ...(tight ? { spacing: { after: LIST_ITEM_SPACING } } : {}),
      });
      // the blocks after it, page breaks included
      blocks.push(...this.blocks(item, itemPosition, 1));
    });
    // a list is spaced from the next block like a paragraph, also when it is tight
    const last = blocks[blocks.length - 1];
    if (position.level < 0 && last && !this.isTable(last)) {
      blocks[blocks.length - 1] = {
        ...last,
        spacing: { ...last.spacing, after: BLOCK_SPACING },
      };
    }
    return blocks;
  }

  /**
   * table writes a table like the PDF: the header rows repeat on every page,
   * rows stay whole unless they might not fit on one, and the caption goes
   * above the table in Word's caption style
   */
  private table(node: Node, position: Position): Block[] {
    const { Table, TableRow, TableCell, TableLayoutType, TextRun, WidthType } =
      this.docx;
    const grid = tableGrid(node);
    const left = indentOf(position);
    const width = this.contentWidth - left;
    const cantSplit = !hasTallRows(node);
    const rows = grid.rows.map(
      (cells, index) =>
        new TableRow({
          // only set when true: docx writes false ones, which mammoth reads
          // as true
          ...(index < grid.headerRows ? { tableHeader: true } : {}),
          ...(cantSplit ? { cantSplit } : {}),
          // Word adds the cells that continue a merged cell itself
          children: cells
            .filter((cell): cell is GridCell => cell !== null)
            .map(
              (cell) =>
                new TableCell({
                  children: this.cellContent(cell, grid, width),
                  ...(cell.colspan > 1 ? { columnSpan: cell.colspan } : {}),
                  ...(cell.rowspan > 1 ? { rowSpan: cell.rowspan } : {}),
                  margins: TABLE_CELL_MARGINS,
                  ...(cell.header ? { shading: TABLE_HEADER_SHADING } : {}),
                  ...(cell.row + cell.rowspan === grid.headerRows
                    ? { borders: { bottom: TABLE_HEADER_BORDER } }
                    : {}),
                }),
            ),
        }),
    );
    const table = new Table({
      rows,
      width: { size: width, type: WidthType.DXA },
      columnWidths: grid.widths.map((share) => Math.round(share * width)),
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      ...(left ? { indent: { size: left, type: WidthType.DXA } } : {}),
    });
    const caption = node.attrs.caption as string | null;
    if (!caption) return [table];
    return [
      {
        style: STYLE.caption,
        children: [new TextRun(caption)],
        ...this.indent(position),
      },
      table,
    ];
  }

  /**
   * cellContent writes the blocks of `cell`, aligned like the cell, in the
   * table heading style in a header cell, and without space after the last
   */
  private cellContent(
    cell: GridCell,
    grid: TableGrid,
    width: number,
  ): (Paragraph | Table)[] {
    const margins = TABLE_CELL_MARGINS.left + TABLE_CELL_MARGINS.right;
    const outer = this.maxImageWidth;
    this.maxImageWidth = twipsToPixels(cellShare(grid, cell) * width - margins);
    const blocks = this.blocks(cell.node, TOP);
    this.maxImageWidth = outer;

    const align = cell.node.attrs.align as "left" | "center" | "right" | null;
    return blocks.map((block, index) =>
      this.isTable(block)
        ? block
        : new this.docx.Paragraph({
            ...block,
            ...(cell.header && !block.style
              ? { style: STYLE.tableHeading }
              : {}),
            ...(align ? { alignment: align } : {}),
            ...(index === blocks.length - 1
              ? { spacing: { ...block.spacing, after: 0 } }
              : {}),
          }),
    );
  }

  inline(parent: Node): ParagraphChild[] {
    const { ExternalHyperlink } = this.docx;
    const children: ParagraphChild[] = [];
    // runs of text that share a link become one hyperlink
    let link: { href: string; runs: ParagraphChild[] } | null = null;
    const flush = () => {
      if (link) {
        children.push(
          new ExternalHyperlink({ link: link.href, children: link.runs }),
        );
      }
      link = null;
    };

    parent.forEach((node) => {
      const href = linkOf(node);
      if (href === null || href !== link?.href) flush();
      if (href !== null) {
        link ??= { href, runs: [] };
        link.runs.push(this.run(node, true));
      } else {
        children.push(this.run(node, false));
      }
    });
    flush();
    return children;
  }

  private run(node: Node, linked: boolean): ParagraphChild {
    const { TextRun } = this.docx;
    switch (node.type.name) {
      case "hard_break":
        return new TextRun({ break: 1 });
      case "image":
        return this.image(node);
      default: {
        const code = hasMark(node, "code");
        return new TextRun({
          text: node.text ?? "",
          bold: hasMark(node, "strong") || undefined,
          italics: hasMark(node, "em") || undefined,
          style: code ? STYLE.inlineCode : linked ? STYLE.hyperlink : undefined,
        });
      }
    }
  }

  private image(node: Node): ParagraphChild {
    const { ImageRun, TextRun } = this.docx;
    const src = node.attrs.src as string;
    const alt = node.attrs.alt as string | null;
    const title = node.attrs.title as string | null;
    const image = this.images.get(src);
    if (!image) return new TextRun({ text: alt || src, italics: true });

    const size = fitBox(image, this.maxImageWidth, this.maxImageHeight);
    return new ImageRun({
      type: IMAGE_TYPES[image.mime as keyof typeof IMAGE_TYPES],
      data: image.bytes,
      transformation: {
        width: Math.round(size.width),
        height: Math.round(size.height),
      },
      altText: {
        name: `image-${++this.imageCount}`,
        description: alt ?? "",
        title: title ?? "",
      },
    });
  }
}

/**
 * indentOf returns the left indent of a block that isn't numbered, so it
 * lines up with the text of its list item and its blockquotes
 */
const indentOf = (position: Position) =>
  QUOTE_INDENT * position.quotes +
  (position.level >= 0 ? LIST_INDENT * (position.level + 1) : 0);

const hasMark = (node: Node, name: string) =>
  node.marks.some((mark: Mark) => mark.type.name === name);

// the href of a linked text node; links to anchors have nothing to point to
const linkOf = (node: Node) => {
  const link = node.marks.find((mark: Mark) => mark.type.name === "link");
  const href = link?.attrs.href as string | undefined;
  return href && !href.startsWith("#") && node.isText ? href : null;
};

/**
 * spaceTopLevel adjusts the spacing that depends on the previous block, like
 * adjustMargins in the PDF export: Word, unlike CSS, adds the space after a
 * block and the space before the next one. A table has no space after it, so
 * the block after a table gets it before.
 */
const spaceTopLevel = (blocks: Block[], serializer: Serializer) =>
  blocks.map((block, index) => {
    if (serializer.isTable(block)) return block;
    const previous = blocks[index - 1];
    const before =
      index === 0
        ? 0
        : serializer.isTable(previous)
          ? BLOCK_SPACING
          : block.heading && previous.heading
            ? HEADING_AFTER_HEADING_SPACING
            : undefined;
    return before === undefined
      ? block
      : { ...block, spacing: { ...block.spacing, before } };
  });

const toDOCX: exporterFunc = async (state, { docPath, layout }) => {
  const docx = await import("docx");
  const [fonts, { images, failures }] = await Promise.all([
    loadFonts(),
    prepareImages(state.doc, docPath, [...EMBEDDABLE]),
  ]);

  const { contentWidth, contentHeight } = pageGeometry(layout);
  const serializer = new Serializer(docx, images, {
    width: contentWidth,
    height: contentHeight,
  });
  const blocks = spaceTopLevel(serializer.blocks(state.doc, TOP), serializer);

  const frontmatter = state.doc.attrs.frontmatter as string | null;
  const fields = documentFields(state.doc, docPath);
  const { titlePage, evenAndOddHeaderAndFooters, ...bands } = bandSections(
    docx,
    layout,
    twips(contentWidth),
    fields,
  );
  const document = new docx.Document({
    // Word shows the creator as the author of the document
    creator: fields.author,
    lastModifiedBy: fields.author,
    title: fields.title,
    evenAndOddHeaderAndFooters,
    // the frontmatter as it was written, so importing the document again
    // restores what Word has no place for, see src/importers/docx/prepare.ts
    ...(frontmatter === null
      ? {}
      : {
          customProperties: [
            { name: FRONTMATTER_PROPERTY, value: frontmatter },
          ],
        }),
    // IBM's unmodified font files, for the text and for code; Word
    // obfuscates embedded fonts as the format requires. The type asks for a
    // Buffer, but any bytes do.
    fonts: fonts.map(({ name, data }) => ({
      name,
      data: data as unknown as Buffer,
    })),
    styles: stylesFor(layout.newPageBefore),
    numbering: serializer.numbering(),
    sections: [
      {
        properties: {
          page: pageProperties(layout),
          ...(titlePage ? { titlePage } : {}),
        },
        ...bands,
        children: blocks.map((block) =>
          serializer.isTable(block) ? block : new docx.Paragraph(block),
        ),
      },
    ],
  });

  const contents = await docx.Packer.pack(document, "uint8array");
  return {
    contents: await fixPackage(contents),
    warnings: failureWarning(failures),
  };
};

export default toDOCX;
