import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, expect } from "@wdio/globals";

import { restartApp } from "../helpers.ts";

describe("launch", () => {
  it("shows the welcome document", async () => {
    await expect($(".ProseMirror h1")).toHaveText("Welcome to Blank");
  });

  it("shows an untitled document", async () => {
    await expect($("#ui-top")).toHaveText("» Untitled");
  });

  it("counts words and chars", async () => {
    await expect($("#ui-stats")).toHaveText(/^[1-9]\d* words \d+ chars$/);
  });

  it("uses the default theme", async () => {
    await expect($("body")).toHaveAttribute("data-theme", "light");
  });

  describe("with more than one file", () => {
    let fixtureDir: string;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    });

    after(() => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    it("still starts the editor", async () => {
      const fileA = path.join(fixtureDir, "a.md");
      const fileB = path.join(fixtureDir, "b.md");
      fs.writeFileSync(fileA, "# File A\n");
      fs.writeFileSync(fileB, "# File B\n");

      // the CLI plugin rejects a second path, see readDocumentFromCliArgs
      await restartApp([fileA, fileB]);

      await expect($(".ProseMirror")).toBeExisting();
      await expect($(".boot-error")).not.toBeExisting();
      await expect($(".ProseMirror h1")).toHaveText("Welcome to Blank");
    });
  });
});
