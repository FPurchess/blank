import { Fragment, type Node } from "prosemirror-model";

import { schema } from "../../markdown";

// mammoth writes Word's tabs as tab characters, which ProseMirror's parser
// takes for whitespace between words and makes a space of. So they stand as
// a character of the private use area, which no text has, while it parses.
const PLACEHOLDER = "";

// the first text in `element`
const firstText = (element: Element) =>
  element.ownerDocument
    .createTreeWalker(element, NodeFilter.SHOW_TEXT)
    .nextNode() as Text | null;

/**
 * hideTabs puts the placeholder in place of every tab in the text of `root`,
 * except at the start of a list item: Word puts one after a footnote's mark
 * and a list's number, which markdown writes itself
 */
export const hideTabs = (root: HTMLElement) => {
  for (const item of root.querySelectorAll("li")) {
    const first = firstText(item);
    if (first) first.data = first.data.replace(/^\t+/, "");
  }
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const node = text as Text;
    if (node.data.includes("\t"))
      node.data = node.data.replaceAll("\t", PLACEHOLDER);
  }
};

/**
 * showTabs puts the tabs `hideTabs` hid back into the text of `doc`
 */
export const showTabs = (doc: Node): Node => {
  if (!doc.textContent.includes(PLACEHOLDER)) return doc;
  if (doc.isText)
    return schema.text(doc.text!.replaceAll(PLACEHOLDER, "\t"), doc.marks);
  const children: Node[] = [];
  doc.forEach((child) => children.push(showTabs(child)));
  return doc.copy(Fragment.from(children));
};
