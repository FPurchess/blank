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

// A table of contents: inserted from the blocks pane, its page numbers on
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

  it("is inserted from the blocks pane, with the pages of its headings", async () => {
    await clickInto("#editor p");
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane")).toBeDisplayed();
    await expect($("#blocks-pane input[type=search]")).toBeFocused();
    await type(Key.ArrowDown);
    await expect($('#blocks-pane .tile[data-block="toc"]')).toBeFocused();
    await type(Key.Enter);
    await expect($("#editor nav.toc")).toBeExisting();
    await expect($("#ui-announcement")).toHaveText(
      "Table of contents inserted",
    );
    // the pane stays open until its shortcut closes it
    await expect($("#blocks-pane")).toBeDisplayed();
    await pressMod(Key.Alt, "b");
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane")).not.toBeExisting();
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

  it("opens its settings on Enter once selected, which apply at once", async () => {
    // from the paragraph above it, down onto it
    await clickInto("#editor p");
    await type(Key.ArrowDown);
    await type(Key.Enter);
    await expect($("#toc-popover")).toBeDisplayed();
    await expect($("#toc-popover-depth")).toBeFocused();
    // only the headings 1: WebKitWebDriver's selectByIndex fires no change
    // event, so the choice is made as the select makes it
    await browser.execute(() => {
      const select =
        document.querySelector<HTMLSelectElement>("#toc-popover-depth")!;
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await type(Key.Escape);
    await expect($("#toc-popover")).not.toBeExisting();
  });

  it("is saved as one line, and back after a restart", async () => {
    await focusEditor();
    await pressMod("s");
    const saved = () =>
      fs
        .readFileSync(file, "utf8")
        .includes('<!-- blank:toc@1 depth="1" title="Contents" -->');
    await browser.waitUntil(saved).catch(async () => {
      // what the file and the editor hold then, not when the wait began
      const blocks = await browser.execute(() =>
        window.blankGeometry.topBlocks().map((block) => block.type),
      );
      throw new Error(
        `not saved: ${fs.readFileSync(file, "utf8")}\nblocks: ${blocks.join(", ")}`,
      );
    });
    await restartApp([file]);
    await expect($("#editor nav.toc")).toBeExisting();
    expect(await entries()).toEqual(["one", "two and more"]);
  });

  it("is edited and removed from its toolbar once selected", async () => {
    await clickInto("#editor p");
    await type(Key.ArrowDown);
    await $('#block-toolbar [data-id="block-edit"]').click();
    await expect($("#toc-popover")).toBeDisplayed();
    await type(Key.Escape);
    await expect($("#toc-popover")).not.toBeExisting();
    await $('#block-toolbar [data-id="block-remove"]').click();
    await expect($("#editor nav.toc")).not.toBeExisting();
    await expect($("#ui-announcement")).toHaveText("Table of contents removed");
  });
});
