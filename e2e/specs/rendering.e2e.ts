import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { restartApp, textBox } from "../helpers.ts";

// How the painted text looks next to the webview's own: a line of the page
// view, and the same words set by the webview in the same font and size
// right below it. The screenshots go to e2e/screenshots/ to be looked at, at
// the device pixel ratio the run has (GDK_SCALE=2 for 2×).

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");
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
    await browser.executeAsync((done: () => void) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
    await browser.saveScreenshot(path.join(SHOTS, `render-${ratio}x.png`));
    fs.writeFileSync(
      path.join(SHOTS, `render-${ratio}x.json`),
      JSON.stringify({ ratio, box }),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
