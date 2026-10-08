import {
  error as writeError,
  info as writeInfo,
  warn as writeWarn,
} from "@tauri-apps/plugin-log";
import { onScopeDispose } from "vue";

import { bootScope, listenOnWindow } from "./scope";

// Blank's log: what goes wrong, in a file of the system's log folder that
// stays on this computer (src-tauri/src/logging.rs writes it). Everything
// the webview says with console.error and console.warn goes there, with
// uncaught errors and promises nobody caught, so `logError` and
// `logWarning` are console.error and console.warn with a context first.
// What never goes in: the document's text, or anything else the user wrote
// or typed (see .claude/rules/logging.md).

// how long a line of the log may be: an error with its stack, not a
// document someone passed by mistake
export const MAX_LINE = 4000;
// how many lines a burst may write, per RATE_WINDOW ms, before the rest is
// left out and counted: an error in a loop must not fill the log
export const MAX_LINES = 50;
export const RATE_WINDOW = 10_000;

/**
 * logError logs what went wrong, e.g. `logError("failed to save the file",
 * error)`: the context says what Blank was doing, the error why it failed
 */
export const logError = (context: string, problem?: unknown) =>
  problem === undefined
    ? console.error(context)
    : console.error(context, problem);

/**
 * logWarning logs what didn't go as it should, though Blank goes on
 */
export const logWarning = (context: string, problem?: unknown) =>
  problem === undefined
    ? console.warn(context)
    : console.warn(context, problem);

/**
 * logInfo writes a line of what happened to the log only, not the console:
 * for the few lines that tell what Blank was doing, like the engine's state
 * once it started
 */
export const logInfo = (message: string) => write(writeInfo, message);

// how many causes of an error are followed, which may run in a circle
const MAX_CAUSES = 5;

/**
 * describe puts what was logged in words: an error with its name, message,
 * stack and causes, other values as JSON where they can be, and never
 * throws
 */
export const describe = (value: unknown, causes = MAX_CAUSES): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    const stack = value.stack?.trim();
    const head = `${value.name}: ${value.message}`;
    // WebKit's stack holds only the frames, V8's starts with the message
    const lines =
      stack && !stack.startsWith(head) ? `${head}\n${stack}` : stack || head;
    // Error.cause is ES2022, after the lib the app is typed for
    const { cause } = value as { cause?: unknown };
    if (cause === undefined) return lines;
    return causes > 0
      ? `${lines}\ncaused by ${describe(cause, causes - 1)}`
      : `${lines}\ncaused by more`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // a circle, or an object without toString
    return Object.prototype.toString.call(value);
  }
};

/**
 * lineOf joins what was logged into one line of the log, cut at MAX_LINE
 */
export const lineOf = (values: readonly unknown[]) => {
  const line = values.map(describe).join(" ");
  return line.length > MAX_LINE
    ? `${line.slice(0, MAX_LINE)}… (${line.length - MAX_LINE} more characters)`
    : line;
};

// the lines of the current burst, those left out of it, and the timer
// that says how many were left out once the burst is over
let burst = { start: 0, lines: 0, dropped: 0 };
let tally: ReturnType<typeof setTimeout> | undefined;
// while a line is handed to the plugin: Tauri's IPC may log synchronously
// when it fails, which would log again. What it logs later, asynchronously,
// the burst limit stops.
let writing = false;

/**
 * write hands a line to the log, unless the burst it's in wrote enough
 */
const write = (to: (message: string) => Promise<void>, message: string) => {
  if (writing) return;
  const now = Date.now();
  if (now - burst.start > RATE_WINDOW) {
    tallyDropped();
    burst = { start: now, lines: 0, dropped: 0 };
  }
  if (burst.lines >= MAX_LINES) {
    burst.dropped += 1;
    tally ??= setTimeout(tallyDropped, RATE_WINDOW);
    return;
  }
  burst.lines += 1;
  send(to, message);
};

/**
 * tallyDropped says how many lines the burst left out, if any
 */
const tallyDropped = () => {
  clearTimeout(tally);
  tally = undefined;
  if (!burst.dropped) return;
  send(writeWarn, `${burst.dropped} more lines were left out of the log`);
  burst.dropped = 0;
};

/**
 * send writes a line through the log plugin, never throwing: a log that
 * can't be written must not break what logged
 */
const send = (to: (message: string) => Promise<void>, message: string) => {
  writing = true;
  try {
    // the plugin's calls are async and fail by rejecting
    void Promise.resolve(to(message)).catch(() => {});
  } catch {
    // nothing that logs may break because the log did
  } finally {
    writing = false;
  }
};

/**
 * logged sends what a console call logged to the log, never throwing
 */
const logged =
  (to: (message: string) => Promise<void>) => (values: unknown[]) => {
    try {
      write(to, lineOf(values));
    } catch {
      // as in send
    }
  };

/**
 * bootLog sends console.error and console.warn, uncaught errors and
 * promises nobody caught to the log, as well as to the console
 * @returns dispose, which gives the console back its own
 */
export const bootLog = () =>
  bootScope(() => {
    burst = { start: 0, lines: 0, dropped: 0 };
    const { error, warn } = console;
    const toError = logged(writeError);
    const toWarning = logged(writeWarn);
    console.error = (...values: unknown[]) => {
      error(...values);
      toError(values);
    };
    console.warn = (...values: unknown[]) => {
      warn(...values);
      toWarning(values);
    };
    onScopeDispose(() => {
      console.error = error;
      console.warn = warn;
      clearTimeout(tally);
      tally = undefined;
    });
    listenOnWindow("error", (event) =>
      logError("uncaught error", event.error ?? event.message),
    );
    listenOnWindow("unhandledrejection", (event) =>
      logError("a promise failed and nothing caught it", event.reason),
    );
  });
