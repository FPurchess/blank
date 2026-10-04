import type JSZip from "jszip";

import {
  type Bands,
  type FirstPage,
  NO_SLOTS,
  type NumberStyle,
  SLOTS,
  type Slots,
} from "../../layout/settings";
import { escape, type Field } from "../../layout/tokens";
import { WORD_FIELDS, WORD_NUMBER_FORMATS } from "../../exporters/docx/fields";
import { child, children, isOn, parsePart, SETTINGS_PART, val, W } from "./xml";

// Reads the headers and footers of a Word document's first section, which
// mammoth leaves out, into Blank's slots: the text before the first tab on
// the left, after it in the center, after the second one on the right, and
// Word's page number, title, author, chapter, date and file name fields as
// placeholders.

const RELATIONSHIPS = "word/_rels/document.xml.rels";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// the placeholders of Word's fields; STYLEREF only for {chapter}
const FIELDS: Record<string, Field> = Object.fromEntries(
  (Object.entries(WORD_FIELDS) as [Field, string][])
    .filter(([field]) => field !== "chapter")
    .map(([field, name]) => [name, field]),
);

// STYLEREF of CHAPTER_STYLE (fields.ts), by the style's name in any case,
// or by its level
const CHAPTER = /^STYLEREF\s+(?:"\s*heading\s*1\s*"|1)(?:\s|$)/i;

const fieldOf = (instruction: string): Field | undefined => {
  const trimmed = instruction.trim();
  if (CHAPTER.test(trimmed)) return "chapter";
  return FIELDS[trimmed.split(/\s+/)[0]?.toUpperCase() ?? ""];
};

// Word's page number styles that Blank has
const NUMBER_STYLES: Record<string, NumberStyle> = Object.fromEntries(
  (Object.entries(WORD_NUMBER_FORMATS) as [NumberStyle, string][]).map(
    ([style, format]) => [format, style],
  ),
);

export interface WordBands {
  header: Slots;
  footer: Slots;
  firstPage: FirstPage;
  evenPages: Bands | null;
  numberStyle: NumberStyle;
  startNumber: number;
  warnings: string[];
}

/**
 * paragraphText returns the text of a paragraph split at its tabs, with the
 * fields Blank knows as placeholders and the others as the text Word showed.
 * `tabs` has the alignment of each absolute tab (w:ptab), which Word's own
 * header gallery uses, and null for a tab that goes to the next tab stop.
 */
const paragraphText = (p: Element) => {
  const segments = [""];
  const tabs: (string | null)[] = [];
  const add = (text: string) => (segments[segments.length - 1] += text);
  // a complex field: its instruction, then the text Word showed for it
  let field: { instruction: string; shown: boolean } | null = null;
  let cached = "";

  const walk = (element: Element) => {
    for (const node of element.children) {
      if (node.namespaceURI !== W) continue;
      switch (node.localName) {
        case "fldSimple": {
          const token = fieldOf(val(node, "instr") ?? "");
          if (token) add(`{${token}}`);
          else walk(node);
          break;
        }
        case "fldChar": {
          const type = val(node, "fldCharType");
          if (type === "begin") {
            field = { instruction: "", shown: false };
            cached = "";
          } else if (type === "separate" && field) {
            field.shown = true;
          } else if (type === "end" && field) {
            const token = fieldOf(field.instruction);
            add(token ? `{${token}}` : escape(cached));
            field = null;
          }
          break;
        }
        case "instrText":
          if (field) field.instruction += node.textContent ?? "";
          break;
        case "t":
          if (field) {
            if (field.shown) cached += node.textContent ?? "";
          } else {
            add(escape(node.textContent ?? ""));
          }
          break;
        case "tab":
        case "ptab":
          if (!field && element.localName === "r") {
            segments.push("");
            tabs.push(
              node.localName === "ptab"
                ? (val(node, "alignment") ?? null)
                : null,
            );
          }
          break;
        // runs and what holds them, like the content controls in which
        // Word's page number gallery puts its fields
        case "r":
        case "hyperlink":
        case "smartTag":
        case "ins":
        case "sdt":
        case "sdtContent":
          walk(node);
          break;
      }
    }
  };
  walk(p);
  return { segments, tabs };
};

/**
 * slotsOf puts the segments of a paragraph into slots: by the alignment of
 * an absolute tab or the tab stops the paragraph sets, else in order like
 * Word's own Header and Footer styles, whose tabs are centered and right
 * aligned. Without tabs, the paragraph's alignment tells.
 */
const slotsOf = (
  p: Element,
  segments: string[],
  tabs: (string | null)[],
): Slots => {
  const slots = { ...NO_SLOTS };
  const pPr = child(p, "pPr");
  if (segments.length === 1) {
    const align = val(child(pPr, "jc"));
    const slot =
      align === "center"
        ? "center"
        : align === "right" || align === "end"
          ? "right"
          : "left";
    slots[slot] = segments[0];
    return slots;
  }
  const stops = children(child(pPr, "tabs") ?? p, "tab")
    .map((tab) => val(tab))
    .filter((alignment) => alignment !== "clear");
  let tabStop = 0;
  segments.forEach((text, index) => {
    if (index === 0) {
      slots.left = text;
      return;
    }
    const stop = tabs[index - 1] ?? stops[tabStop++];
    const slot =
      stop === "right" || stop === "end"
        ? "right"
        : stop === "center"
          ? "center"
          : (SLOTS[index] ?? "right");
    slots[slot] = slots[slot] ? `${slots[slot]} ${text}` : text;
  });
  return slots;
};

/**
 * readPart reads a header or footer part into slots
 */
const readPart = (part: Document, warnings: Set<string>): Slots => {
  const slots = { ...NO_SLOTS };
  const root = part.documentElement;
  if (
    root.getElementsByTagNameNS(W, "drawing").length ||
    root.getElementsByTagNameNS(W, "pict").length
  ) {
    warnings.add("pictures in the header or footer were left out");
  }
  if (root.getElementsByTagNameNS(W, "tbl").length) {
    warnings.add("tables in the header or footer became text");
  }
  const paragraphs = [...root.getElementsByTagNameNS(W, "p")].map((p) => {
    const { segments, tabs } = paragraphText(p);
    return slotsOf(
      p,
      segments.map((text) => text.trim()),
      tabs,
    );
  });
  const filled = paragraphs.filter((p) => SLOTS.some((slot) => p[slot]));
  if (filled.length > 1) {
    warnings.add("headers and footers of several lines became one line");
  }
  for (const paragraph of filled) {
    for (const slot of SLOTS) {
      if (!paragraph[slot]) continue;
      slots[slot] = slots[slot]
        ? `${slots[slot]} ${paragraph[slot]}`
        : paragraph[slot];
    }
  }
  return slots;
};

const isEmpty = (slots: Slots) => SLOTS.every((slot) => !slots[slot]);

/**
 * readBands reads the header, footer and page numbering of a section
 * @param zip the .docx file
 * @param sectPr the section's properties
 */
export const readBands = async (
  zip: JSZip,
  sectPr: Element,
  // word/settings.xml, when the caller read it already
  settingsPart?: Document | null,
): Promise<WordBands> => {
  const warnings = new Set<string>();
  const relationships = await parsePart(zip, RELATIONSHIPS);
  const targets = new Map(
    [...(relationships?.getElementsByTagName("Relationship") ?? [])].map(
      (r) => [r.getAttribute("Id"), r.getAttribute("Target")],
    ),
  );
  // the parts of a band by their type: default, first or even
  const parts = async (band: "header" | "footer") => {
    const byType = new Map<string, Slots>();
    for (const reference of children(sectPr, `${band}Reference`)) {
      const target = targets.get(reference.getAttributeNS(R, "id"));
      if (!target) continue;
      const part = await parsePart(zip, `word/${target.replace(/^\//, "")}`);
      if (part)
        byType.set(
          val(reference, "type") ?? "default",
          readPart(part, warnings),
        );
    }
    return byType;
  };
  const headers = await parts("header");
  const footers = await parts("footer");

  // the header and footer of a type; the first section of a document has
  // none where it has no part
  const bandsOf = (type: string): Bands => ({
    header: headers.get(type) ?? { ...NO_SLOTS },
    footer: footers.get(type) ?? { ...NO_SLOTS },
  });

  let firstPage: FirstPage = "same";
  if (isOn(child(sectPr, "titlePg"))) {
    const first = bandsOf("first");
    firstPage =
      isEmpty(first.header) && isEmpty(first.footer) ? "plain" : first;
  }
  const settings =
    settingsPart === undefined
      ? await parsePart(zip, SETTINGS_PART)
      : settingsPart;
  const evenPages = isOn(
    settings?.getElementsByTagNameNS(W, "evenAndOddHeaders")[0],
  )
    ? bandsOf("even")
    : null;

  const numbering = child(sectPr, "pgNumType");
  // Word starts at 1 without a w:start
  const start = Number(val(numbering, "start") ?? 1);
  const format = val(numbering, "fmt") ?? "decimal";
  if (!NUMBER_STYLES[format]) warnings.add("page numbers became 1, 2, 3");
  return {
    ...bandsOf("default"),
    firstPage,
    evenPages,
    numberStyle: NUMBER_STYLES[format] ?? "1",
    startNumber: Number.isInteger(start) && start >= 0 ? start : 1,
    warnings: [...warnings],
  };
};
