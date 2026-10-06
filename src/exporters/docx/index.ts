import type {
  IFrameOptions,
  IParagraphOptions,
  ParagraphChild,
  INumberingOptions,
  Paragraph,
  Tab,
  Table,
  TableOfContents,
} from "docx";
import type { Attrs, Mark, Node } from "prosemirror-model";

import { type exporterFunc } from "../../exporters";
import { fitBox } from "../../images/fit";
import {
  type PreparedImage,
  failureWarning,
  prepareImages,
} from "../../images/prepare";
import { pageGeometry } from "../../layout/resolve";
import { alignOf, frontmatterOf, type TextAlignment } from "../../markdown";
import { listStart } from "../../markdown/lists";
import type { Alignment, MarkName, NodeName } from "../../markdown/schema";
import {
  isListed,
  type ListedHeading,
  listedHeadings,
} from "../../markdown/headings";
import { unknownWarning } from "../../markdown/blocks/unknown";
import { embedLabel, embedSrc } from "../../markdown/blocks/embeds";
import {
  definitionOf,
  type Definitions,
  docDefinitions,
  type FieldDefinition,
  fieldSpec,
  type FramePlace,
  type GridPlace,
  isEmptyField,
  type Place,
  placesOf,
  trackWidths,
  usedDefinitions,
} from "../../markdown";
import { pageEngine } from "../../engine/engine";
import { parseLength, POINTS_PER_PIXEL } from "../../layout/units";
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
import {
  type Control,
  CONTROL_CLOSE,
  CONTROL_OPEN,
  embedTag,
  fieldTag,
  formTag,
  GRID_TAG,
} from "./forms";
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
  GRID_BORDERS,
  TABLE_BORDERS,
  TOC_NAME,
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

// a paragraph, or what docx builds as a block of its own: a table, a table
// of contents
type Block = IParagraphOptions | Table | TableOfContents;

// what the export knows of the tables of contents, in the order they come:
// the page numbers of their entries as Blank laid them out, null where it
// didn't; and the listed headings, which their entries link to
interface TocContext {
  numbers: (readonly string[] | null)[];
  headings: ListedHeading[];
}

// the bookmark of the n-th listed heading, counted from 1
const bookmarkOf = (n: number) => `_BlankToc${n}`;

// Word measures images in pixels, and tables in twentieths of a point
const twipsToPixels = (twips: number) => twips / 20 / POINTS_PER_PIXEL;

/**
 * tocClass returns docx's table of contents with the page numbers' tab stop
 * at the right edge of the text, `width` twips: docx sets it for A4 with its
 * default margins
 */
const tocClass = (docx: Docx, width: number) => {
  // docx declares the method private, and calls it from its constructor
  const Base = docx.TableOfContents as unknown as new (
    ...args: ConstructorParameters<typeof docx.TableOfContents>
  ) => object;
  return class extends Base {
    getTabStopsForLevel(level: number) {
      return [
        // docx's own, which clears Word's default tab of the style
        { type: "clear", position: width + 1 - (level - 1) * 240 },
        { type: "right", position: width, leader: "dot" },
      ];
    }
  };
};

/**
 * wordAlignment names an alignment as Word does: justified text is "both"
 */
const wordAlignment = (
  align: Alignment | TextAlignment,
): "left" | "center" | "right" | "both" =>
  align === "justify" ? "both" : align;

class Serializer {
  // the ordered list starts that need a numbering definition
  private starts = new Set<number>();
  // each list gets its own numbering instance, so it counts from its start
  private instances = 0;
  private imageCount = 0;
  // the tables of contents and listed headings written so far
  private tocCount = 0;
  private listedCount = 0;
  // the width of the text, or of the column of a grid being written, in
  // twentieths of a point
  private contentWidth: number;
  // where the text starts from the page's top edge, in twips
  private contentTop: number;
  // the largest image that fits the page, or the cell being serialized, in
  // pixels at 96 dpi like Word
  private maxImageWidth: number;
  private maxImageHeight: number;

  constructor(
    private docx: Docx,
    private images: Map<string, PreparedImage>,
    // the room for the text on the page, and where it starts from the
    // page's top edge, in points
    content: { width: number; height: number; top?: number },
    private tocs: TocContext = { numbers: [], headings: [] },
    // the definitions of the document's forms, by their key
    private definitions: Definitions = {},
  ) {
    this.contentWidth = twips(content.width);
    this.contentTop = twips(content.top ?? 0);
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

  /**
   * isBuilt tells whether a block is one docx built: a table or a table of
   * contents, which take no paragraph options
   */
  isBuilt(block: Block): block is Table | TableOfContents {
    return (
      block instanceof this.docx.Table ||
      block instanceof this.docx.TableOfContents
    );
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
        if (this.isBuilt(first)) blocks.push(newPage());
        else converted[0] = { ...first, pageBreakBefore: true };
        pageBreak = false;
      }
      blocks.push(...converted);
    });
    if (pageBreak) blocks.push(newPage());
    return blocks;
  }

  /**
   * alignment returns the Word alignment of a paragraph or heading, none for
   * left
   */
  private alignment(node: Node) {
    const align = alignOf(node);
    return align ? { alignment: wordAlignment(align) } : {};
  }

  private block(node: Node, position: Position): Block[] {
    const { HeadingLevel } = this.docx;
    const name = node.type.name as NodeName;

    switch (name) {
      case "heading": {
        // a listed heading is a bookmark the tables of contents link to
        const bookmark =
          this.tocs.numbers.length > 0 && position === TOP && isListed(node)
            ? bookmarkOf(++this.listedCount)
            : null;
        const children = this.inline(node);
        return [
          {
            heading:
              HeadingLevel[
                `HEADING_${node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6}`
              ],
            children: bookmark
              ? [new this.docx.Bookmark({ id: bookmark, children })]
              : children,
            ...this.decoration(position, false),
            ...this.indent(position),
            ...this.alignment(node),
          },
        ];
      }

      case "paragraph":
        return [
          {
            children: this.inline(node),
            ...this.decoration(position, true),
            ...this.indent(position),
            ...this.alignment(node),
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
          children: text ? [new this.docx.TextRun(this.textOf(text))] : [],
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

      case "toc":
        return this.toc(node);

      case "form_block":
        return this.form(node);

      case "embed":
        return this.embed(node);

      // blocks() turns page breaks into "page break before"; Word gets
      // nothing of a block Blank can't show (see unknownWarning); the others
      // are never blocks of their own, but written by the block they are in
      case "page_break":
      case "unknown_block":
      case "doc":
      case "list_item":
      case "table_row":
      case "table_cell":
      case "table_header":
      case "form_field":
      case "text":
      case "image":
      case "hard_break":
        return [];

      default: {
        // a node type without a case here fails the type check
        const unhandled: never = name;
        return unhandled;
      }
    }
  }

  /**
   * toc writes a table of contents as Word's own: its title, then a TOC field
   * of the headings up to its depth, linked to them, with the entries and
   * page numbers Blank laid out as its result. Word shows them until the
   * field is updated, which numbers the pages as Word lays them out.
   */
  private toc(node: Node): Block[] {
    const depth = node.attrs.depth as number;
    const title = node.attrs.title as string;
    const numbers = this.tocs.numbers[this.tocCount++] ?? null;
    const entries = this.tocs.headings
      .map((heading, index) => ({
        ...heading,
        bookmark: bookmarkOf(index + 1),
      }))
      .filter((heading) => heading.level <= depth)
      .map(({ level, text, bookmark }, entry) => {
        const page = numbers?.[entry];
        return {
          title: text,
          level,
          href: bookmark,
          // a roman number is text, which docx writes as it is
          ...(page ? { page: page as unknown as number } : {}),
        };
      });
    const Toc = tocClass(this.docx, this.contentWidth);
    const toc = new Toc(TOC_NAME, {
      hyperlink: true,
      headingStyleRange: `1-${depth}`,
      cachedEntries: entries,
      // Word shows these entries as they are, without asking to update
      beginDirty: false,
    }) as unknown as TableOfContents;
    return title
      ? [
          { style: STYLE.tocHeading, children: [new this.docx.TextRun(title)] },
          toc,
        ]
      : [toc];
  }

  /**
   * form writes a form as Word's content controls (see ./forms.ts): one for
   * the form, which starts a new page if its definition says so, holding one
   * for each field, which says its placeholder while it's empty. Without
   * its definition, a form is the blocks it holds.
   */
  private form(node: Node): Block[] {
    const def = node.attrs.def as string;
    const definition = definitionOf(this.definitions, def);
    const places = placesOf(definition?.layout);
    const flowTop = parseLength(definition?.flowTop);
    const blocks: Block[] = [];
    // the columns of the band of a grid being written
    let band: { place: GridPlace; columns: Block[][] } | null = null;
    const flush = () => {
      if (band) blocks.push(...this.grid(band.place, band.columns));
      band = null;
    };
    let flowing = false;
    node.forEach((field) => {
      const spec = fieldSpec(definition, field);
      const place = definition && spec ? places.get(spec.name) : undefined;
      const grid = place?.kind === "grid" ? place : undefined;
      if (band && band.place.band !== grid?.band) flush();
      let written = this.field(field, spec, place);
      // the first field in the flow starts where its definition says, below
      // its frames
      if (place?.kind !== "frame" && !flowing) {
        flowing = true;
        if (flowTop) written = this.startAt(written, flowTop);
      }
      if (grid) {
        band ??= { place: grid, columns: grid.tracks.map(() => []) };
        band.columns[grid.column].push(...written);
      } else blocks.push(...written);
    });
    flush();
    if (!definition) return blocks;
    const form = this.control({
      tag: formTag(def),
      alias: definition.name,
      group: true,
    });
    return [
      definition.newPage ? { ...form, pageBreakBefore: true } : form,
      ...blocks,
      { style: CONTROL_CLOSE },
    ];
  }

  /**
   * startAt returns `blocks` with the first paragraph that isn't a marker
   * starting `top` points below the page's top edge, on a page it starts
   */
  private startAt(blocks: Block[], top: number): Block[] {
    const first = blocks.findIndex(
      (block) => !this.isBuilt(block) && block.style !== CONTROL_OPEN,
    );
    if (first < 0) return blocks;
    const block = blocks[first] as IParagraphOptions;
    const before = Math.max(0, twips(top) - this.contentTop);
    return blocks.map((other, index) =>
      index === first
        ? { ...block, spacing: { ...block.spacing, before } }
        : other,
    );
  }

  /**
   * field writes a field of a form: its blocks in a content control named
   * by its label, which says its placeholder while it's empty; in the
   * column of a grid at `place`, with images that fit it. Without its
   * definition, a field is its blocks.
   */
  private field(field: Node, spec?: FieldDefinition, place?: Place): Block[] {
    // in a column or a frame, its tables and images are as wide as it is
    const outer = [this.contentWidth, this.maxImageWidth];
    if (place) {
      this.contentWidth =
        place.kind === "grid"
          ? this.columnWidths(place)[place.column]
          : twips(place.width);
      this.maxImageWidth = twipsToPixels(this.contentWidth);
    }
    const built = this.blocks(field, TOP);
    [this.contentWidth, this.maxImageWidth] = outer;
    // in a frame, every paragraph is, one line after the other: Word draws
    // them in one; and a field of small print in its style
    const frame = place?.kind === "frame" ? this.frameOf(place) : undefined;
    const small = spec?.style === "small";
    const content = built.map((block) =>
      this.isBuilt(block)
        ? block
        : {
            ...block,
            ...(small ? { style: STYLE.small } : {}),
            ...(frame
              ? { frame, spacing: { ...block.spacing, before: 0, after: 0 } }
              : {}),
          },
    );
    if (!spec) return content;
    const placeholder =
      isEmptyField(field, spec) &&
      !!spec.placeholder &&
      !this.isBuilt(content[0]);
    if (placeholder) {
      content[0] = {
        ...content[0],
        children: [
          new this.docx.TextRun({
            text: spec.placeholder,
            style: STYLE.placeholder,
          }),
        ],
      };
    }
    return [
      this.control({
        tag: fieldTag(spec.name),
        alias: spec.label,
        placeholder,
      }),
      ...content,
      { style: CONTROL_CLOSE },
    ];
  }

  /**
   * frameOf returns the frame of Word's paragraphs at `place`, on the page
   */
  private frameOf(place: FramePlace): IFrameOptions {
    const { FrameAnchorType, HeightRule } = this.docx;
    return {
      type: "absolute",
      position: { x: twips(place.x), y: twips(place.y) },
      width: twips(place.width),
      height: twips(place.height),
      rule: place.height ? HeightRule.ATLEAST : HeightRule.AUTO,
      anchor: {
        horizontal: FrameAnchorType.PAGE,
        vertical: FrameAnchorType.PAGE,
      },
    };
  }

  /**
   * columnWidths returns the widths of the columns of the band of a grid at
   * `place`, in twips, as the layout engine works them out
   */
  private columnWidths(place: GridPlace) {
    return trackWidths(place.tracks, twips(place.gap), this.contentWidth).map(
      Math.round,
    );
  }

  /**
   * grid writes the band of a grid, the columns side by side, as a table
   * without lines of one row, in a content control the import knows it by:
   * Word has no columns that end where a block does
   */
  private grid(place: GridPlace, columns: Block[][]): Block[] {
    const {
      Paragraph,
      Table,
      TableRow,
      TableCell,
      TableLayoutType,
      WidthType,
    } = this.docx;
    const gap = twips(place.gap);
    const widths = this.columnWidths(place);
    const last = columns.length - 1;
    // the room between columns, half on each side of it
    const margins = (index: number) => ({
      top: 0,
      bottom: 0,
      left: index > 0 ? Math.round(gap / 2) : 0,
      right: index < last ? Math.round(gap / 2) : 0,
    });
    // a cell is as wide as its column and its margins
    const outer = widths.map((width, index) => {
      const { left, right } = margins(index);
      return width + left + right;
    });
    const cells = columns.map(
      (blocks, index) =>
        new TableCell({
          // a cell ends with a paragraph, which the import leaves out
          children: [
            ...blocks.map((block) =>
              this.isBuilt(block) ? block : new Paragraph(block),
            ),
            new Paragraph({}),
          ],
          width: { size: outer[index], type: WidthType.DXA },
          margins: margins(index),
        }),
    );
    const table = new Table({
      rows: [new TableRow({ children: cells })],
      width: { size: this.contentWidth, type: WidthType.DXA },
      columnWidths: outer,
      layout: TableLayoutType.FIXED,
      borders: GRID_BORDERS,
    });
    return [
      this.control({ tag: GRID_TAG, alias: "Grid" }),
      table,
      { style: CONTROL_CLOSE },
    ];
  }

  /**
   * embed writes an embed as a picture of its drawing, at the width it
   * says, in a content control the import knows it by (see ./forms.ts)
   */
  private embed(node: Node): Block[] {
    const label = embedLabel(node);
    const image = this.images.get(embedSrc(node));
    const points = parseLength(node.attrs.width);
    // as wide as it says, in pixels, as tall as its drawing has it then
    const wanted =
      image && points
        ? {
            width: points / POINTS_PER_PIXEL,
            height: (image.height * points) / POINTS_PER_PIXEL / image.width,
          }
        : image;
    const picture = image
      ? this.picture(image, wanted!, label)
      : new this.docx.TextRun({ text: label, italics: true });
    return [
      this.control({ tag: embedTag(node.attrs.id as string), alias: label }),
      { children: [picture] },
      { style: CONTROL_CLOSE },
    ];
  }

  /**
   * control returns the marker paragraph where a content control opens
   */
  private control(control: Control): Block {
    return {
      style: CONTROL_OPEN,
      children: [new this.docx.TextRun(JSON.stringify(control))],
    };
  }

  private list(node: Node, position: Position): Block[] {
    const ordered = node.type.name === "ordered_list";
    const start = listStart(node);
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
                left: indentOf(itemPosition),
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
    if (position.level < 0 && last && !this.isBuilt(last)) {
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

    const align = cell.node.attrs.align as Alignment | null;
    return blocks.map((block, index) =>
      this.isBuilt(block)
        ? block
        : new this.docx.Paragraph({
            ...block,
            ...(cell.header && !block.style
              ? { style: STYLE.tableHeading }
              : {}),
            ...(align ? { alignment: wordAlignment(align) } : {}),
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
          ...this.textOf(node.text ?? ""),
          bold: hasMark(node, "strong") || undefined,
          italics: hasMark(node, "em") || undefined,
          underline: hasMark(node, "underline") ? {} : undefined,
          style: code ? STYLE.inlineCode : linked ? STYLE.hyperlink : undefined,
        });
      }
    }
  }

  /**
   * textOf returns the options of a run of `text` with its tabs as Word's
   * tabs: a tab in the text of a run would be a space in Word
   */
  private textOf(
    text: string,
  ): { text: string } | { children: (string | Tab)[] } {
    if (!text.includes("\t")) return { text };
    const children: (string | Tab)[] = [];
    text.split("\t").forEach((part, index) => {
      if (index > 0) children.push(new this.docx.Tab());
      if (part) children.push(part);
    });
    return { children };
  }

  private image(node: Node): ParagraphChild {
    const src = node.attrs.src as string;
    const alt = node.attrs.alt as string | null;
    const title = node.attrs.title as string | null;
    const image = this.images.get(src);
    if (!image)
      return new this.docx.TextRun({ text: alt || src, italics: true });
    return this.picture(image, image, alt ?? "", title ?? "");
  }

  /**
   * picture returns `image` as Word's picture, `size` (in pixels) fitted to
   * the page or the cell being written, with what it shows for screen
   * readers
   */
  private picture(
    image: PreparedImage,
    size: { width: number; height: number },
    description: string,
    title = "",
  ): ParagraphChild {
    const fitted = fitBox(size, this.maxImageWidth, this.maxImageHeight);
    return new this.docx.ImageRun({
      type: IMAGE_TYPES[image.mime as keyof typeof IMAGE_TYPES],
      data: image.bytes,
      transformation: {
        width: Math.round(fitted.width),
        height: Math.round(fitted.height),
      },
      altText: {
        name: `image-${++this.imageCount}`,
        description,
        title,
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

const hasMark = (node: Node, name: MarkName) =>
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
const spaceTopLevel = (blocks: Block[], serializer: Serializer) => {
  // the markers of content controls go, and paragraphs in frames stand
  // outside the flow, so neither is the previous block
  const aside = (block: Block) =>
    !serializer.isBuilt(block) &&
    (block.style === CONTROL_OPEN ||
      block.style === CONTROL_CLOSE ||
      !!block.frame);
  let previous: Block | undefined;
  return blocks.map((block) => {
    if (aside(block)) return block;
    const last = previous;
    previous = block;
    // a block placed on its page keeps its space, see startAt
    if (serializer.isBuilt(block) || block.spacing?.before !== undefined) {
      return block;
    }
    const before =
      last === undefined
        ? 0
        : serializer.isBuilt(last)
          ? BLOCK_SPACING
          : block.heading && last.heading
            ? HEADING_AFTER_HEADING_SPACING
            : undefined;
    return before === undefined
      ? block
      : { ...block, spacing: { ...block.spacing, before } };
  });
};

/**
 * embedsOf returns the attributes of the embeds of `doc`, by their ids
 */
const embedsOf = (doc: Node) => {
  const embeds: Record<string, Attrs> = {};
  doc.forEach((node) => {
    if (node.type.name === "embed")
      embeds[node.attrs.id as string] = node.attrs;
  });
  return embeds;
};

/**
 * tocContext returns what the export needs of the tables of contents of
 * `doc`: their page numbers, from the page view's engine, which lays the
 * rest of a long document out first; and the listed headings, if there is a
 * table of contents at all
 */
const tocContext = (doc: Node): TocContext => {
  const numbers: TocContext["numbers"] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "toc") return;
    pageEngine?.finish();
    numbers.push(pageEngine?.tocNumbers(pos) ?? null);
  });
  return { numbers, headings: numbers.length ? listedHeadings(doc) : [] };
};

const toDOCX: exporterFunc = async (state, { docPath, layout }) => {
  const docx = await import("docx");
  const [fonts, { images, failures }] = await Promise.all([
    loadFonts(),
    prepareImages(state.doc, docPath, [...EMBEDDABLE]),
  ]);

  const { contentWidth, contentHeight, margins } = pageGeometry(layout);
  const serializer = new Serializer(
    docx,
    images,
    { width: contentWidth, height: contentHeight, top: margins.top },
    tocContext(state.doc),
    docDefinitions(state.doc),
  );
  const blocks = spaceTopLevel(serializer.blocks(state.doc, TOP), serializer);

  const frontmatter = frontmatterOf(state.doc);
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
    // tab stops 36 pt apart, as on the pages (TAB_STOP in
    // src-tauri/layout/src/style.rs); Word's default, which other apps don't
    // all share
    defaultTabStop: 36 * 20,
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
    // a justified line that ends in a line break isn't stretched, as on
    // Blank's pages
    compatibility: { doNotExpandShiftReturn: true },
    numbering: serializer.numbering(),
    sections: [
      {
        properties: {
          page: pageProperties(layout),
          ...(titlePage ? { titlePage } : {}),
        },
        ...bands,
        children: blocks.map((block) =>
          serializer.isBuilt(block) ? block : new docx.Paragraph(block),
        ),
      },
    ],
  });

  const contents = await docx.Packer.pack(document, "uint8array");
  return {
    contents: await fixPackage(contents, {
      definitions: usedDefinitions(state.doc),
      embeds: embedsOf(state.doc),
    }),
    warnings: [
      ...failureWarning(failures),
      ...unknownWarning(state.doc, {
        one: "was left out",
        more: "were left out",
      }),
    ],
  };
};

export default toDOCX;
