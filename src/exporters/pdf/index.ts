import pdfmake from "pdfmake";

import { Node, Mark } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { type exporterFunc } from "../../exporters";
import { firstHeading, readProperties } from "../../markdown";
import { toDataUrl } from "../../images/dataUrl";
import { fitBox } from "../../images/fit";
import { failureWarning, prepareImages } from "../../images/prepare";
import { type Layout, pageGeometry } from "../../layout/resolve";
import { POINTS_PER_PIXEL } from "../../layout/units";
import {
  BASE_DOCUMENT,
  BLOCKQUOTE_LAYOUT,
  pageBreakBefore,
  HEADING_AFTER_HEADING_MARGIN_TOP,
  LIST_ITEM_BLOCK_MARGIN_TOP,
} from "./template";
import { withFallback } from "./fallback";
import { tableBlock } from "./table";

let fontsRegistered: Promise<void> | undefined;

// the embedded fonts are several megabytes, so load them on the first export
// instead of at start-up
const registerFonts = () =>
  (fontsRegistered ??= import("./pdfmake-vfs").then(({ default: vfs }) => {
    pdfmake.addVirtualFileSystem(vfs);
    pdfmake.addFonts({
      "IBM Plex Sans": {
        normal: "IBMPlexSans-Regular.ttf",
        bold: "IBMPlexSans-Bold.ttf",
        italics: "IBMPlexSans-Italic.ttf",
        bolditalics: "IBMPlexSans-BoldItalic.ttf",
      },
      // for the headings, which pdfmake can't give a medium weight otherwise
      "IBM Plex Sans Medium": {
        normal: "IBMPlexSans-Medium.ttf",
        bold: "IBMPlexSans-Bold.ttf",
        italics: "IBMPlexSans-MediumItalic.ttf",
        bolditalics: "IBMPlexSans-BoldItalic.ttf",
      },
      // fallback for characters IBM Plex Sans lacks, see fallback.ts
      "DejaVu Sans": {
        normal: "dejavu-sans.ttf",
        bold: "dejavu-sans-bold.ttf",
        italics: "dejavu-sans-oblique.ttf",
        bolditalics: "dejavu-sans-bold-oblique.ttf",
      },
    });
  }));

export const hasMark = (n: Node, name: string): boolean =>
  n.marks.find((mark: Mark) => mark.type.name === name) !== undefined;

// the embedded images by src: their key in the document's `images` and size
export type PdfImages = Map<
  string,
  { key: string; width: number; height: number }
>;

// what the blocks of a node are laid out in: the images, fitted to the room
// for the text, which is the page or a table cell, in points
export interface PdfContext {
  images: PdfImages;
  content: { width: number; height: number };
}

/**
 * imageBlock renders an image node, or its alt text if it couldn't be loaded
 */
const imageBlock = (n: Node, images: PdfImages) => {
  const image = images.get(n.attrs.src as string);
  if (!image) {
    return {
      text: [
        { text: (n.attrs.alt as string | null) || n.attrs.src, italics: true },
      ],
    };
  }
  return { image: image.key, width: image.width, height: image.height };
};

const hasImage = (n: Node) => {
  let found = false;
  n.forEach((child) => {
    if (child.type.name === "image") found = true;
  });
  return found;
};

/**
 * edgeless renders the blocks of `n` as a stack whose first block has no top
 * and whose last block no bottom margin, for a container like a quote or a
 * table cell, whose own spacing separates it from its siblings
 */
const edgeless = (n: Node, context: PdfContext) =>
  n.children.map((node, index) => ({
    ...transformNode(node, context),
    ...(index === 0 ? { marginTop: 0 } : {}),
    ...(index === n.childCount - 1 ? { marginBottom: 0 } : {}),
  }));

// TODO: support horizontal lines
const transformNode = (n: Node, context: PdfContext) => {
  const link = n.marks.find((mark: Mark) => mark.type.name === "link");
  const item = {
    style: `${n.type.name}${(n.attrs.level as number) ?? ""}`,
    stack: undefined,
    ul: undefined,
    ol: undefined,
    // the number of the first item of an ordered list
    start: undefined,
    table: undefined,
    layout: undefined,
    text: undefined,
    // only set when true: an explicit false would override the style, e.g.
    // the bold of a heading
    italics: hasMark(n, "em") || undefined,
    bold: hasMark(n, "strong") || undefined,
    decoration: hasMark(n, "u") || link ? "underline" : undefined,
    // makes the text a clickable link in the PDF
    ...(link ? { link: link.attrs.href as string } : {}),
    headlineLevel:
      n.type.name === "heading" ? (n.attrs.level as number) : undefined,
  };

  switch (n.type.name) {
    case "text":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.text = withFallback(n.text ?? "", {
        italics: item.italics,
        bold: item.bold,
        decoration: item.decoration,
        ...(link ? { link: link.attrs.href as string } : {}),
      });
      break;

    case "bullet_list":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.ul = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.ul.push(transformNode(node, context));
      });
      break;

    case "hard_break":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.text = "\n";
      break;

    case "blockquote":
      // a one-cell table, so the quote gets a bar on its left like in the
      // editor
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.table = { widths: ["*"], body: [[{ stack: edgeless(n, context) }]] };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.layout = BLOCKQUOTE_LAYOUT;
      break;

    case "table":
      Object.assign(item, tableBlock(n, context, edgeless));
      break;

    case "ordered_list":
      if (n.attrs.order !== 1) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.start = n.attrs.order as number;
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.ol = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.ol.push(transformNode(node, context));
      });
      break;

    case "list_item":
      // a stack, not text, so nested lists and further paragraphs render as
      // blocks; the item's own margin separates it from its siblings
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.stack = [];
      n.forEach((node, _, index) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.stack.push({
          ...transformNode(node, context),
          margin: [0, index ? LIST_ITEM_BLOCK_MARGIN_TOP : 0, 0, 0],
        });
      });
      break;

    default:
      if (n.isTextblock && hasImage(n)) {
        // pdfmake can't place images inside text, so the text around each
        // image becomes a block of its own
        const stack: object[] = [];
        let run: object[] = [];
        const flush = () => {
          if (run.length) stack.push({ text: run });
          run = [];
        };
        n.forEach((node) => {
          if (node.type.name === "image") {
            flush();
            stack.push(imageBlock(node, context.images));
          } else {
            run.push(transformNode(node, context));
          }
        });
        flush();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.stack = stack;
        break;
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.text = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.text.push(transformNode(node, context));
      });
  }

  return item;
};

type Block = ReturnType<typeof transformNode>;

// spacing that depends on the previous block, which styles can't express
const adjustMargins = (content: Block[]) =>
  content.map((block, index) => {
    if (index === 0) return { ...block, marginTop: 0 };
    if (block.headlineLevel && content[index - 1].headlineLevel) {
      return { ...block, marginTop: HEADING_AFTER_HEADING_MARGIN_TOP };
    }
    return block;
  });

/**
 * embedImages loads the images of `state` as data URLs for pdfmake, which only
 * takes PNG and JPEG, sized like in the editor and at most as large as a page
 */
const embedImages = async (
  state: EditorState,
  docPath: string | null,
  { contentWidth, contentHeight }: ReturnType<typeof pageGeometry>,
) => {
  const { images, failures } = await prepareImages(state.doc, docPath, [
    "image/png",
    "image/jpeg",
  ]);
  const byKey: Record<string, string> = {};
  const bySrc: PdfImages = new Map();
  for (const [src, image] of images) {
    const key = `img${bySrc.size}`;
    byKey[key] = await toDataUrl(image.bytes, image.mime);
    const size = fitBox(
      {
        width: image.width * POINTS_PER_PIXEL,
        height: image.height * POINTS_PER_PIXEL,
      },
      contentWidth,
      contentHeight,
    );
    bySrc.set(src, { key, ...size });
  }
  return { byKey, bySrc, failures };
};

/**
 * pageDefinition returns the page of the pdfmake document for `layout`
 */
export const pageDefinition = (layout: Layout) => {
  const { width, height, margins } = pageGeometry(layout);
  return {
    pageSize: { width, height },
    pageOrientation: layout.orientation,
    // [left, top, right, bottom]
    pageMargins: [margins.left, margins.top, margins.right, margins.bottom],
  };
};

const toPDF: exporterFunc = async (state: EditorState, { docPath, layout }) => {
  await registerFonts();
  const geometry = pageGeometry(layout);
  const { byKey, bySrc, failures } = await embedImages(
    state,
    docPath,
    geometry,
  );
  const context: PdfContext = {
    images: bySrc,
    content: { width: geometry.contentWidth, height: geometry.contentHeight },
  };

  const content = adjustMargins(
    transformNode(state.doc, context).text as unknown as Block[],
  );
  const { title, author } = readProperties(state.doc.attrs.frontmatter);
  // pdfmake tells the footer how many pages there are
  let pages = 0;
  const docDefinition = Object.assign(
    {},
    BASE_DOCUMENT,
    pageDefinition(layout),
    {
      pageBreakBefore: pageBreakBefore(
        geometry.height - geometry.margins.bottom,
      ),
      footer: (_: number, pageCount: number) => {
        pages = pageCount;
        return null;
      },
      // shown by PDF viewers and read by search engines and screen readers
      info: {
        title: title ?? firstHeading(state.doc),
        ...(author ? { author } : {}),
        creator: "Blank",
      },
      content,
      images: byKey,
    },
  );

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const pdf = pdfmake.createPdf(docDefinition);

  return {
    contents: (await pdf.getBuffer()) as Uint8Array,
    warnings: failureWarning(failures),
    pages,
  };
};

export default toPDF;
