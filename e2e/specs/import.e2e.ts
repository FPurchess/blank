import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { browser, $, $$, expect } from "@wdio/globals";

import { Key, restartApp, type } from "../helpers.ts";

// written by pandoc, see scripts/build-docx-fixtures.sh
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/importers/docx/__fixtures__/pandoc.docx",
);

const sha256 = (file: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

describe("Word import", () => {
  let fixtureDir: string;
  let docxPath: string;
  let original: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-import-"));
    docxPath = path.join(fixtureDir, "report.docx");
    fs.copyFileSync(FIXTURE, docxPath);
    original = sha256(docxPath);

    // open the document via command-line argument, see readDocumentFromCliArgs
    await restartApp([docxPath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("imports the Word document as an untitled document", async () => {
    await expect($(".ProseMirror h1")).toHaveText("Fixture");
    await expect($(".ProseMirror h2")).toHaveText("Formatting");
    // seven list items and the footnote at the end
    await expect($$(".ProseMirror li")).toBeElementsArrayOfSize(8);
    await expect($(".ProseMirror pre")).toHaveText(
      'function hello() {\n  return "world";\n}',
    );
    const [chart] = await $$(".ProseMirror .image img");
    await expect(chart).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    await expect($("#ui-top")).toHaveText("» report.docx (imported)");
  });

  it("never writes to the Word document", async () => {
    await $(".ProseMirror h1").click();
    await type(Key.End);
    await type(" edited");
    await expect($(".ProseMirror h1")).toHaveText("Fixture edited");

    expect(sha256(docxPath)).toBe(original);
  });

  it("keeps the imported document after a restart", async () => {
    // Blank stores the document a second after the last change
    await browser.pause(2000);
    await restartApp();

    await expect($(".ProseMirror h1")).toHaveText("Fixture edited");
    await expect($("#ui-top")).toHaveText("» report.docx (imported)");
  });
});
