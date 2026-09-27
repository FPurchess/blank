import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

// the frontmatter of Obsidian, pandoc and static site generators, which Blank
// keeps exactly as written
const FRONTMATTER = [
  "---",
  "# a comment",
  "title: The Lighthouse",
  "author: [Ada, Grace]",
  "tags:   [sea, light]",
  "---",
].join("\n");

describe("frontmatter", () => {
  let fixtureDir: string;
  let fixturePath: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    fixturePath = path.join(fixtureDir, "note.md");
    fs.writeFileSync(fixturePath, `${FRONTMATTER}\n\n# Chapter\n\nText.\n`);

    await restartApp([fixturePath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("shows the properties above the text instead of the YAML", async () => {
    await expect($(".ProseMirror .doc-properties")).toHaveText(
      "The Lighthouse · by Ada, Grace · tags",
    );
    await expect($(".ProseMirror h1")).toHaveText("Chapter");
    await expect($(".ProseMirror hr")).not.toExist();
  });

  it("saves the frontmatter unchanged", async () => {
    await $(".ProseMirror p").click();
    await type(Key.End);
    await type(" more");
    await pressMod("s");

    const expected = `${FRONTMATTER}\n\n# Chapter\n\nText. more`;
    await browser.waitUntil(
      () => fs.readFileSync(fixturePath, "utf8") === expected,
      {
        timeoutMsg: `the file has not been saved, it contains: ${fs.readFileSync(fixturePath, "utf8")}`,
      },
    );
  });

  it("restores the frontmatter with the document", async () => {
    // the document is written to storage at most 1000ms after a change, see src/storage.ts
    await browser.pause(2000);
    await restartApp();

    await expect($(".ProseMirror .doc-properties")).toHaveText(
      "The Lighthouse · by Ada, Grace · tags",
    );
  });
});
