import fs from "node:fs";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { appConfigDir, clickInto, Key, pressMod, type } from "../helpers.ts";

// A letter, a form of the user's: its return address, address and
// details stand where a window envelope wants them, in frames on its first
// page, and its text below.

const LETTER = `# A letter on a page of its own, laid out for a window envelope as DIN 5008
# (form B) says: the return address and the address in the window, the
# details beside it, then the subject and the text. See
# docs/guide/blocks.md for what a form definition can say.
version: 1
name: Letter
description: A letter whose address shows in a window envelope (DIN 5008)
newPage: true
flowTop: 98.5mm
fields:
  - name: sender
    kind: text
    style: small
    label: Return address
    placeholder: Your name · Street 1 · 12345 Town
  - name: recipient
    kind: rich
    label: Address
    placeholder: Who it goes to, with their address
  - name: details
    kind: rich
    label: Details
    placeholder: The date, your reference
  - name: subject
    kind: text
    style: h3
    label: Subject
    placeholder: What it is about
  - name: body
    kind: rich
    label: Letter
    placeholder: Dear …
# the address field of DIN 5008 form B starts 20mm from the left, its text
# 5mm in, in line with the letter's; the return address in small print on
# its last line before the address, so the window shows it too
layout:
  - frame: { x: 25mm, y: 58mm, width: 80mm, height: 4.7mm }
    field: sender
  - frame: { x: 25mm, y: 62.7mm, width: 80mm, height: 27.3mm }
    field: recipient
  - frame: { x: 125mm, y: 50mm, width: 75mm, height: 40mm }
    field: details
  - field: subject
  - field: body
`;

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
  before(() => {
    const forms = path.join(appConfigDir(), "forms");
    fs.mkdirSync(forms, { recursive: true });
    fs.writeFileSync(path.join(forms, "letter.yaml"), LETTER);
  });

  it("is put in from the blocks pane, on a page of its own", async () => {
    await clickInto("#editor p");
    await type(Key.End);
    await type(Key.Enter);
    await pressMod(Key.Alt, "b");
    await expect(
      $('#blocks-pane .tile[data-block="user/letter"]'),
    ).toBeExisting();
    await type("letter");
    await type(Key.Enter);
    await expect($("#editor section.form")).toBeExisting();
    await pressMod(Key.Alt, "b");
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane")).not.toBeExisting();
    // into its first field
    await type(Key.Enter);
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
    // the address at 25mm, in the window, in line with the text
    expect(Math.abs(recipient.left - subject.left)).toBeLessThan(2);
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
