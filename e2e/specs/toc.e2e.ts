import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import {
  clickInto,
  focusEditor,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

// A table of contents: inserted from the block picker, its page numbers on
// the pages, following a heading as it is renamed, its dialog on Enter, and
// saved as its marker line.

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-toc-")),
  "toc.md",
);

// the page numbers the tables of contents show on the pages
const numbers = () =>
  browser.execute(() =>
    (
      window as unknown as {
        blankGeometry: { tocNumbers: () => (string[] | null)[] };
      }
    ).blankGeometry.tocNumbers(),
  );

const entries = () =>
  browser.execute(() =>
    // in lower case: autocorrect capitalizes a heading's first word
    [...document.querySelectorAll("#editor nav.toc li")].map((entry) =>
      entry.textContent?.toLowerCase(),
    ),
  );

describe("a table of contents", () => {
  before(async () => {
    fs.writeFileSync(
      file,
      [
        "the report.",
        "# one",
        "the first chapter.",
        "<!-- pagebreak -->",
        "# two",
        "the second chapter.",
      ].join("\n\n"),
    );
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("is inserted from the block picker, with the pages of its headings", async () => {
    await clickInto("#editor p");
    await pressMod(Key.Alt, "b");
    await expect($("#block-picker")).toBeDisplayed();
    await expect($("#block-picker .choice")).toBeFocused();
    await type(Key.Enter);
    await expect($("#block-picker")).not.toBeExisting();
    await expect($("#editor nav.toc")).toBeExisting();
    expect(await entries()).toEqual(["one", "two"]);
    await browser.waitUntil(
      async () => JSON.stringify(await numbers()) === '[["1","2"]]',
      { timeoutMsg: `the numbers are ${JSON.stringify(await numbers())}` },
    );
  });

  it("follows a heading as it is renamed", async () => {
    await clickInto("#editor h1", 1);
    await type(" and more");
    await browser.waitUntil(
      async () => JSON.stringify(await entries()) === '["one","two and more"]',
    );
    expect(await numbers()).toEqual([["1", "2"]]);
  });

  it("opens its dialog on Enter once selected", async () => {
    // from the paragraph above it, down onto it
    await clickInto("#editor p");
    await type(Key.ArrowDown);
    await type(Key.Enter);
    await expect($("#toc-dialog")).toBeDisplayed();
    // only the headings 1, then saved
    await $$('#toc-dialog [data-row="depth"] button')[0].click();
    await $("#toc-dialog").$("button=Save").click();
    await expect($("#toc-dialog")).not.toBeExisting();
  });

  it("is saved as one line, and back after a restart", async () => {
    await focusEditor();
    await pressMod("s");
    await browser.waitUntil(
      () =>
        fs
          .readFileSync(file, "utf8")
          .includes('<!-- blank:toc@1 depth="1" title="Contents" -->'),
      { timeoutMsg: `not saved: ${fs.readFileSync(file, "utf8")}` },
    );
    await restartApp([file]);
    await expect($("#editor nav.toc")).toBeExisting();
    expect(await entries()).toEqual(["one", "two and more"]);
  });

  it("is edited and removed from its toolbar once selected", async () => {
    await clickInto("#editor p");
    await type(Key.ArrowDown);
    await $('#block-toolbar [data-id="block-edit"]').click();
    await expect($("#toc-dialog")).toBeDisplayed();
    await type(Key.Escape);
    await expect($("#toc-dialog")).not.toBeExisting();
    await $('#block-toolbar [data-id="block-remove"]').click();
    await expect($("#editor nav.toc")).not.toBeExisting();
  });
});
