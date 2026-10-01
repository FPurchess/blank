import fs from "node:fs";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { restartApp } from "../helpers.ts";

// How long Blank takes to start, from window.blankBootTimes (ms since the
// window opened, see bootMark): the first start of a fresh profile, and
// starts after it, with the load of the machine at each. A measurement, so it
// runs only with E2E_PERF=1, and adds to e2e/screenshots/startup.jsonl.

const SHOTS = path.resolve(import.meta.dirname, "../screenshots");

const bootTimes = async () => {
  await expect($("#page-view .page-canvas")).toBeExisting();
  await browser.waitUntil(
    async () =>
      (await browser.execute(
        () =>
          (
            window as unknown as {
              blankBootTimes: () => Record<string, number>;
            }
          ).blankBootTimes().pages,
      )) !== undefined,
    { timeoutMsg: "the pages weren't painted" },
  );
  return browser.execute(() =>
    (
      window as unknown as { blankBootTimes: () => Record<string, number> }
    ).blankBootTimes(),
  );
};

const load = () => fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0];

(process.env.E2E_PERF ? describe : describe.skip)("start-up", () => {
  it("measures the first start and those after it", async function () {
    this.timeout(300_000);
    const runs: Record<string, unknown>[] = [];
    // the app wdio started for this spec, on a fresh profile
    runs.push({ start: "cold", load: load(), ...(await bootTimes()) });
    for (let index = 0; index < 5; index++) {
      await restartApp();
      runs.push({ start: "warm", load: load(), ...(await bootTimes()) });
    }
    console.log(`MEASURE start-up: ${JSON.stringify(runs)}`);
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.appendFileSync(
      path.join(SHOTS, "startup.jsonl"),
      runs.map((run) => JSON.stringify(run)).join("\n") + "\n",
    );
  });
});
