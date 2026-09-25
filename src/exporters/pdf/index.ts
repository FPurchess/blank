import pdfmake from "pdfmake";

import { Node, Mark } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { type exporterFunc } from "../../exporters";
import { BASE_DOCUMENT } from "./template";

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
    italics: hasMark(n, "em"),
    bold: hasMark(n, "strong"),
    decoration: hasMark(n, "u") || link ? "underline" : undefined,
    // makes the text a clickable link in the PDF
    ...(link ? { link: link.attrs.href as string } : {}),
  };

  switch (n.type.name) {
    case "text":
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      item.text = n.text ?? "";
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

const toPDF: exporterFunc = (state: EditorState) => {
  const content = transformNode(state.doc).text;
  const docDefinition = Object.assign({}, BASE_DOCUMENT, { content });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const pdf = pdfmake.createPdf(docDefinition);

  return pdf.getBuffer();
};

export default toPDF;
