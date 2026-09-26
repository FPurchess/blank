import { isSavableUrl } from "../../url";
import { HORIZONTAL_LINE_CLASS } from "./styleMap";

// Turns the HTML mammoth makes of a .docx into HTML the markdown schema can
// hold, see src/importers/docx/index.ts. Works on an inert document, so no
// script runs and no image loads.

// the src of images that couldn't be imported, which become their alt text
export const DROPPED_IMAGE_SRC = "about:blank#dropped-image";

export interface CleanupReport {
  tables: number;
  footnotes: number;
  comments: number;
  droppedImages: number;
}

const BLOCK = /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV|UL|OL|TABLE)$/;

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
 * inlineContent returns the content of `cell` as inline content: its
 * paragraphs joined by spaces
 */
const inlineContent = (doc: Document, cell: Element) => {
  const content = doc.createDocumentFragment();
  for (const node of [...cell.childNodes]) {
    const parts =
      node instanceof Element && BLOCK.test(node.tagName)
        ? [...node.childNodes]
        : [node];
    if (parts.length === 0) continue;
    if (content.childNodes.length) content.append(" ");
    content.append(...parts);
  }
  return content;
};

/**
 * tables turns every table row into a paragraph with its cells separated by
 * " | ", since markdown in Blank has no tables. Header rows are bold.
 */
const tables = (doc: Document) => {
  // innermost first, so a nested table becomes text inside its cell
  const all = [...doc.querySelectorAll("table")].reverse();
  for (const table of all) {
    const rows = [...table.querySelectorAll("tr")].map((row) => {
      const paragraph = doc.createElement("p");
      const cells = [...row.children].filter((cell) =>
        /^T[DH]$/.test(cell.tagName),
      );
      const header =
        row.parentElement?.tagName === "THEAD" ||
        (cells.length > 0 && cells.every((cell) => cell.tagName === "TH"));
      const target = header
        ? paragraph.appendChild(doc.createElement("strong"))
        : paragraph;
      cells.forEach((cell, index) => {
        if (index) target.append(" | ");
        target.append(inlineContent(doc, cell));
      });
      return paragraph;
    });
    table.replaceWith(...rows);
  }
  return all.length;
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
 * emptyParagraphs turns the paragraphs of horizontal lines into <hr> and
 * removes other empty paragraphs, e.g. the ones Word documents use as space
 */
const emptyParagraphs = (doc: Document) => {
  doc.querySelectorAll("p").forEach((paragraph) => {
    if (paragraph.classList.contains(HORIZONTAL_LINE_CLASS)) {
      paragraph.replaceWith(doc.createElement("hr"));
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
  const tableCount = tables(doc);
  links(doc);
  const droppedImageCount = droppedImages(doc);
  emptyParagraphs(doc);
  tightLists(doc);
  return {
    tables: tableCount,
    footnotes: footnoteCount,
    comments: commentCount,
    droppedImages: droppedImageCount,
  };
};
