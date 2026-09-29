import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { documentFields } from "../layout/bands";
import { resolveLayout } from "../layout/resolve";
import { DEFAULT_PAGE } from "../layout/settings";
import { parseMarkdown } from "../markdown";
import { testEngine } from "../test/engine";
import type { FallbackFont } from "./fallback";
import { EMOJI_FAMILY, EMOJI_FILE } from "./fonts";

// a Chinese font many Linux systems have, which the test uses if it's there
const CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";

// The PDF holds what the page view paints: both come from one layout. This
// lays out real documents the way the editor does (flatten, the wasm
// engine), writes the PDF and reads every word back with pdftotext
// (poppler): each is on the page and at the spot the layout gave it.

const hasPdftotext = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

interface LaidWord {
  page: number;
  left: number;
  right: number;
  baseline: number;
  size: number;
  font: number;
  text: string;
}

const dir = mkdtempSync(join(tmpdir(), "blank-exact-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const readWords = (pdf: Uint8Array, name: string) => {
  const file = join(dir, `${name}.pdf`);
  writeFileSync(file, pdf);
  execFileSync("pdftotext", ["-bbox", file, join(dir, `${name}.html`)]);
  const html = readFileSync(join(dir, `${name}.html`), "utf8");
  const words: {
    page: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    text: string;
  }[] = [];
  let page = -1;
  for (const line of html.split("\n")) {
    if (line.includes("<page ")) page++;
    const match =
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/.exec(
        line,
      );
    if (!match) continue;
    const text = match[5]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    words.push({
      page,
      xMin: +match[1],
      yMin: +match[2],
      xMax: +match[3],
      yMax: +match[4],
      text,
    });
  }
  return words;
};

/**
 * compare lays out `markdown`, writes its PDF and checks every word of the
 * layout against the PDF
 * @returns how many words and pages there are
 */
const compare = (
  markdown: string,
  name: string,
  fonts: FallbackFont[] = [],
) => {
  const engine = testEngine();
  engine.addFonts(fonts);
  const doc = parseMarkdown(markdown);
  const { layout } = resolveLayout(
    doc.attrs.frontmatter as string | null,
    DEFAULT_PAGE,
    "de-DE",
  );
  const fields = documentFields(doc, null, {
    now: new Date(2026, 8, 29),
    locale: "en-GB",
  });
  engine.setSettings(layout, fields);
  engine.sync(doc, () => undefined);
  const laid = JSON.parse(engine.raw.words()) as LaidWord[];
  const found = readWords(engine.raw.pdf(fields.title, fields.author), name);
  if (found.length !== laid.length) {
    const a = laid.map((w) => w.text);
    const b = found.map((w) => w.text);
    console.log(
      JSON.stringify(a.filter((t) => !b.includes(t))),
      JSON.stringify(b.filter((t) => !a.includes(t))),
    );
  }
  expect(found.length).toBe(laid.length);
  const unmatched = [...found];
  // pdftotext boxes a word by its font's ascent and descent in the PDF,
  // which the first word in each font tells
  const metrics = new Map<number, { ascent: number; descent: number }>();
  const near = (a: number, b: number, tolerance = 0.05) =>
    Math.abs(a - b) < tolerance;
  for (const word of laid) {
    const known = metrics.get(word.font);
    const index = unmatched.findIndex((pdf) => {
      const ascent = known?.ascent ?? (word.baseline - pdf.yMin) / word.size;
      const descent = known?.descent ?? (pdf.yMax - word.baseline) / word.size;
      return (
        pdf.page === word.page &&
        pdf.text === word.text &&
        near(pdf.xMin, word.left) &&
        // the last glyph without its letter spacing
        near(pdf.xMax, word.right, 0.45) &&
        near(pdf.yMin, word.baseline - ascent * word.size) &&
        near(pdf.yMax, word.baseline + descent * word.size) &&
        (known !== undefined || (ascent > 0.5 && ascent < 1.2))
      );
    });
    if (index < 0)
      throw new Error(
        `${JSON.stringify(word)} isn't in the PDF where it was laid out`,
      );
    const pdf = unmatched[index];
    if (!known) {
      metrics.set(word.font, {
        ascent: (word.baseline - pdf.yMin) / word.size,
        descent: (pdf.yMax - word.baseline) / word.size,
      });
    }
    unmatched.splice(index, 1);
  }
  return { words: laid.length, pages: engine.pages() };
};

const welcome = readFileSync(
  resolve(import.meta.dirname, "../editor/welcome.md"),
  "utf8",
);

describe.runIf(hasPdftotext)("the PDF holds the layout", () => {
  it("of the welcome document", () => {
    const { words } = compare(welcome, "welcome");
    expect(words).toBeGreaterThan(300);
  });

  it("with code, emoji and Chinese in the fonts found for them", () => {
    const markdown = [
      "# Code",
      "",
      "Run `npm install` and then `bun run dev` here.",
      "",
      "```",
      "const answer = 42;",
      "console.log(answer);",
      "```",
      "",
      "Emoji 😀 and 🎉 and Chinese 中文字 in the text.",
    ].join("\n");
    const fonts: FallbackFont[] = [
      {
        family: EMOJI_FAMILY,
        bytes: readFileSync(
          resolve(import.meta.dirname, "../../fonts", EMOJI_FILE),
        ),
      },
    ];
    if (existsSync(CJK)) {
      fonts.push({ family: "Noto Sans CJK SC", bytes: readFileSync(CJK) });
    }
    const engine = testEngine();
    engine.addFonts(fonts);
    const doc = parseMarkdown(markdown);
    engine.sync(doc, () => undefined);
    // nothing is left without a glyph, but what the system lacks
    expect(engine.missing()).toBe(existsSync(CJK) ? "" : "中文字");
    const { words } = compare(markdown, "coverage", fonts);
    expect(words).toBeGreaterThan(20);
  });

  it("with headers, footers, chapters on new pages and another paper", () => {
    const markdown = [
      "---",
      "title: Report",
      "page:",
      "  size: a5",
      "  orientation: landscape",
      "  margins: 1.5cm",
      "  new-page-before: 1",
      "  header: { left: '{title}', right: '{chapter}' }",
      "  footer: { center: 'Page {page} of {pages}' }",
      "  number-style: i",
      "---",
      "",
      welcome,
      "",
      "<!-- pagebreak -->",
      "",
      "| Name | Value |",
      "| --- | --- |",
      ...Array.from(
        { length: 40 },
        (_, index) => `| row ${index} | value ${index} |`,
      ),
    ].join("\n");
    const { pages } = compare(markdown, "report");
    expect(pages).toBeGreaterThan(5);
  });
});
