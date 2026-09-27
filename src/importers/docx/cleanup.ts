import { tokenizer } from "../../markdown";
import { normalizeTableHtml, rename } from "../../markdown/html";
import { isSavableUrl } from "../../url";
import {
  CAPTION_CLASS,
  HORIZONTAL_LINE_CLASS,
  PAGE_BREAK_CLASS,
  TABLE_HEADING_CLASS,
} from "./styleMap";

// Turns the HTML mammoth makes of a .docx into HTML the markdown schema can
// hold, see src/importers/docx/index.ts. Works on an inert document, so no
// script runs and no image loads.

// the src of images that couldn't be imported, which become their alt text
export const DROPPED_IMAGE_SRC = "about:blank#dropped-image";

export interface CleanupReport {
  // tables inside table cells, which became text
  nestedTables: number;
  footnotes: number;
  comments: number;
  droppedImages: number;
}

const unwrap = (element: Element) => element.replaceWith(...element.childNodes);

/**
 * codeLineBreaks turns line breaks in code blocks into newlines, since a code
 * block holds plain text (pandoc writes code as one paragraph with breaks)
 */
const codeLineBreaks = (doc: Document) => {
  doc.querySelectorAll("pre br").forEach((br) => br.replaceWith("\n"));
};

/**
 * footnotes keeps footnotes and endnotes as a numbered list at the end,
 * separated by a line, with their markers as plain "[1]" in the text
 */
const footnotes = (doc: Document) => {
  // the ↑ links from a note back to its marker
  doc
    .querySelectorAll('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]')
    .forEach((link) => link.remove());
  doc
    .querySelectorAll('a[href^="#footnote-"], a[href^="#endnote-"]')
    .forEach(unwrap);

  let count = 0;
  doc.querySelectorAll("ol").forEach((list) => {
    const notes = list.querySelectorAll(
      ':scope > li[id^="footnote-"], :scope > li[id^="endnote-"]',
    );
    if (notes.length === 0) return;
    count += notes.length;
    list.before(doc.createElement("hr"));
  });
  return count;
};

/**
 * comments removes the comments of the document and their markers. mammoth
 * only renders them, as a list at the end, to count them.
 */
const comments = (doc: Document) => {
  doc.querySelectorAll('a[href^="#comment-"]').forEach((marker) => {
    const sup = marker.closest("sup");
    (sup ?? marker).remove();
  });
  let count = 0;
  doc.querySelectorAll("dl").forEach((list) => {
    const entries = list.querySelectorAll(':scope > dt[id^="comment-"]');
    if (entries.length === 0) return;
    count += entries.length;
    list.remove();
  });
  return count;
};

/**
 * headerCells makes the cells of `table` that hold only paragraphs in the
 * table heading style header cells, e.g. those of a header column, since
 * mammoth only knows header rows
 */
const headerCells = (table: HTMLTableElement) => {
  for (const cell of table.querySelectorAll("td")) {
    const children = [...cell.children];
    const heading =
      children.length > 0 &&
      children.every((child) => child.classList.contains(TABLE_HEADING_CLASS));
    if (heading && cell.closest("table") === table) rename(cell, "th");
  }
};

/**
 * attachCaption makes the caption paragraph `sibling` the caption of `table`,
 * if it is one and the table has none yet
 */
const attachCaption = (table: HTMLTableElement, sibling: Element | null) => {
  if (!sibling?.classList.contains(CAPTION_CLASS)) return;
  if (table.querySelector(":scope > caption")) return;
  const caption = table.ownerDocument.createElement("caption");
  caption.append(...sibling.childNodes);
  table.prepend(caption);
  sibling.remove();
};

/**
 * tables keeps the tables in a form the schema holds, see normalizeTableHtml:
 * a caption paragraph right before or after a table becomes its caption, and
 * a table without a header row gets its first row as the header, like a
 * markdown table needs one
 * @returns how many tables inside tables became text
 */
const tables = (doc: Document) => {
  const outermost = [...doc.querySelectorAll("table")].filter(
    (table) => !table.parentElement?.closest("table"),
  );
  // captions above their table first, where Word, pandoc and Blank put them,
  // so a caption between two tables goes to the one below it
  for (const table of outermost)
    attachCaption(table, table.previousElementSibling);
  for (const table of outermost) attachCaption(table, table.nextElementSibling);

  let nested = 0;
  for (const table of outermost) {
    headerCells(table);
    nested += normalizeTableHtml(table, tokenizer, { promoteHeader: true });
  }
  // captions of something else stay plain paragraphs, and so do paragraphs
  // in the table heading style outside of tables
  doc
    .querySelectorAll(`.${CAPTION_CLASS}, .${TABLE_HEADING_CLASS}`)
    .forEach((paragraph) => paragraph.removeAttribute("class"));
  return nested;
};

/**
 * links keeps links to web and mail addresses. Others, e.g. to bookmarks
 * inside the document or javascript:, become their text.
 */
const links = (doc: Document) => {
  doc.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const keep = /^(https?|mailto):/i.test(href) && isSavableUrl(href);
    if (keep) {
      // only the href is kept, e.g. no id of a bookmark on the same text
      [...link.attributes]
        .filter((attribute) => attribute.name !== "href")
        .forEach((attribute) => link.removeAttribute(attribute.name));
    } else {
      unwrap(link);
    }
  });
};

/**
 * droppedImages replaces the images that couldn't be imported (e.g. EMF
 * charts) with their alt text in italics
 */
const droppedImages = (doc: Document) => {
  const images = doc.querySelectorAll(`img[src="${DROPPED_IMAGE_SRC}"]`);
  images.forEach((image) => {
    const alt = image.getAttribute("alt");
    if (alt) {
      const em = doc.createElement("em");
      em.textContent = alt;
      image.replaceWith(em);
    } else {
      image.remove();
    }
  });
  return images.length;
};

/**
 * emptyParagraphs turns the paragraphs of horizontal lines and page breaks
 * into <hr> and removes other empty paragraphs, e.g. the ones Word documents
 * use as space
 */
const emptyParagraphs = (doc: Document) => {
  doc.querySelectorAll("p").forEach((paragraph) => {
    if (paragraph.classList.contains(HORIZONTAL_LINE_CLASS)) {
      paragraph.replaceWith(doc.createElement("hr"));
    } else if (paragraph.classList.contains(PAGE_BREAK_CLASS)) {
      const pageBreak = doc.createElement("hr");
      pageBreak.dataset.pageBreak = "";
      paragraph.replaceWith(pageBreak);
    } else if (
      !paragraph.textContent?.trim() &&
      !paragraph.querySelector("img, br")
    ) {
      paragraph.remove();
    }
  });
};

/**
 * tightLists marks lists whose items are single paragraphs as tight, which
 * mammoth doesn't. Otherwise every imported list would be loose, with blank
 * lines between its items in the markdown.
 */
const tightLists = (doc: Document) => {
  doc.querySelectorAll("ul, ol").forEach((list) => {
    const tight = [...list.children].every(
      (item) => item.querySelectorAll(":scope > p").length <= 1,
    );
    if (tight) list.setAttribute("data-tight", "true");
  });
};

/**
 * cleanup prepares the HTML mammoth made for the markdown schema, in place
 * @returns what had to change, for the warnings shown after the import
 */
export const cleanup = (doc: Document): CleanupReport => {
  codeLineBreaks(doc);
  const commentCount = comments(doc);
  const footnoteCount = footnotes(doc);
  links(doc);
  const droppedImageCount = droppedImages(doc);
  // after the empty paragraphs are gone, so a caption is next to its table
  emptyParagraphs(doc);
  const nestedTableCount = tables(doc);
  tightLists(doc);
  return {
    nestedTables: nestedTableCount,
    footnotes: footnoteCount,
    comments: commentCount,
    droppedImages: droppedImageCount,
  };
};
