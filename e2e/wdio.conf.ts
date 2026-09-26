import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { application } from "./app.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const tauriDriverBin = process.env.TAURI_DRIVER_PATH ?? "tauri-driver";
// E2E_PORT moves tauri-driver (and the native driver on the next port), so runs in several
// worktrees can happen at the same time
const tauriDriverPort = Number(process.env.E2E_PORT ?? 4444);
const tauriDriverUrl = `http://127.0.0.1:${tauriDriverPort}`;

// the dictionaries the spell check spec downloads from the local mirror
const catalog = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "src/spellcheck/catalog.json"), "utf8"),
).dictionaries as Record<string, { package: string; version: string }>;
const mirrorCache = path.join(dirname, ".cache", "dictionaries");
const MIRRORED = "en-GB";
// served with the wrong content, which the app must reject
const DAMAGED = "pt-PT";

// keep track of the `tauri-driver` child process and the app profile of the current session
let tauriDriver: ChildProcess | undefined;
let mirror: http.Server | undefined;
let expectingExit = false;
let profileDir: string | undefined;

export const config: WebdriverIO.Config = {
  hostname: "127.0.0.1",
  port: tauriDriverPort,
  specs: ["./specs/**/*.e2e.ts"],
  // tauri-driver drives a single app instance, so specs must run serially
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      // `tauri:options` is understood by tauri-driver, not by the WebdriverIO types
      "tauri:options": { application },
    } as unknown as WebdriverIO.Capabilities,
  ],
  logLevel: "warn",
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  // a retried session request could spawn a second app instance
  connectionRetryCount: 0,

  // ensure the app is built, since the webdriver sessions expect the binary to exist
  onPrepare: async () => {
    await cacheMirroredDictionary();

    if (!process.env.E2E_SKIP_BUILD) {
      const build = spawnSync(
        "bun",
        ["run", "tauri", "build", "--debug", "--no-bundle"],
        { cwd: repoRoot, stdio: "inherit" },
      );
      if (build.status !== 0) {
        throw new Error(`building the app failed with status ${build.status}`);
      }
    }

    if (!fs.existsSync(application)) {
      throw new Error(
        `app not found at ${application} - build it (unset E2E_SKIP_BUILD) or point E2E_APP_PATH at an existing build`,
      );
    }
  },

  // start a fresh `tauri-driver` for every spec file. The app inherits its environment, so
  // pointing the XDG dirs to a temporary profile isolates the app's storage (document, theme)
  // and config (keymap) from the developer's real ones and from other spec files.
  beforeSession: async () => {
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-"));
    expectingExit = false;

    const mirrorUrl = await startMirror();
    tauriDriver = spawn(
      tauriDriverBin,
      [
        ...["--port", String(tauriDriverPort)],
        ...["--native-port", String(tauriDriverPort + 1)],
      ],
      {
        stdio: [null, process.stdout, process.stderr],
        env: {
          ...process.env,
          // debug builds download dictionaries from here instead of the CDNs
          BLANK_DICTIONARY_MIRROR: mirrorUrl,
          XDG_DATA_HOME: path.join(profileDir, "data"),
          XDG_CONFIG_HOME: path.join(profileDir, "config"),
          XDG_CACHE_HOME: path.join(profileDir, "cache"),
        },
      },
    );

    tauriDriver.on("error", (error: NodeJS.ErrnoException) => {
      console.error("tauri-driver error:", error);
      if (error.code === "ENOENT") {
        console.error(
          "tauri-driver not found - install it via `cargo install tauri-driver --locked`",
        );
      }
      process.exit(1);
    });
    tauriDriver.on("exit", (code) => {
      if (!expectingExit) {
        console.error("tauri-driver exited with code:", code);
        process.exit(1);
      }
    });

    await waitForTauriDriver();
  },

  // the session may start before the app has booted
  before: async () => {
    const { waitForAppReady } = await import("./helpers.ts");
    await waitForAppReady();
  },

  // take a screenshot of failed tests to ease debugging (uploaded as artifact in CI)
  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    try {
      const dir = path.join(dirname, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      const name = `${test.parent} ${test.title}`.replace(/[^\w-]+/g, "_");
      await browser.saveScreenshot(path.join(dir, `${name}.png`));
    } catch (error) {
      console.warn("failed to take screenshot:", error);
    }
  },

  // awaited so the driver (and its port) is gone before the next spec file starts a new one.
  // note that afterSession might not run if the session fails to start, so we also clean up on shutdown
  afterSession: async () => {
    await closeTauriDriver();
    await new Promise((resolve) =>
      mirror ? mirror.close(resolve) : resolve(null),
    );
    mirror = undefined;
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    profileDir = undefined;
  },
};

/**
 * downloads the dictionary the spell check spec installs from the local mirror,
 * once: the app itself never talks to the CDN in the tests
 */
async function cacheMirroredDictionary() {
  const { package: pkg, version } = catalog[MIRRORED];
  const dir = path.join(mirrorCache, `${pkg}@${version}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of ["index.aff", "index.dic"]) {
    const target = path.join(dir, file);
    if (fs.existsSync(target)) continue;
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(
          `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${file}`,
        );
        if (!response.ok) throw new Error(`${response.status}`);
        fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
        break;
      } catch (error) {
        if (attempt === 3)
          throw new Error(`failed to download ${pkg}/${file}: ${error}`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
}

/**
 * serves the cached dictionary like the CDN does, and a damaged one
 * @returns the URL of the mirror
 */
async function startMirror() {
  const mirrored = catalog[MIRRORED];
  const damaged = catalog[DAMAGED];
  mirror = http.createServer((request, response) => {
    const [, name, file] =
      /^\/([^/]+)\/(index\.(?:aff|dic))$/.exec(request.url ?? "") ?? [];
    if (name === `${mirrored.package}@${mirrored.version}`) {
      response.end(fs.readFileSync(path.join(mirrorCache, name, file)));
    } else if (name === `${damaged.package}@${damaged.version}`) {
      response.end("damaged");
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((resolve) => mirror!.listen(0, "127.0.0.1", resolve));
  const { port } = mirror.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

/**
 * waits until tauri-driver (and the native WebKitWebDriver behind it) accepts connections
 */
async function waitForTauriDriver(timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${tauriDriverUrl}/status`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tauri-driver did not become ready within ${timeout}ms`);
}

/**
 * stops tauri-driver, which in turn stops the native WebKitWebDriver
 */
async function closeTauriDriver() {
  expectingExit = true;
  const driver = tauriDriver;
  tauriDriver = undefined;
  if (!driver || driver.exitCode !== null || driver.signalCode !== null) return;

  const exited = new Promise((resolve) => driver.once("exit", resolve));
  driver.kill("SIGTERM");
  const timer = setTimeout(() => driver.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}

function onShutdown(fn: () => void) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
}

// ensure tauri-driver is closed when the test process exits
onShutdown(() => {
  expectingExit = true;
  tauriDriver?.kill();
});
