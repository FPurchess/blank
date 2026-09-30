import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetch } from "@tauri-apps/plugin-http";
import { EditorState } from "prosemirror-state";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown, schema } from "../markdown";
import { IMAGES } from "../test/images";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import toPDF from "./pdf";

// The PDF export through the engine, as the user gets it: the images it
// could and couldn't embed, the pages, the links and the metadata.

const has = (tool: string) => {
  try {
    execFileSync(tool, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const dir = mkdtempSync(join(tmpdir(), "blank-pdf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const markdown = [
  "---",
  "title: The Report",
  "author: Ada",
  "---",
  "",
  "# Findings",
  "",
  "See [the site](https://example.com) for more.",
  "",
  `![a dot](data:image/png;base64,${IMAGES.png})`,
  "",
  "![from the web](https://example.com/cat.png)",
  "",
  "![next to the file](cat.png)",
  "",
  "3. three",
  "4. four",
].join("\n");

const exportIt = async () => {
  const doc = parseMarkdown(markdown);
  const state = EditorState.create({ schema, doc });
  return toPDF(state, { docPath: null, layout: testLayout() });
};

describe("the PDF's fonts", () => {
  beforeEach(() => testEngine());

  it.runIf(has("pdffonts"))(
    "are IBM Plex Sans in its faces, with DejaVu Sans only for what it lacks",
    async () => {
      const doc = parseMarkdown(
        "# A medium heading\n\nRegular, **bold**, *italic*, ***both***, and ⇒.\n",
      );
      const state = EditorState.create({ schema, doc });
      const { contents } = await toPDF(state, {
        docPath: null,
        layout: testLayout(),
      });
      const file = join(dir, "fonts.pdf");
      writeFileSync(file, contents);
      const listed = execFileSync("pdffonts", [file], { encoding: "utf8" });
      // the names without the subset prefix, e.g. "ABCDEF+"
      const names = listed
        .split("\n")
        .slice(2)
        .map((line) => line.split(/\s+/)[0]?.replace(/^[A-Z]{6}\+/, ""))
        .filter(Boolean)
        .sort();
      expect(names).toEqual([
        "DejaVuSans",
        "IBMPlexSans",
        "IBMPlexSans-Bold",
        "IBMPlexSans-BoldItalic",
        "IBMPlexSans-Italic",
        // IBM's own PostScript name of the Medium face
        "IBMPlexSans-Medm",
      ]);
    },
  );
});

describe("the PDF export", () => {
  beforeEach(() => {
    // the engine and its fonts, as the app has loaded them
    testEngine();
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  });

  it("embeds the images it can load and tells which it couldn't", async () => {
    const { contents, warnings, pages } = await exportIt();
    expect(pages).toBe(1);
    expect(warnings).toEqual([
      expect.stringMatching(
        /^2 images could not be embedded: (from the web, next to the file|next to the file, from the web)$/,
      ),
    ]);
    expect(contents.length).toBeGreaterThan(1000);
  });

  it.runIf(has("pdfinfo") && has("pdftotext") && has("pdfimages"))(
    "holds the text, the image, the link, the list's numbers and the metadata",
    async () => {
      const { contents } = await exportIt();
      const file = join(dir, "report.pdf");
      writeFileSync(file, contents);
      const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
      expect(info).toMatch(/Title:\s+The Report/);
      expect(info).toMatch(/Author:\s+Ada/);
      expect(info).toMatch(/Creator:\s+Blank/);
      const text = execFileSync("pdftotext", ["-layout", file, "-"], {
        encoding: "utf8",
      });
      expect(text).toContain("Findings");
      expect(text).toContain("See the site for more.");
      // an ordered list starting at 3, and the alt text of what's missing
      expect(text).toMatch(/3\.\s+three/);
      expect(text).toMatch(/4\.\s+four/);
      expect(text).toContain("from the web");
      // the one image loaded, 3 × 2 pixels
      const images = execFileSync("pdfimages", ["-list", file], {
        encoding: "utf8",
      });
      expect(images).toMatch(/^\s*1\s+0\s+image\s+3\s+2\s/m);
      // the link, clickable
      const links = execFileSync("pdfinfo", ["-url", file], {
        encoding: "utf8",
      });
      expect(links).toContain("https://example.com");
    },
  );
});
