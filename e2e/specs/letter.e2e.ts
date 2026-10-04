import { browser, $, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, type } from "../helpers.ts";

// A letter: its return address, address and details stand where a window
// envelope wants them, in frames on its first page, and its text below.

// where the caret at the end of the first field `name` is, on the screen
const caretIn = (name: string) =>
  browser.execute((name: string) => {
    const geometry = (
      window as unknown as {
        blankGeometry: {
          endOf: (element: Element) => number;
          caretBox: (pos: number) => { left: number; top: number } | null;
        };
      }
    ).blankGeometry;
    const element = document.querySelector(
      `#editor [data-blank-field="${name}"] > *`,
    );
    return element && geometry.caretBox(geometry.endOf(element));
  }, name);

const MM = 72 / 25.4;

describe("a letter", () => {
  it("is put in from the block picker, on a page of its own", async () => {
    await clickInto("#editor p");
    await type(Key.End);
    await type(Key.Enter);
    await pressMod(Key.Alt, "b");
    await expect($('#block-picker [data-block="blank/letter"]')).toBeExisting();
    await type(Key.ArrowDown);
    await type(Key.ArrowDown);
    await type(Key.Enter);
    await expect($("#editor section.form")).toBeExisting();
  });

  it("stands where a window envelope wants it", async () => {
    const [recipient, details, subject] = await Promise.all(
      ["recipient", "details", "subject"].map(caretIn),
    );
    if (!recipient || !details || !subject) throw new Error("not on the pages");
    // on the screen's scale: the details at 125mm, the subject at the
    // left margin, 25mm
    const scale = (details.left - subject.left) / (100 * MM);
    expect(scale).toBeGreaterThan(0.5);
    // the address at 20mm, in the window
    expect(recipient.left - subject.left).toBeCloseTo(-5 * MM * scale, -1);
    // the subject below it, from 98.5mm, the address from 62.7mm
    expect(subject.top - recipient.top).toBeGreaterThan(35.8 * MM * scale - 2);
    expect(details.top).toBeLessThan(subject.top);
  });

  it("is filled in with Tab from frame to frame and on to its text", async () => {
    await type("bea · hill road 3");
    await type(Key.Tab);
    await type("ann example");
    await type(Key.Tab);
    await type("monday");
    await type(Key.Tab);
    await type("our meeting");
    await type(Key.Tab);
    await type("dear ann,");
    const text = await browser.execute(() =>
      [...document.querySelectorAll("#editor section.form .field")].map(
        (field) => field.textContent?.toLowerCase(),
      ),
    );
    expect(text).toEqual([
      "bea · hill road 3",
      "ann example",
      "monday",
      "our meeting",
      "dear ann,",
    ]);
  });
});
