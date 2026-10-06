import { config as base } from "./wdio.conf.ts";

// captures the screenshots of the docs instead of running the tests (see
// e2e/shots/shots.ts for where they go)
// set before the workers start the app, which read it in beforeSession
process.env.E2E_STEADY_CARET = "1";

export const config: WebdriverIO.Config = {
  ...base,
  specs: ["./shots/*.shots.ts"],
  mochaOpts: { ...base.mochaOpts, timeout: 300000 },
  afterTest: undefined,
};
