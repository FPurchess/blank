import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

const checked = (row: string) =>
  $(`#page-setup [data-row="${row}"] [aria-checked="true"]`);

describe("page setup", () => {
  let fixtureDir: string;
  let fixturePath: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    fixturePath = path.join(fixtureDir, "letter.md");
    fs.writeFileSync(fixturePath, "# Letter\n\nText.\n");

    await restartApp([fixturePath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("opens with Mod+Alt+U on the paper of the region", async () => {
    await clickInto("#editor p");
    await pressMod(Key.Alt, "u");

    await expect($("#page-setup")).toBeDisplayed();
    await expect(checked("paper")).toHaveText(
      expect.stringContaining("(your region)"),
    );
    await expect(checked("paper")).toBeFocused();
    await expect(checked("orientation")).toHaveText("Portrait");
    await expect(checked("margins")).toHaveText("Normal");
    // what "Custom…" and "Edit as Text" show stays hidden until then
    await expect($("#page-setup-text")).not.toBeDisplayed();
    await expect($("#page-setup-margins-top")).not.toBeDisplayed();
  });

  it("turns the page with the arrow keys and saves it in the file", async () => {
    await browser.keys(Key.ArrowDown);
    await browser.keys(Key.ArrowRight);
    await expect(checked("orientation")).toHaveText("Landscape");
    await expect($("#page-setup figcaption")).toHaveText(
      expect.stringContaining("landscape"),
    );
    await browser.keys(Key.Enter);

    await expect($("#page-setup")).not.toExist();
    await expect($("#ui-page")).toHaveText(
      expect.stringMatching(/\(landscape\)$/),
    );
    // the page setup stays out of the way of the text
    await expect($("#editor .doc-properties")).not.toExist();

    await pressMod("s");
    await browser.waitUntil(
      () =>
        fs.readFileSync(fixturePath, "utf8") ===
        "---\npage:\n  orientation: landscape\n---\n\n# Letter\n\nText.",
      {
        timeoutMsg: `the file has not been saved, it contains: ${fs.readFileSync(fixturePath, "utf8")}`,
      },
    );
  });

  it("undoes the page setup in one step", async () => {
    await pressMod("z");

    await expect($("#ui-page")).toHaveText(
      expect.stringMatching(/\(portrait\)$/),
    );
  });

  it("takes custom margins", async () => {
    await pressMod(Key.Shift, "z");
    await pressMod(Key.Alt, "u");
    await expect($("#page-setup")).toBeDisplayed();

    await $('#page-setup [data-row="margins"] [data-value="custom"]').click();
    const top = $("#page-setup-margins-top");
    await top.clearValue();
    await top.setValue("3");
    await browser.keys(Key.Enter);

    await expect($("#page-setup")).not.toExist();
    await pressMod(Key.Alt, "u");
    await expect(checked("margins")).toHaveText("Custom…");
    await expect(checked("orientation")).toHaveText("Landscape");
    await browser.keys(Key.Escape);
  });

  it("starts headings of the levels turned on on a new page", async () => {
    await pressMod(Key.Alt, "u");
    const headings = '#page-setup [data-row="newPageBefore"] button';

    // down to the headings (past the custom margins of the test before),
    // then the second one, switched on with Space
    const inHeadings = () =>
      browser.execute(
        () => !!document.activeElement?.closest('[data-row="newPageBefore"]'),
      );
    for (let stop = 0; stop < 10 && !(await inHeadings()); stop++) {
      await browser.keys(Key.ArrowDown);
    }
    await browser.keys(Key.ArrowRight);
    await browser.keys(Key.Space);
    await expect($(`${headings}[aria-pressed="true"]`)).toHaveText("Heading 2");
    await browser.keys(Key.Enter);

    await expect($("#page-setup")).not.toExist();
    await pressMod("s");
    await browser.waitUntil(
      () => fs.readFileSync(fixturePath, "utf8").includes("new-page-before: 2"),
      { timeoutMsg: "the heading levels have not been saved" },
    );
  });

  // +++ is tested in the unit tests: WebKitWebDriver can't type a +
  it("starts new pages with Mod+Enter, and saves them", async () => {
    const breaksPath = path.join(fixtureDir, "breaks.md");
    fs.writeFileSync(breaksPath, "one\n");
    await restartApp([breaksPath]);

    await clickInto("#editor p");
    await type(Key.End);
    await pressMod(Key.Enter);
    await type("two");
    await pressMod(Key.Enter);
    await type("three");
    await expect($$("#editor hr.page-break")).toBeElementsArrayOfSize(2);

    await pressMod("s");
    const expected =
      "one\n\n<!-- pagebreak -->\n\ntwo\n\n<!-- pagebreak -->\n\nthree";
    await browser.waitUntil(
      () => fs.readFileSync(breaksPath, "utf8") === expected,
      {
        timeoutMsg: `the file has not been saved, it contains: ${fs.readFileSync(breaksPath, "utf8")}`,
      },
    );
  });

  it("shows the paper in the bottom bar, which opens the page setup", async () => {
    await expect($("#ui-page")).toHaveText(
      expect.stringMatching(/^(A4|Letter) \(portrait\)$/),
    );

    await $("#ui-page").click();
    await expect($("#page-setup")).toBeDisplayed();
    await browser.keys(Key.Escape);
    await expect($("#page-setup")).not.toExist();
  });

  it("cancels with Escape", async () => {
    await pressMod(Key.Alt, "u");
    await expect($$("#page-setup")).toBeElementsArrayOfSize(1);
    await browser.keys(Key.Escape);

    await expect($("#page-setup")).not.toExist();
  });
});
