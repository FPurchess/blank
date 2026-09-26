import type {
  IParagraphOptions,
  ParagraphChild,
  INumberingOptions,
} from "docx";
import type { Mark, Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { type exporterFunc } from "../../exporters";
import { fitBox } from "../../images/fit";
import {
  type PreparedImage,
  failureWarning,
  prepareImages,
} from "../../images/prepare";
import { CONTENT_HEIGHT, CONTENT_WIDTH, POINTS_PER_PIXEL } from "../page";
import { fixPackage } from "./fixups";
import {
  BLOCK_SPACING,
  BULLET_LEVELS,
  FONT,
  HEADING_AFTER_HEADING_SPACING,
  LIST_HANGING,
  LIST_INDENT,
  LIST_ITEM_SPACING,
  PAGE,
  QUOTE_BORDER,
  QUOTE_INDENT,
  STYLE,
  STYLES,
  orderedLevels,
} from "./template";

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

// Word measures images in pixels at 96 dpi, like the editor
const MAX_IMAGE_WIDTH = CONTENT_WIDTH / POINTS_PER_PIXEL;
const MAX_IMAGE_HEIGHT = CONTENT_HEIGHT / POINTS_PER_PIXEL;

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

class Serializer {
  // the ordered list starts that need a numbering definition
  private starts = new Set<number>();
  // each list gets its own numbering instance, so it counts from its start
  private instances = 0;
  private imageCount = 0;

  constructor(
    private docx: Docx,
    private images: Map<string, PreparedImage>,
  ) {}

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
    const left =
      QUOTE_INDENT * position.quotes +
      (position.level >= 0 ? LIST_INDENT * (position.level + 1) : 0);
    return left ? { indent: { left } } : {};
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

  blocks(parent: Node, position: Position): IParagraphOptions[] {
    const blocks: IParagraphOptions[] = [];
    parent.forEach((node) => blocks.push(...this.block(node, position)));
    return blocks;
  }

  private block(node: Node, position: Position): IParagraphOptions[] {
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

      default:
        // there are no other block nodes in the markdown schema
        return [];
    }
  }

  private list(node: Node, position: Position): IParagraphOptions[] {
    const ordered = node.type.name === "ordered_list";
    const start = (node.attrs.order as number | undefined) ?? 1;
    if (ordered) this.starts.add(start);
    const reference = ordered ? orderedReference(start) : BULLET_REFERENCE;
    const instance = ++this.instances;
    const tight = node.attrs.tight as boolean;
    const level = position.level + 1;
    const itemPosition = { ...position, inQuote: false, level };

    const blocks: IParagraphOptions[] = [];
    node.forEach((item) => {
      item.forEach((child, _, index) => {
        if (index === 0 && child.type.name === "paragraph") {
          // the item's own paragraph carries the bullet or number, indented
          // by the numbering unless it is quoted
          blocks.push({
            children: this.inline(child),
            numbering: { reference, level, instance },
            ...this.decoration(itemPosition, false),
            ...(position.quotes
              ? {
                  indent: {
                    left:
                      QUOTE_INDENT * position.quotes +
                      LIST_INDENT * (level + 1),
                    hanging: LIST_HANGING,
                  },
                }
              : {}),
            ...(tight ? { spacing: { after: LIST_ITEM_SPACING } } : {}),
          });
        } else {
          blocks.push(...this.block(child, itemPosition));
        }
      });
    });
    // a list is spaced from the next block like a paragraph, also when it is tight
    const last = blocks.length - 1;
    if (position.level < 0 && last >= 0) {
      blocks[last] = {
        ...blocks[last],
        spacing: { ...blocks[last].spacing, after: BLOCK_SPACING },
      };
    }
    return blocks;
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

    const size = fitBox(image, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT);
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
 * block and the space before the next one
 */
const spaceTopLevel = (blocks: IParagraphOptions[]) =>
  blocks.map((block, index) => {
    if (index === 0)
      return { ...block, spacing: { ...block.spacing, before: 0 } };
    if (block.heading && blocks[index - 1].heading) {
      return {
        ...block,
        spacing: { ...block.spacing, before: HEADING_AFTER_HEADING_SPACING },
      };
    }
    return block;
  });

let font: Promise<Uint8Array> | undefined;

// the regular face of IBM Plex Sans, shared with the PDF export, whose font
// files are several megabytes and only loaded on the first export
const loadFont = () =>
  (font ??= import("../pdf/pdfmake-vfs").then(({ default: vfs }) =>
    Uint8Array.from(atob(vfs["IBMPlexSans-Regular.ttf"]), (char) =>
      char.charCodeAt(0),
    ),
  ));

const firstHeading = (state: EditorState) => {
  let title = "";
  state.doc.descendants((node) => {
    if (!title && node.type.name === "heading") title = node.textContent;
    return !title;
  });
  return title;
};

const toDOCX: exporterFunc = async (state, { docPath }) => {
  const docx = await import("docx");
  const [fontData, { images, failures }] = await Promise.all([
    loadFont(),
    prepareImages(state.doc, docPath, [...EMBEDDABLE]),
  ]);

  const serializer = new Serializer(docx, images);
  const blocks = spaceTopLevel(serializer.blocks(state.doc, TOP));

  const document = new docx.Document({
    creator: "Blank",
    title: firstHeading(state),
    // IBM's unmodified font file; Word obfuscates embedded fonts as the
    // format requires. The type asks for a Buffer, but any bytes do.
    fonts: [{ name: FONT, data: fontData as unknown as Buffer }],
    styles: STYLES,
    numbering: serializer.numbering(),
    sections: [
      {
        properties: { page: PAGE },
        children: blocks.map((block) => new docx.Paragraph(block)),
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
