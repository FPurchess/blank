import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

describe("file", () => {
  let fixtureDir: string;
  let fixturePath: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    fixturePath = path.join(fixtureDir, "fixture.md");
    fs.writeFileSync(fixturePath, "# E2E Fixture\n\nOriginal paragraph.\n");

    // open the file via command-line argument, see readDocumentFromCliArgs
    await restartApp([fixturePath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("opens the file passed via command-line argument", async () => {
    await expect($(".ProseMirror h1")).toHaveText("E2E Fixture");
    await expect($(".ProseMirror p")).toHaveText("Original paragraph.");
    await expect($("#ui-top")).toHaveText(`» ${fixturePath}`);
  });

  it("saves changes to the opened file", async () => {
    await $(".ProseMirror p").click();
    await type(Key.End);
    await type(" Appended");
    await expect($(".ProseMirror p")).toHaveText(
      "Original paragraph. Appended",
    );

    // the path is known, hence saving does not open a dialog
    await pressMod("s");

    await browser.waitUntil(
      () =>
        fs
          .readFileSync(fixturePath, "utf8")
          .includes("Original paragraph. Appended"),
      { timeoutMsg: "the file has not been saved" },
    );
    expect(fs.readFileSync(fixturePath, "utf8")).toBe(
      "# E2E Fixture\n\nOriginal paragraph. Appended",
    );
  });
});
