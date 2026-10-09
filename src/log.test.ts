import {
  error as writeError,
  info as writeInfo,
  warn as writeWarn,
} from "@tauri-apps/plugin-log";
import {
  afterEach,
  beforeEach,
  describe as group,
  expect,
  it,
  vi,
} from "vitest";

import {
  bootLog,
  describe,
  lineOf,
  logError,
  logInfo,
  logWarning,
  MAX_LINE,
  MAX_LINES,
  RATE_WINDOW,
} from "./log";

let dispose = () => {};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(writeError).mockResolvedValue(undefined);
  vi.mocked(writeWarn).mockResolvedValue(undefined);
  vi.mocked(writeInfo).mockResolvedValue(undefined);
});

afterEach(() => {
  dispose();
  vi.useRealTimers();
});

group("describe", () => {
  it("puts an error with its stack and cause in words", () => {
    const cause = new TypeError("no room");
    cause.stack = "write@fs.js:9:1";
    const error = Object.assign(new Error("disk full"), { cause });
    error.stack = "save@app.js:1:2\nrun@app.js:3:4";

    expect(describe(error)).toBe(
      "Error: disk full\nsave@app.js:1:2\nrun@app.js:3:4\n" +
        "caused by TypeError: no room\nwrite@fs.js:9:1",
    );
  });

  it("keeps a stack that starts with the message once", () => {
    const error = new Error("gone");
    error.stack = "Error: gone\n    at main.ts:1";
    expect(describe(error)).toBe("Error: gone\n    at main.ts:1");
  });

  it("writes other values as JSON where it can", () => {
    expect(describe("plain")).toBe("plain");
    expect(describe({ code: 7 })).toBe('{"code":7}');
    expect(describe(undefined)).toBe("undefined");
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(describe(loop)).toBe("[object Object]");
  });

  it("follows causes only so far, and never throws", () => {
    const circle = new Error("again");
    circle.stack = "";
    Object.assign(circle, { cause: circle });
    const described = describe(circle);
    expect(described.split("caused by")).toHaveLength(7);
    expect(described.endsWith("caused by more")).toBe(true);

    const bare = Object.create(null) as { self?: unknown };
    bare.self = bare;
    expect(describe(bare)).toBe("[object Object]");
  });

  it("cuts a line at its longest", () => {
    const line = lineOf(["x".repeat(MAX_LINE + 10)]);
    expect(line).toBe(`${"x".repeat(MAX_LINE)}… (10 more characters)`);
  });
});

group("the log", () => {
  it("takes what the console says of errors and warnings", () => {
    dispose = bootLog();

    logError("failed to save the file", new Error("disk full"));
    logWarning("storage is unavailable");
    console.error("the layout engine failed", { page: 3 });

    expect(writeError).toHaveBeenCalledWith(
      expect.stringMatching(/^failed to save the file Error: disk full/),
    );
    expect(writeWarn).toHaveBeenCalledWith("storage is unavailable");
    expect(writeError).toHaveBeenCalledWith(
      'the layout engine failed {"page":3}',
    );
  });

  it("still shows it in the console", () => {
    const shown = vi.mocked(console.error);
    dispose = bootLog();

    logError("failed to export", "no room");

    expect(shown).toHaveBeenCalledWith("failed to export", "no room");
  });

  it("writes some lines to the log only", () => {
    const shown = vi.mocked(console.error);
    dispose = bootLog();

    logInfo("the page layout is ready");

    expect(writeInfo).toHaveBeenCalledWith("the page layout is ready");
    expect(shown).not.toHaveBeenCalled();
  });

  it("takes uncaught errors and promises nobody caught", () => {
    dispose = bootLog();

    window.dispatchEvent(
      new ErrorEvent("error", { error: new RangeError("out of range") }),
    );
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = "no font";
    window.dispatchEvent(rejection);

    expect(writeError).toHaveBeenCalledWith(
      expect.stringMatching(/^uncaught error RangeError: out of range/),
    );
    expect(writeError).toHaveBeenCalledWith(
      "a promise failed and nothing caught it no font",
    );
  });

  it("leaves a burst's lines out once there were enough, and counts them", () => {
    vi.useFakeTimers();
    dispose = bootLog();

    for (let line = 0; line < MAX_LINES + 5; line++) logError(`loop ${line}`);
    expect(writeError).toHaveBeenCalledTimes(MAX_LINES);

    vi.advanceTimersByTime(RATE_WINDOW + 1);
    logError("later");
    expect(writeWarn).toHaveBeenCalledWith(
      "5 more lines were left out of the log",
    );
    expect(writeError).toHaveBeenLastCalledWith("later");
  });

  it("says how many lines a burst left out once it's over", () => {
    vi.useFakeTimers();
    dispose = bootLog();

    for (let line = 0; line < MAX_LINES + 3; line++) logError(`loop ${line}`);
    vi.advanceTimersByTime(RATE_WINDOW);

    expect(writeWarn).toHaveBeenCalledWith(
      "3 more lines were left out of the log",
    );
  });

  it("doesn't log what writing to the log logs", () => {
    dispose = bootLog();
    // Tauri's IPC logs synchronously when it fails
    vi.mocked(writeError).mockImplementation(async () => {
      console.error("IPC failed");
    });

    logError("failed to save");

    expect(writeError).toHaveBeenCalledTimes(1);
  });

  it("logs only the context when there is no error", () => {
    const shown = vi.mocked(console.error);
    dispose = bootLog();

    logError("failed to open a link");

    expect(shown).toHaveBeenCalledWith("failed to open a link");
    expect(writeError).toHaveBeenCalledWith("failed to open a link");
  });

  it("never breaks what logged when the log can't be written", () => {
    vi.mocked(writeError).mockRejectedValue(new Error("no plugin"));
    vi.mocked(writeWarn).mockImplementation(() => {
      throw new Error("no IPC");
    });
    dispose = bootLog();

    expect(() => logError("failed")).not.toThrow();
    expect(() => logWarning("odd")).not.toThrow();
  });

  it("gives the console back its own once disposed", () => {
    const own = console.error;
    dispose = bootLog();
    expect(console.error).not.toBe(own);

    dispose();
    dispose = () => {};

    expect(console.error).toBe(own);
    console.error("after");
    expect(writeError).not.toHaveBeenCalled();
  });
});
