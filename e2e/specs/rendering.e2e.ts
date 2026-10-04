import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  boxOf,
  clickText,
  contrast,
  doubleClickAt,
  inkPrint,
  lineBox,
  Key,
  luminance,
  paintedInk,
  pressMod,
  restartApp,
  screenStats,
  textBox,
  type,
  waitForInk,
  waitForRepaint,
  nextFrames,
} from "../helpers.ts";

// How the painted text looks next to the webview's own: a line of the page
// view, and the same words set by the webview in the same font and size
// right below it. The screenshots go to e2e/screenshots/ to be looked at, at
// the device pixel ratio the run has (GDK_SCALE=2 for 2×).

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");

// a long document: a word on the first page to type at, and one far down
const LONG_DOCUMENT = [
  "# Painted",
  "",
  "alpha is where it starts.",
  "",
  ...Array.from(
    { length: 400 },
    (_, index) =>
      `${index === 380 ? "farmarker " : ""}Writing is thinking on paper, and every line of this paragraph ends where the layout says it ends, on the screen and in the PDF alike (${index + 1}).\n`,
  ),
].join("\n");

// switches the theme with the keyboard until it is `theme`
const themeTo = async (theme: string) => {
  for (let step = 0; step < 6; step++) {
    const now = await browser.execute(() => document.body.dataset.theme);
    if (now === theme) return;
    await pressMod(Key.Alt, "t");
  }
  throw new Error(`the theme never became ${theme}`);
};

const LINE = "Hamburgefonstiv quick brown fox, 0123 — Bold and italic.";

describe("rendering", () => {
  it("paints text as smooth as the webview's own", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-render-"));
    const file = path.join(dir, "render.md");
    fs.writeFileSync(
      file,
      `# Heading medium\n\n${LINE.replace("Bold", "**Bold**").replace("italic", "*italic*")}\n`,
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    const box = await textBox("Hamburgefonstiv");
    // the painted width of the words, which sets the webview's font size
    const end = await textBox("Hamburgefonstiv quick brown fox,", 32);
    const painted = end.left - box.left;
    const ratio = await browser.execute((painted: number) => {
      // the webview's own text, in the page view's font and size
      const line = document.createElement("div");
      line.textContent = "Hamburgefonstiv quick brown fox, 0123 — ";
      const bold = document.createElement("b");
      bold.textContent = "Bold";
      const italic = document.createElement("i");
      italic.textContent = "italic";
      line.append(bold, " and ", italic, ".");
      Object.assign(line.style, {
        position: "fixed",
        zIndex: "30",
        fontFamily: '"IBM Plex Sans", "DejaVu Sans"',
        fontSize: "16px",
        whiteSpace: "nowrap",
        color: getComputedStyle(document.body).color,
      });
      line.id = "webview-text";
      document.body.append(line);
      // as large as the painted words
      const words = document.createRange();
      words.setStart(line.firstChild!, 0);
      words.setEnd(line.firstChild!, 32);
      const width = words.getBoundingClientRect().width;
      line.style.fontSize = `${(16 * painted) / width}px`;
      return window.devicePixelRatio;
    }, painted);
    await browser.execute(
      (left: number, top: number) => {
        const line = document.getElementById("webview-text")!;
        line.style.left = `${left}px`;
        line.style.top = `${top}px`;
      },
      box.left,
      box.bottom + 12,
    );
    await nextFrames();
    await browser.saveScreenshot(path.join(SHOTS, `render-${ratio}x.png`));
    fs.writeFileSync(
      path.join(SHOTS, `render-${ratio}x.json`),
      JSON.stringify({ ratio, box }),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("paints what is typed, in both views and themes, far down too", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-ink-"));
    const file = path.join(dir, "ink.md");
    fs.writeFileSync(file, LONG_DOCUMENT);
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();

    // the new word has ink, in the theme's text colour
    // within the sentence, where autocorrect leaves it lowercase; the line
    // is painted again, and not only laid out
    const line = await lineBox("is where");
    // painted once already, so only the edit changes it; a short line takes
    // a little of the page's width
    await waitForInk(line, {}, 0.02);
    const before = await inkPrint(line);
    await clickText("is where");
    await type("inkcheck ");
    await waitForRepaint(line, before);
    const light = await waitForInk("inkcheck");
    expect(luminance(light.ink!)).toBeLessThan(0.2);
    // and the room beside the text, on the same line, has none
    const word = await boxOf("inkcheck");
    const frame = await $('.page-frame[data-page="1"]').getLocation("x");
    const beside = await paintedInk({
      left: frame + 1,
      right: frame + 8,
      top: word.top,
      bottom: word.bottom,
    });
    expect(beside.share).toBe(0);

    // in the other view too
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await waitForInk("inkcheck");
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");

    // light on dark
    await themeTo("dark");
    await browser.waitUntil(
      async () => luminance((await waitForInk("inkcheck")).ink!) > 0.5,
      { timeoutMsg: "the text isn't painted light in the dark theme" },
    );

    // a selected word stands out from the page, and reads over the
    // selection, in every theme; the shots are for looking at
    const selected = await boxOf("inkcheck");
    await doubleClickAt(
      selected.left + 4,
      (selected.top + selected.bottom) / 2,
    );
    for (const theme of ["light", "dark", "black", "red", "green", "blue"]) {
      await themeTo(theme);
      await nextFrames();
      const paper = (
        await screenStats({
          left: frame + 1,
          right: frame + 8,
          top: selected.top,
          bottom: selected.bottom,
        })
      ).background;
      const word = await screenStats(selected);
      expect([theme, contrast(word.background, paper) >= 3]).toEqual([
        theme,
        true,
      ]);
      expect([theme, contrast(word.farthest, word.background) >= 4.5]).toEqual([
        theme,
        true,
      ]);
      await browser.saveScreenshot(path.join(SHOTS, `selection-${theme}.png`));
    }
    await themeTo("light");

    // far down, a page painted when it comes into view
    await waitForInk("farmarker");
    // an edit there paints that page again
    const far = await lineBox("farmarker");
    const farBefore = await inkPrint(far);
    await clickText("farmarker", { offset: 9 });
    await type("qz");
    await waitForRepaint(far, farBefore);
    await waitForInk("farmarkerqz", { offset: 9, length: 2 });
    // and back on the first page, it shows what it showed before: painted
    // again or drawn from its bitmap, in the same ink
    const again = await waitForInk("inkcheck", {}, light.share * 0.8);
    expect(Math.abs(again.share - light.share)).toBeLessThan(0.01);
    expect(luminance(again.ink!)).toBeLessThan(0.2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
