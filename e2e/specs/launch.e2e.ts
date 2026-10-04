import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, expect } from "@wdio/globals";

import { expectEditorText, restartApp, waitForInk } from "../helpers.ts";

describe("launch", () => {
  it("shows the welcome document", async () => {
    await expectEditorText("#editor h1", "Welcome to Blank");
    // and painted on the pages
    await waitForInk("Welcome to Blank");
  });

  it("loads DejaVu Sans only for a character IBM Plex Sans lacks", async () => {
    await expect($("#page-view .page-canvas")).toBeExisting();
    const loaded = () =>
      browser.execute(() =>
        [...document.fonts]
          .filter((face) => face.status === "loaded")
          .map((face) => face.family.replace(/"/g, "")),
      );
    // nothing at the start needs it
    expect(await loaded()).not.toContain("DejaVu Sans");
    // an arrow Plex lacks, in the UI's fonts, as the bars and dialogs set it,
    // kept until its face is loaded
    await browser.execute(() => {
      const probe = document.createElement("span");
      probe.id = "fallback-probe";
      probe.style.font = "32px var(--font-family)";
      probe.textContent = "⇒";
      document.body.append(probe);
    });
    await browser.waitUntil(
      async () => (await loaded()).includes("DejaVu Sans"),
      {
        timeoutMsg: "DejaVu Sans wasn't loaded for ⇒",
      },
    );
    const width = await browser.execute(() => {
      const probe = document.getElementById("fallback-probe")!;
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
    // drawn, not left out
    expect(width).toBeGreaterThan(10);
  });

  it("shows an untitled document", async () => {
    await expect($("#ui-top")).toHaveText("» Untitled");
  });

  it("counts the words", async () => {
    await expect($("#ui-stats")).toHaveText(/^[1-9][\d,]* words$/);
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

      await expect($("#editor")).toBeExisting();
      await expect($(".boot-error")).not.toBeExisting();
      await expectEditorText("#editor h1", "Welcome to Blank");
    });
  });
});
