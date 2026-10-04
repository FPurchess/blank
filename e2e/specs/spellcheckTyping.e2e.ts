import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

// How fast typing is with spell check on, in a long document whose words
// are almost all flagged: an English text checked as German. It measures
// the frames while a sentence is typed, with spell check off and then on,
// three times on, so a cost that builds up shows. A measurement, so it runs
// only with E2E_PERF=1, and writes to e2e/screenshots/spellcheck-typing.json.

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");
const TYPED = " the quick brown fox jumps over the lazy dog and runs away";

const paragraph = (index: number) =>
  `This is paragraph number ${index} of a long English document, written to see how fast the spell check keeps up while somebody types quickly into it without stopping.`;

// counts the frames from now on, by their gaps
const startFrames = () =>
  browser.execute(() => {
    const w = window as unknown as {
      gaps: number[];
      last: number;
      on: boolean;
    };
    w.gaps = [];
    w.last = performance.now();
    w.on = true;
    const tick = (now: number) => {
      if (!w.on) return;
      w.gaps.push(now - w.last);
      w.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const stopFrames = () =>
  browser.execute(() => {
    const w = window as unknown as { gaps: number[]; on: boolean };
    w.on = false;
    const gaps = w.gaps.slice(1).sort((a, b) => a - b);
    const sum = gaps.reduce((a, b) => a + b, 0);
    return {
      frames: gaps.length,
      mean: sum / gaps.length,
      p95: gaps[Math.floor(gaps.length * 0.95)],
      max: gaps[gaps.length - 1],
      over50: gaps.filter((gap) => gap > 50).length,
      marks: document.querySelectorAll(".page-misspelling").length,
    };
  });

// types the sentence into the fourth paragraph and measures it
const typing = async (label: string) => {
  await clickInto("#editor p", 3);
  await startFrames();
  const start = Date.now();
  await type(TYPED);
  await browser.pause(300);
  return { label, ms: Date.now() - start, ...(await stopFrames()) };
};

(process.env.E2E_PERF ? describe : describe.skip)(
  "typing with spell check",
  () => {
    let dir = "";
    after(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    it("keeps up nearly as without, and doesn't slow down", async function () {
      this.timeout(600_000);
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-spell-"));
      const file = path.join(dir, "long.md");
      fs.writeFileSync(
        file,
        Array.from({ length: 150 }, (_, index) => paragraph(index + 1)).join(
          "\n\n",
        ) + "\n",
      );
      await restartApp([file]);
      await expect($("#page-view .page-canvas")).toBeExisting();
      await pressMod(Key.Alt, "l");
      await type("de");
      await type(Key.Enter);
      await expect($("#ui-language")).toHaveText("DE");
      await browser.pause(2000);

      const off = await typing("off");
      await pressMod(Key.Alt, "s");
      // until the words in view are checked and underlined
      await browser.waitUntil(async () => (await $$marks()) > 50, {
        timeout: 60_000,
        timeoutMsg: "the spell check underlined nothing",
      });
      const on = [
        await typing("on"),
        await typing("on, again"),
        await typing("on, a third time"),
      ];
      const results = { off, on };
      console.log(`MEASURE spellcheck typing: ${JSON.stringify(results)}`);
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, "spellcheck-typing.json"),
        JSON.stringify(results, null, 1),
      );
      // nearly as fast as without, and no slower the third time
      expect(on[0].ms).toBeLessThanOrEqual(off.ms * 1.25);
      expect(on[2].ms).toBeLessThanOrEqual(on[0].ms * 1.25);
      expect(on[2].over50).toBeLessThanOrEqual(off.over50 + 5);
    });
  },
);

const $$marks = () =>
  browser.execute(
    () => document.querySelectorAll("#page-view .page-misspelling").length,
  );
