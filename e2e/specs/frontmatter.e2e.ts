import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  clickInto,
  expectEditorText,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

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

  it("keeps the YAML out of the text", async () => {
    await expectEditorText("#editor h1", "Chapter");
    await expect($("#editor hr")).not.toExist();
    await expect(
      browser.execute(() => document.querySelector("#editor")?.textContent),
    ).resolves.not.toContain("Lighthouse");
  });

  it("saves the frontmatter unchanged", async () => {
    await clickInto("#editor p");
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
    // the document is written to storage at most 1000ms after a change (see
    // src/storage.ts), later on a busy machine: wait until it's there
    // (localforage's IndexedDB "Blank", store "keyvaluepairs", under the
    // active tab of the session), with the
    // frontmatter and the text typed in the test before
    await browser.waitUntil(
      async () => {
        const stored = await browser.executeAsync(
          (done: (stored: string) => void) => {
            const open = indexedDB.open("Blank");
            open.onerror = () => done("");
            open.onsuccess = () => {
              // the active tab's document, stored under its id
              const store = open.result
                .transaction("keyvaluepairs")
                .objectStore("keyvaluepairs");
              const session = store.get("session");
              session.onerror = () => done("");
              session.onsuccess = () => {
                const active = (session.result as { active?: string } | null)
                  ?.active;
                if (!active) return done("");
                const get = store.get(`tab:${active}`);
                get.onerror = () => done("");
                get.onsuccess = () => done(JSON.stringify(get.result ?? null));
              };
            };
          },
        );
        return stored.includes("The Lighthouse") && stored.includes("more");
      },
      { timeoutMsg: "the edited document wasn't stored" },
    );
    await restartApp();

    // saved again, over a file changed meanwhile, it writes the frontmatter
    // it came back with (typing would let autocorrect change the text)
    fs.writeFileSync(fixturePath, "changed");
    await clickInto("#editor p");
    await pressMod("s");
    const expected = `${FRONTMATTER}\n\n# Chapter\n\nText. more`;
    await browser.waitUntil(
      () => fs.readFileSync(fixturePath, "utf8") === expected,
      {
        timeoutMsg: `the file has not been saved, it contains: ${fs.readFileSync(fixturePath, "utf8")}`,
      },
    );
  });
});
