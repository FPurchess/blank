import fs from "node:fs";

import { browser } from "@wdio/globals";

import { appLogFile, waitForAppReady } from "../helpers.ts";

// Blank's log: a file in the system's log folder (src-tauri/src/logging.rs),
// with a line for each start and what the webview logs (src/log.ts).

const logText = () =>
  fs.existsSync(appLogFile()) ? fs.readFileSync(appLogFile(), "utf8") : "";

describe("the log", () => {
  before(() => waitForAppReady());

  it("says which Blank started where, and the page layout's state", async () => {
    await browser.waitUntil(() => /the page layout is ready/.test(logText()), {
      timeoutMsg: `no engine line in the log: ${logText()}`,
    });
    expect(logText()).toMatch(/Blank \d+\.\d+\.\d+ started on linux /);
  });

  it("takes what goes wrong in the webview", async () => {
    await browser.execute(() =>
      console.error("an e2e error", new Error("on purpose")),
    );
    await browser.execute(() =>
      setTimeout(() => {
        throw new Error("nobody caught it");
      }),
    );

    // WebKit may hide the error of a script the driver ran ("Script
    // error."), so only that it was logged is certain
    await browser.waitUntil(
      () =>
        /an e2e error Error: on purpose/.test(logText()) &&
        /uncaught error/.test(logText()),
      { timeoutMsg: `the errors aren't in the log: ${logText()}` },
    );
    expect(logText()).toMatch(/\[ERROR\]/);
  });
});
