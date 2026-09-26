import { config as base } from "./wdio.conf.ts";

// captures the screenshots of the docs (docs/public/screenshots) instead of running the tests
export const config: WebdriverIO.Config = {
  ...base,
  specs: ["./shots/*.shots.ts"],
  mochaOpts: { ...base.mochaOpts, timeout: 300000 },
  afterTest: undefined,
};
