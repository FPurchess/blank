import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { Key, pressMod, restartApp } from "../helpers.ts";

// How smoothly the pages scroll: the time between the frames while the view
// scrolls, by setting scrollTop on every frame and by the mouse wheel, on
// documents of about 20 and 100 pages, in both views. Run it at 2× with
// GDK_SCALE=2. It writes e2e/screenshots/scroll-measurements.jsonl.

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");

const paragraph =
  "Writing is thinking on paper. The quick brown fox jumps over the lazy dog, and every line of this paragraph must end where the layout says it ends, on the screen and in the PDF alike.";

const documentOf = (chapters: number) =>
  Array.from({ length: chapters }, (_, chapter) => [
    `# Chapter ${chapter + 1}`,
    "",
    ...Array.from(
      { length: 4 },
      (_, index) =>
        `${paragraph} (${chapter + 1}.${index + 1}) **bold** and *italic*.\n`,
    ),
  ])
    .flat()
    .join("\n");

type Stats = {
  frames: number;
  mean: number;
  p95: number;
  max: number;
  // frames that took longer than 1.5 frames, and than 50 ms
  dropped: number;
  long: number;
  // how far the view scrolled, in px
  scrolled: number;
};

// the work the page view recorded meanwhile (see src/engine/perf.ts): how
// often and how long in all, in ms
const work = async () => {
  const samples = (await browser.execute(() =>
    window.blankPageViewPerf(true),
  )) as Record<string, number[]>;
  const sum = (values: number[] = []) => ({
    n: values.length,
    total: Math.round(values.reduce((all, value) => all + value, 0)),
    max: Math.round(Math.max(0, ...values)),
  });
  return {
    scroll: sum(samples.scroll),
    render: sum(samples.render),
    paint: sum(samples.paint),
    align: sum(samples.align),
  };
};

// what the page records about its frames while `run` scrolls it
const startRecording = () =>
  browser.execute(() => {
    window.blankPageViewPerf(true);
    const times: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (now: number) => {
      times.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(tick);
    });
    const view = document.getElementById("page-view")!;
    Object.assign(window, {
      scrollFrames: {
        times,
        from: view.scrollTop,
        stop: () => (running = false),
      },
    });
  });

const stopRecording = async () => {
  // what follows the scrolling, e.g. what waits for it to rest
  await browser.pause(300);
  return { ...(await frameStats()), work: await work() };
};

const frameStats = async (): Promise<Stats> => {
  const { times, scrolled } = (await browser.execute(() => {
    const recorded = (
      window as unknown as {
        scrollFrames: { times: number[]; from: number; stop: () => void };
      }
    ).scrollFrames;
    recorded.stop();
    return {
      times: recorded.times,
      scrolled: document.getElementById("page-view")!.scrollTop - recorded.from,
    };
  })) as { times: number[]; scrolled: number };
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = times.reduce((sum, t) => sum + t, 0) / (times.length || 1);
  return {
    frames: times.length,
    mean: +mean.toFixed(1),
    p95: +at(0.95).toFixed(1),
    max: +at(1).toFixed(1),
    dropped: times.filter((t) => t > 25).length,
    long: times.filter((t) => t > 50).length,
    scrolled: Math.round(scrolled),
  };
};

// scrolls down by `step` px on every frame for `count` frames
const scrollByFrames = (step: number, count: number) =>
  browser.executeAsync(
    (step: number, count: number, done: () => void) => {
      const view = document.getElementById("page-view")!;
      let left = count;
      const next = () => {
        view.scrollTop += step;
        if (--left > 0) requestAnimationFrame(next);
        else done();
      };
      requestAnimationFrame(next);
    },
    step,
    count,
  );

// the mouse wheel, as WebKitWebDriver scrolls it: a notch at a time, each
// waiting for the one before
const scrollByWheel = async (notches: number) => {
  const view = await $("#page-view");
  for (let i = 0; i < notches; i++) {
    await browser
      .action("wheel")
      .scroll({ origin: view, deltaY: 120, duration: 100 })
      .perform();
  }
};

// smooth scrolling, which the webview animates as it does for a wheel with
// kinetic scrolling
const scrollSmoothly = (distance: number) =>
  browser.executeAsync((distance: number, done: () => void) => {
    const view = document.getElementById("page-view")!;
    view.scrollBy({ top: distance, behavior: "smooth" });
    setTimeout(done, 2500);
  }, distance);

const toTop = () =>
  browser.executeAsync((done: () => void) => {
    document.getElementById("page-view")!.scrollTop = 0;
    setTimeout(done, 500);
  });

describe("scrolling", () => {
  let dir: string;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-scroll-"));
    fs.mkdirSync(SHOTS, { recursive: true });
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  for (const [name, chapters] of [
    ["20", 40],
    ["100", 200],
  ] as const) {
    it(`measures scrolling about ${name} pages`, async () => {
      const file = path.join(dir, `scroll-${name}.md`);
      fs.writeFileSync(file, documentOf(chapters));
      await restartApp([file]);
      await expect($("#page-view .page-canvas")).toBeExisting();
      // the rest of the document laid out
      await browser.pause(1500);
      const ratio = await browser.execute(() => window.devicePixelRatio);
      for (const view of ["page-ends", "pages"]) {
        if (
          (await browser.execute(
            () => document.getElementById("page-view")!.className,
          )) !== view
        ) {
          await pressMod(Key.Alt, "v");
          await expect($("#page-view")).toHaveElementClass(view);
        }
        await toTop();
        await startRecording();
        await scrollByFrames(40, 240);
        const byFrames = await stopRecording();
        // WebKitWebDriver only turns the first notch of a wheel action into
        // a scroll (about 120 px of 3600), so this measures little
        await toTop();
        await startRecording();
        await scrollByWheel(10);
        const byWheel = await stopRecording();
        await toTop();
        await startRecording();
        await scrollSmoothly(8000);
        const smooth = await stopRecording();
        // the same without the sheets' shadows, which may cost the
        // compositor on every step
        let noShadow: unknown = null;
        if (view === "pages") {
          await browser.execute(() => {
            const style = document.createElement("style");
            style.id = "no-shadow";
            style.textContent = ".page-sheet { box-shadow: none; }";
            document.head.append(style);
          });
          await toTop();
          await startRecording();
          await scrollByFrames(40, 240);
          noShadow = await stopRecording();
          await browser.execute(() =>
            document.getElementById("no-shadow")!.remove(),
          );
        }
        const result = {
          name,
          view,
          ratio,
          byFrames,
          byWheel,
          smooth,
          noShadow,
        };
        console.log(`SCROLL ${JSON.stringify(result)}`);
        fs.appendFileSync(
          path.join(SHOTS, "scroll-measurements.jsonl"),
          JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n",
        );
      }
    });
  }
});
