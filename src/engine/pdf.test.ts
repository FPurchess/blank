import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { save } from "@tauri-apps/plugin-dialog";
import { fetch } from "@tauri-apps/plugin-http";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { EditorState } from "prosemirror-state";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { parseMarkdown, schema } from "../markdown";
import { IMAGES } from "../test/images";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import exportAs from "../editor/commands/exportAs";
import { flushPromises } from "../test/async";
import { engineInstanceBroken, forgetEngineFailure } from "./engine";
import toPDF, {
  describeWarnings,
  pdfDate,
  pdfLanguage,
  sizesOf,
  WORKER_TIMEOUT,
} from "./pdf";
import { language } from "../state";
import { prepareImages } from "../images/prepare";
import { documentFields } from "../layout/bands";
import { pageGeometry } from "../layout/resolve";
import { forgetImages, imageSizes, loadedImage } from "./images";
import { fallbackFonts, forgetFallbacks } from "./fallback";
import { readFileSync } from "node:fs";
import { handleJob, type PdfReply } from "./pdfWorker";
import type { PdfJob } from "./pdfJob";
import { LayoutEngine } from "./wasm/blank_layout.js";
import * as pdfJob from "./pdfJob";
import { baseFonts, pageEngine, setPageEngine } from "./engine";

// The PDF export through the engine, as the user gets it: the images it
// could and couldn't embed, the pages, the links and the metadata.

const has = (tool: string) => {
  try {
    execFileSync(tool, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    if (process.env.CI)
      throw new Error(
        `${tool} is missing: install poppler, CI doesn't skip this test`,
      );
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

describe("the PDF export after the engine trapped", () => {
  const trap = () => {
    throw new WebAssembly.RuntimeError("unreachable");
  };
  // what the worker got, run in this process, since jsdom has no workers
  let jobs: PdfJob[] = [];
  let workerFails = false;

  class InProcessWorker {
    onmessage: ((event: { data: PdfReply }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminate = vi.fn();
    // as a worker gets it: a copy, with the buffers it's handed detached
    // on this side
    postMessage(message: PdfJob, transfer: Transferable[] = []) {
      const job = structuredClone(message, { transfer });
      jobs.push(job);
      if (workerFails) {
        queueMicrotask(() => this.onerror?.({ message: "no worker" }));
        return;
      }
      void handleJob(job, (reply, back) =>
        this.onmessage?.({ data: structuredClone(reply, { transfer: back }) }),
      );
    }
  }

  beforeEach(() => {
    testEngine();
    jobs = [];
    workerFails = false;
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    vi.stubGlobal("Worker", InProcessWorker);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => forgetEngineFailure());

  it.runIf(has("pdftotext"))(
    "writes it in a worker with a wasm instance of its own",
    async () => {
      vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(trap);

      const { contents, pages } = await exportIt();

      expect(engineInstanceBroken()).toBe(true);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toBe("The Report");
      expect(pages).toBe(1);
      const file = join(dir, "worker.pdf");
      writeFileSync(file, contents);
      const text = execFileSync("pdftotext", [file, "-"], {
        encoding: "utf8",
      });
      expect(text).toContain("Findings");
    },
  );

  it("fails on an error of its own that isn't a trap, without a worker", async () => {
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(() => {
      throw new Error("the image x.png can't be written");
    });
    await expect(exportIt()).rejects.toThrow(
      "the image x.png can't be written",
    );
    expect(engineInstanceBroken()).toBe(false);
    expect(jobs).toEqual([]);
  });

  it("gives up a worker that doesn't answer", async () => {
    vi.useFakeTimers();
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(trap);
    // a worker that never answers
    const hanging = vi
      .spyOn(InProcessWorker.prototype, "postMessage")
      .mockImplementation(() => {});
    const done = exportIt().then(
      () => "written",
      (error: Error) => error.message,
    );
    await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT + 1);
    expect(await done).toMatch(/took too long/);
    hanging.mockRestore();
    vi.useRealTimers();
  });

  it("gives up the page view's engine after a trap, which shares the instance", async () => {
    const page = testEngine();
    setPageEngine(page);
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(trap);

    const { pages } = await exportIt();

    expect(pages).toBe(1);
    expect(jobs).toHaveLength(1);
    expect(page.broken).toBe(true);
    expect(pageEngine).toBeNull();
    expect(document.body.classList).toContain("without-engine");
    setPageEngine(null);
  });

  it("hands the worker copies, so the page view keeps its fonts", async () => {
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(trap);
    const fonts = await baseFonts();
    const sizes = fonts.map((font) => font.byteLength);
    await exportIt();
    expect(jobs).toHaveLength(1);
    expect((await baseFonts()).map((font) => font.byteLength)).toEqual(sizes);
    expect(sizes.every((size) => size > 0)).toBe(true);
  });

  it("goes straight to the worker once the instance is broken", async () => {
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementationOnce(trap);
    language.value = "de-CH";
    await exportIt();
    await exportIt();
    language.value = "en";
    expect(jobs).toHaveLength(2);
    // with the document's language, as the page view's engine gets it
    expect(jobs[1].language).toBe("de-CH");
  });

  it("tells the user when the worker fails too", async () => {
    vi.spyOn(LayoutEngine.prototype, "pdf").mockImplementation(trap);
    workerFails = true;
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const doc = parseMarkdown("Some text");
    const state = EditorState.create({ schema, doc });

    exportAs("PDF-Export", toPDF, [{ name: "PDF", extensions: ["pdf"] }])(
      state,
    );
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalled());
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title: "PDF-Export",
      body: "Failed to export file: the page layout failed while writing the PDF: no worker",
    });
  });
});

describe("the PDF's images", () => {
  afterEach(() => forgetImages());

  it("are laid out as the page view lays them out", async () => {
    const src = `data:image/png;base64,${IMAGES.png}`;
    const node = parseMarkdown(`Text\n\n![a dot](${src})\n\nMore`);
    const layout = testLayout();
    const fields = documentFields(node);

    const { images } = await prepareImages(node, null, ["image/png"]);
    const pdf = testEngine();
    pdf.setSettings(layout, fields);
    pdf.sync(node, sizesOf(images, layout));

    // the page view's, once the webview loaded the image
    let loaded: (() => void) | null = null;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 3;
        naturalHeight = 2;
        set src(_src: string) {
          loaded = () => this.onload?.();
        }
      },
    );
    loadedImage(src, null);
    loaded!();
    const { contentWidth, contentHeight } = pageGeometry(layout);
    const screen = testEngine();
    screen.setSettings(layout, fields);
    screen.sync(
      node,
      imageSizes(null, { width: contentWidth, height: contentHeight }),
    );

    expect(screen.pages()).toBe(pdf.pages());
    const shown = (engine: typeof pdf) => engine.bodyDisplay(0, 1).i;
    expect(shown(screen)).toHaveLength(1);
    expect(shown(screen)).toEqual(shown(pdf));
  });
});

describe("the PDF's fallback fonts", () => {
  afterEach(() => forgetFallbacks());

  it.runIf(has("pdffonts"))(
    "has the font for an emoji the page view never showed",
    async () => {
      testEngine();
      // Blank's emoji font, as the webview fetches it
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              readFileSync(
                join(
                  import.meta.dirname,
                  "../../fonts/NotoEmoji-VariableFont_wght.ttf",
                ),
              ),
            ),
        ),
      );
      // a crab, which DejaVu Sans lacks, unlike 😀
      const doc = parseMarkdown("Crab 🦀\n");
      const state = EditorState.create({ schema, doc });

      const { contents } = await toPDF(state, {
        docPath: null,
        layout: testLayout(),
      });

      expect(fallbackFonts.value.map((font) => font.family)).toHaveLength(1);
      const file = join(dir, "emoji.pdf");
      writeFileSync(file, contents);
      const listed = execFileSync("pdffonts", [file], { encoding: "utf8" });
      expect(listed).toMatch(/NotoEmoji/);
    },
  );
});

describe("the PDF's tables", () => {
  it.runIf(has("pdfimages"))("embed the images in their cells", async () => {
    testEngine();
    const doc = parseMarkdown(
      [
        `| Picture | Name |`,
        `|---|---|`,
        `| ![a dot](data:image/png;base64,${IMAGES.png}) | a dot |`,
      ].join("\n"),
    );
    const state = EditorState.create({ schema, doc });
    const { contents } = await toPDF(state, {
      docPath: null,
      layout: testLayout(),
    });
    const file = join(dir, "table.pdf");
    writeFileSync(file, contents);
    const images = execFileSync("pdfimages", ["-list", file], {
      encoding: "utf8",
    });
    expect(images).toMatch(/^\s*1\s+0\s+image\s+3\s+2\s/m);
  });
});

describe("the PDF's fonts, shared with the page view", () => {
  const emoji = () =>
    readFileSync(
      join(import.meta.dirname, "../../fonts/NotoEmoji-VariableFont_wght.ttf"),
    );

  afterEach(() => {
    setPageEngine(null);
    forgetFallbacks();
  });

  it("aren't copied into the engine again for an export", async () => {
    const page = testEngine();
    const font = { family: "Noto Emoji", bytes: new Uint8Array(emoji()) };
    fallbackFonts.value = [font];
    page.addFonts([font]);
    setPageEngine(page);
    const packed = vi.spyOn(pdfJob, "packFonts");
    const added = vi.spyOn(LayoutEngine.prototype, "addFont");
    const shared = vi.spyOn(LayoutEngine, "withFontsOf");

    const doc = parseMarkdown("Crab 🦀\n");
    await toPDF(EditorState.create({ schema, doc }), {
      docPath: null,
      layout: testLayout(),
    });

    expect(shared).toHaveBeenCalledWith(page.raw);
    expect(packed).not.toHaveBeenCalled();
    expect(added).not.toHaveBeenCalled();
  });

  it("are what the worker rebuilds its engine from, in the same order", async () => {
    const page = testEngine();
    const font = { family: "Noto Emoji", bytes: new Uint8Array(emoji()) };
    fallbackFonts.value = [font];
    page.addFonts([font]);
    const raw = page.raw;
    const store = Array.from({ length: raw.fontFileCount() }, (_, index) => ({
      family: raw.fontFileFamily(index),
      bytes: raw.fontFile(index),
    }));

    // the files of the worker's job: Blank's own, then the fallbacks
    const files = await baseFonts();
    const job = [
      ...files.map((bytes) => ({ family: "", bytes })),
      ...fallbackFonts.value,
    ];
    expect(store.map((file) => file.family)).toEqual(
      job.map((file) => file.family),
    );
    store.forEach((file, index) =>
      expect(file.bytes.length).toBe(job[index].bytes.length),
    );
  });
});

describe("the PDF's language", () => {
  afterEach(() => (language.value = "en"));

  it("is the language setting, as a BCP 47 tag", () => {
    language.value = "de-CH";
    expect(pdfLanguage()).toBe("de-CH");
    language.value = "fr";
    expect(pdfLanguage()).toBe("fr");
  });

  it("is none for what isn't a language tag", () => {
    for (const value of ["", "  ", "not a tag", "de_CH"]) {
      language.value = value;
      expect(pdfLanguage()).toBeUndefined();
    }
  });

  it("is written into the PDF", async () => {
    testEngine();
    language.value = "de-CH";
    const doc = parseMarkdown("Grüezi\n");
    const { contents } = await toPDF(EditorState.create({ schema, doc }), {
      docPath: null,
      layout: testLayout(),
    });
    expect(new TextDecoder("latin1").decode(contents)).toMatch(
      /\/Lang\s*\(de-CH\)/,
    );
  });
});

describe("the PDF's warnings", () => {
  it("tell in plain words what the PDF left out", () => {
    expect(describeWarnings([])).toEqual([]);
    expect(describeWarnings([{ kind: "image", src: "cat.png" }])).toEqual([
      "1 image couldn't be read and shows its alt text: cat.png",
    ]);
    expect(
      describeWarnings([
        { kind: "image", src: "cat.png" },
        { kind: "image", src: "dog.png" },
        { kind: "font", font: 20, family: "Noto Sans CJK SC" },
      ]),
    ).toEqual([
      "2 images couldn't be read and show their alt text: cat.png, dog.png",
      "1 font couldn't be embedded, so its text is left out: Noto Sans CJK SC",
    ]);
    // each named once
    expect(
      describeWarnings([
        { kind: "font", font: 1, family: "" },
        { kind: "font", font: 2, family: "" },
        { kind: "image", src: "a.png" },
        { kind: "image", src: "a.png" },
      ]),
    ).toEqual([
      "1 image couldn't be read and shows its alt text: a.png",
      "1 font couldn't be embedded, so its text is left out: one of Blank's fonts",
    ]);
    expect(
      describeWarnings([
        { kind: "font", font: 1, family: "" },
        { kind: "font", font: 20, family: "Noto Sans CJK SC" },
      ]),
    ).toEqual([
      "2 fonts couldn't be embedded, so their text is left out: one of Blank's fonts, Noto Sans CJK SC",
    ]);
  });

  it("tell why the PDF isn't a PDF/A", () => {
    expect(
      describeWarnings([
        { kind: "pdfa", reason: "no font has the characters 𓀀𓀁" },
      ]),
    ).toEqual([
      "It's a normal PDF, not a PDF/A for archiving, because no font has the characters 𓀀𓀁",
    ]);
  });

  it("come with the export of an image the engine can't decode", async () => {
    testEngine();
    // a PNG whose header is fine, but whose pixels are broken
    const bytes = Uint8Array.from(atob(IMAGES.png), (c) => c.charCodeAt(0));
    const idat = bytes.findIndex(
      (_, index) =>
        String.fromCharCode(...bytes.slice(index, index + 4)) === "IDAT",
    );
    for (let index = idat + 4; index < idat + 14; index++) bytes[index] ^= 0xff;
    const src = `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
    const doc = parseMarkdown(`![a broken dot](${src})\n`);
    const { warnings } = await toPDF(EditorState.create({ schema, doc }), {
      docPath: null,
      layout: testLayout(),
    });
    expect(warnings).toEqual([
      "1 image couldn't be read and shows its alt text: a broken dot",
    ]);
  });
});

describe("pdfDate", () => {
  it("writes local time in ISO 8601 with its offset", () => {
    const date = pdfDate(new Date(2026, 9, 1, 9, 5, 7));
    expect(date).toMatch(/^2026-10-01T09:05:07[+-]\d{2}:\d{2}$/);
    const offset = -new Date(2026, 9, 1, 9, 5, 7).getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
    expect(date.endsWith(`${sign}${hours}:${minutes}`)).toBe(true);
  });
});
