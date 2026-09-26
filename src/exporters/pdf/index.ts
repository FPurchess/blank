import pdfmake from "pdfmake";

import { Node, Mark } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { type exporterFunc } from "../../exporters";
import { toDataUrl } from "../../images/dataUrl";
import { fitBox } from "../../images/fit";
import { failureWarning, prepareImages } from "../../images/prepare";
import { CONTENT_HEIGHT, CONTENT_WIDTH, POINTS_PER_PIXEL } from "../page";
import {
  BASE_DOCUMENT,
  HEADING_AFTER_HEADING_MARGIN_TOP,
  LIST_ITEM_BLOCK_MARGIN_TOP,
} from "./template";
import { withFallback } from "./fallback";

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
type PdfImages = Map<string, { key: string; width: number; height: number }>;

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

// TODO: support hard breaks and horizontal lines
const transformNode = (n: Node, images: PdfImages) => {
  const link = n.marks.find((mark: Mark) => mark.type.name === "link");
  const item = {
    style: `${n.type.name}${(n.attrs.level as number) ?? ""}`,
    stack: undefined,
    ul: undefined,
    ol: undefined,
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
        item.ul.push(transformNode(node, images));
      });
      break;

    case "ordered_list":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.ol = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.ol.push(transformNode(node, images));
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
          ...transformNode(node, images),
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
            stack.push(imageBlock(node, images));
          } else {
            run.push(transformNode(node, images));
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
        item.text.push(transformNode(node, images));
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
const embedImages = async (state: EditorState, docPath: string | null) => {
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
      CONTENT_WIDTH,
      CONTENT_HEIGHT,
    );
    bySrc.set(src, { key, ...size });
  }
  return { byKey, bySrc, failures };
};

const toPDF: exporterFunc = async (state: EditorState, { docPath }) => {
  await registerFonts();
  const { byKey, bySrc, failures } = await embedImages(state, docPath);

  const content = adjustMargins(
    transformNode(state.doc, bySrc).text as unknown as Block[],
  );
  const docDefinition = Object.assign({}, BASE_DOCUMENT, {
    content,
    images: byKey,
  });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const pdf = pdfmake.createPdf(docDefinition);

  return {
    contents: (await pdf.getBuffer()) as Uint8Array,
    warnings: failureWarning(failures),
  };
};

export default toPDF;
