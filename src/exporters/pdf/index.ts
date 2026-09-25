import pdfmake from "pdfmake";

import { Node, Mark } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { type exporterFunc } from "../../exporters";
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

// TODO: support hard breaks and horizontal lines
const transformNode = (n: Node) => {
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
        item.ul.push(transformNode(node));
      });
      break;

    case "ordered_list":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.ol = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.ol.push(transformNode(node));
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
          ...transformNode(node),
          margin: [0, index ? LIST_ITEM_BLOCK_MARGIN_TOP : 0, 0, 0],
        });
      });
      break;

    default:
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.text = [];
      n.forEach((node) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        item.text.push(transformNode(node));
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

const toPDF: exporterFunc = async (state: EditorState) => {
  await registerFonts();

  const content = adjustMargins(
    transformNode(state.doc).text as unknown as Block[],
  );
  const docDefinition = Object.assign({}, BASE_DOCUMENT, { content });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const pdf = pdfmake.createPdf(docDefinition);

  return pdf.getBuffer();
};

export default toPDF;
