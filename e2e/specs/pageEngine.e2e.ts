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
const clickOnPage = async (page: number, dx: number, dy: number) => {
  const frame = await $(`#page-view .page-frame[data-page="${page}"]`);
  await frame.waitForExist();
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
