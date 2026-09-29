import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

// The page view the layout engine paints: typing and clicking on the
// painted pages, both views, "Page N of M", and how long it all takes.

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");

const paragraph =
  "Writing is thinking on paper. The quick brown fox jumps over the lazy dog, and every line of this paragraph must end where the layout says it ends, on the screen and in the PDF alike.";

const documentOf = (chapters: number, paragraphs: number) =>
  [
    "---",
    "title: Engine",
    "page:",
    "  footer: { center: 'Page {page} of {pages}' }",
    "  header: { left: '{title}', right: '{chapter}' }",
    "---",
    "",
    ...Array.from({ length: chapters }, (_, chapter) => [
      `# Chapter ${chapter + 1}`,
      "",
      ...Array.from(
        { length: paragraphs },
        (_, index) =>
          `${paragraph} (${chapter + 1}.${index + 1}) **bold** and *italic*.\n`,
      ),
      "- a list item",
      "- another one",
      "",
      "> a quote to end the chapter",
      "",
    ]).flat(),
  ].join("\n");

const editorText = () =>
  browser.execute(() => document.querySelector("#editor")!.textContent ?? "");

// what the page view has published, read in the page
const frames = () => $$("#page-view .page-frame");

// a click `dx`, `dy` pixels into the first shown frame of a page
// scrolls the view so that the top of a page's frame is near the top
const showPage = (page: number) =>
  browser.execute((page: number) => {
    const view = document.getElementById("page-view")!;
    const frame = view.querySelector<HTMLElement>(
      `.page-frame[data-page="${page}"]`,
    );
    if (frame) view.scrollTop = frame.offsetTop - 80;
  }, page);

const clickOnPage = async (page: number, dx: number, dy: number) => {
  const frame = await $(`#page-view .page-frame[data-page="${page}"]`);
  await frame.waitForExist();
  await showPage(page);
  const location = await frame.getLocation();
  await browser
    .action("pointer")
    .move({
      x: Math.round(location.x + dx),
      y: Math.round(location.y + dy),
      origin: "viewport",
    })
    .down()
    .up()
    .perform();
  await browser.executeAsync((done: () => void) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  );
};

// times from each key press until the frame after it is painted
const startLatency = () =>
  browser.execute(() => {
    const frame: number[] = [];
    const work: number[] = [];
    Object.assign(window, { latency: { frame, work } });
    document.addEventListener(
      "keydown",
      () => {
        const start = performance.now();
        // all the work the key caused: the editor, the engine, Vue and the
        // canvas run before the next task
        setTimeout(() => work.push(performance.now() - start));
        // until the frame that shows it
        requestAnimationFrame(() =>
          setTimeout(() => frame.push(performance.now() - start)),
        );
      },
      true,
    );
  });

const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean =
    sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1);
  return {
    n: sorted.length,
    mean: +mean.toFixed(2),
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +at(1).toFixed(2),
  };
};

describe("page view", () => {
  let dir: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-engine-"));
    fs.mkdirSync(SHOTS, { recursive: true });
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("paints the pages and types where it is clicked", async () => {
    const file = path.join(dir, "short.md");
    fs.writeFileSync(file, documentOf(3, 6));
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    await expect($("#ui-page-number")).toHaveText(
      expect.stringMatching(/^Page 1 of \d+$/),
    );
    await browser.saveScreenshot(path.join(SHOTS, "engine-page-ends.png"));

    // left of the first paragraph, below the heading: its start
    await clickOnPage(1, 20, 58);
    await type("xyz ");
    await expect(
      browser.execute(
        () => document.querySelector("#editor p")?.textContent ?? "",
      ),
    ).resolves.toMatch(/^xyz Writing/i);
    await browser.saveScreenshot(path.join(SHOTS, "engine-typed.png"));

    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await browser.saveScreenshot(path.join(SHOTS, "engine-pages.png"));
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });

  it("moves by the painted lines and across pages", async () => {
    await clickOnPage(1, 44, 58);
    const before = await editorText();
    for (let index = 0; index < 60; index++) await browser.keys(Key.ArrowDown);
    await expect($("#ui-page-number")).toHaveText(
      expect.stringMatching(/^Page [2-9]/),
    );
    await type("q");
    expect((await editorText()).length).toBe(before.length + 1);
    await browser.saveScreenshot(path.join(SHOTS, "engine-moved.png"));
    // the mark where the first page ends
    await browser.execute(() =>
      document.querySelector(".page-end")!.scrollIntoView({ block: "center" }),
    );
    await browser.saveScreenshot(path.join(SHOTS, "engine-page-end.png"));
  });

  it("moves a view's height with Page Down and back with Page Up", async () => {
    await clickOnPage(1, 44, 58);
    const scroller = () =>
      browser.execute(() => document.getElementById("page-view")!.scrollTop);
    const top = await scroller();
    await browser.keys(Key.PageDown);
    await browser.keys(Key.PageDown);
    await expect(scroller()).resolves.toBeGreaterThan(top + 400);
    await browser.keys(Key.PageUp);
    await browser.keys(Key.PageUp);
    await expect(scroller()).resolves.toBeLessThan(top + 50);
  });

  it("opens the context menu where the pages are right clicked", async () => {
    await showPage(1);
    const frame = await $('#page-view .page-frame[data-page="1"]');
    const location = await frame.getLocation();
    await browser
      .action("pointer")
      .move({
        x: Math.round(location.x + 60),
        y: Math.round(location.y + 58),
        origin: "viewport",
      })
      .down({ button: 2 })
      .up({ button: 2 })
      .perform();
    const menu = $("#context-menu");
    await expect(menu).toBeExisting();
    const box = await menu.getLocation();
    expect(Math.abs(box.x - (location.x + 60))).toBeLessThan(40);
    await browser.keys(Key.Escape);
    await expect(menu).not.toBeExisting();
  });

  it("places the table toolbar on the painted table", async () => {
    const file = path.join(dir, "table.md");
    fs.writeFileSync(
      file,
      [
        "Some text above the table.",
        "",
        "| Name | Value |",
        "| --- | --- |",
        "| one | 1 |",
        "| two | 2 |",
        "",
        "Text below.",
      ].join("\n"),
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    // into the table's second row
    await clickOnPage(1, 60, 58);
    await browser.keys(Key.ArrowDown);
    await browser.keys(Key.ArrowDown);
    const toolbar = $("#table-toolbar");
    await expect(toolbar).toBeDisplayed();
    const frame = await $('#page-view .page-frame[data-page="1"]');
    const page = await frame.getLocation();
    const bar = await toolbar.getLocation();
    const size = await toolbar.getSize();
    // above the table, whose top is a line or two below the page's top
    expect(bar.y + size.height).toBeGreaterThan(page.y);
    expect(bar.y + size.height).toBeLessThan(page.y + 80);
    await browser.saveScreenshot(path.join(SHOTS, "engine-table.png"));
  });

  it("paints what the editor shows around the text", async () => {
    const file = path.join(dir, "marks.md");
    fs.writeFileSync(
      file,
      [
        "---",
        "title: Marks",
        "author: Ada",
        "---",
        "",
        "A wrng word and [a link](https://example.com) in the text.",
        "",
        "![a cat](missing.png)",
        "",
        "<!-- pagebreak -->",
        "",
        "The second page.",
      ].join("\n"),
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    await expect(
      browser.execute(
        () => document.querySelector("#page-view .doc-properties")?.textContent,
      ),
    ).resolves.toMatch(/^\s*Marks · by Ada\s*$/);
    await expect($("#page-view .page-break-mark")).toBeExisting();
    // spell check in English, off by default
    await pressMod(Key.Alt, "l");
    await type("en");
    await type(Key.Enter);
    await pressMod(Key.Alt, "s");
    await expect($("#page-view .page-misspelling")).toBeExisting();
    // a right click on it offers the suggestions
    const mark = await browser.execute(() => {
      const box = document
        .querySelector("#page-view .page-misspelling")!
        .getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await browser
      .action("pointer")
      .move({
        x: Math.round(mark.x),
        y: Math.round(mark.y),
        origin: "viewport",
      })
      .down({ button: 2 })
      .up({ button: 2 })
      .perform();
    await expect($("#context-menu")).toBeDisplayed();
    await $(`[data-id="loading"]`).waitForExist({ reverse: true });
    await expect($('#context-menu [data-id^="suggestion:"]')).toBeExisting();
    await browser.saveScreenshot(path.join(SHOTS, "engine-suggestions.png"));
    await browser.keys(Key.Escape);
    await browser.saveScreenshot(path.join(SHOTS, "engine-marks.png"));
    // every other theme, and back to the first
    for (let index = 0; index < 6; index++) {
      await pressMod(Key.Alt, "t");
      await browser.executeAsync((done: () => void) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      );
      const theme = await browser.execute(() => document.body.dataset.theme);
      await browser.saveScreenshot(
        path.join(SHOTS, `engine-theme-${theme}.png`),
      );
    }
    // the summary opens the page setup
    await $("#page-view .doc-properties").click();
    await expect($("#page-setup")).toBeDisplayed();
    await browser.keys(Key.Escape);
    await expect($("#page-setup")).not.toBeExisting();
  });

  it("lays out captions, merged cells and rows taller than a page", async () => {
    const file = path.join(dir, "merged.md");
    const long = `${paragraph} `.repeat(30);
    fs.writeFileSync(
      file,
      [
        "<table>",
        "<caption>Fruit and more</caption>",
        "<tr><th>Fruit</th><th>Qty</th><th>Note</th></tr>",
        '<tr><th rowspan="2">kiwi</th><td>10</td><td>green</td></tr>',
        '<tr><td colspan="2">two columns merged</td></tr>',
        "</table>",
        "",
        "| Head |",
        "| --- |",
        `| ${long} |`,
        "",
        "After the tables.",
      ].join("\n"),
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    const tables = () =>
      browser.execute(() =>
        (
          window as unknown as {
            blankGeometry: {
              tables: () => {
                rowCount: number;
                pieces: { page: number; firstRow: number }[];
              }[];
            };
          }
        ).blankGeometry.tables(),
      );
    const [merged, tall] = await tables();
    expect(merged.rowCount).toBe(3);
    expect(merged.pieces).toHaveLength(1);
    // the tall row goes on over the pages
    expect(tall.rowCount).toBe(2);
    expect(tall.pieces.length).toBeGreaterThan(1);
    await browser.saveScreenshot(path.join(SHOTS, "engine-merged.png"));
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await showPage(2);
    await browser.saveScreenshot(path.join(SHOTS, "engine-tall-row.png"));
    await pressMod(Key.Alt, "v");
  });

  it("shows code in Plex Mono, emoji and Chinese", async () => {
    const file = path.join(dir, "coverage.md");
    fs.writeFileSync(
      file,
      [
        "# Coverage",
        "",
        "Run `npm install` and then `bun run dev` here.",
        "",
        "```",
        "const answer = 42;",
        "console.log(answer);",
        "```",
        "",
        "Emoji 😀 🎉 👍 and Chinese 中文字 and Japanese かな in the text.",
      ].join("\n"),
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    // the fonts are found and the text laid out again with them
    await browser.pause(1500);
    await browser.saveScreenshot(path.join(SHOTS, "engine-coverage.png"));
  });

  // two chapters of four paragraphs fill about a page
  for (const [name, chapters] of [
    ["1", 1],
    ["20", 40],
    ["100", 200],
  ] as const) {
    it(`measures typing on about ${name} pages`, async () => {
      const file = path.join(dir, `long-${name}.md`);
      fs.writeFileSync(
        file,
        chapters === 1 ? documentOf(1, 3) : documentOf(chapters, 4),
      );
      const booted = Date.now();
      await restartApp([file]);
      await expect($("#page-view .page-canvas")).toBeExisting();
      const bootMs = Date.now() - booted;
      const pages = await $("#ui-page-number").getText();
      await clickOnPage(1, 44, 58);
      await browser.execute(() =>
        (
          window as unknown as {
            blankPageViewPerf: (clear: boolean) => unknown;
          }
        ).blankPageViewPerf(true),
      );
      await startLatency();
      await type("the quick brown fox jumps over the lazy dog ");
      await browser.executeAsync((done: () => void) => setTimeout(done, 300));
      const perf = (await browser.execute(() =>
        (
          window as unknown as {
            blankPageViewPerf: (clear: boolean) => Record<string, number[]>;
          }
        ).blankPageViewPerf(false),
      )) as Record<string, number[]>;
      const latency = (await browser.execute(
        () =>
          (
            window as unknown as {
              latency: { frame: number[]; work: number[] };
            }
          ).latency,
      )) as { frame: number[]; work: number[] };
      const result = {
        pages,
        frames: (await frames()).length,
        bootMs,
        work: summary(latency.work),
        frame: summary(latency.frame),
        dispatch: summary(perf.dispatch),
        layout: summary(perf.layout),
        caret: summary(perf.caret),
        paint: summary(perf.paint),
      };
      console.log(`MEASURE ${name}: ${JSON.stringify(result)}`);
      fs.appendFileSync(
        path.join(SHOTS, "engine-measurements.jsonl"),
        JSON.stringify({ name, ...result }) + "\n",
      );
    });
  }
});
