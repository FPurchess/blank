---
paths:
  - "src/log.ts"
  - "src/main.ts"
  - "src-tauri/src/logging.rs"
  - "src-tauri/src/lib.rs"
---

# The log

Blank logs what goes wrong to a file on the user's computer and never sends it anywhere (decided with the maintainer: local only, no upload, no UI; the FAQ says where it is). Users share it by hand, e.g. pasted into a GitHub issue, so it must be safe to paste.

## Where

`src-tauri/src/logging.rs` starts `tauri-plugin-log` first in `setup`, writing `blank.log` in Tauri's `app_log_dir`:

| | |
|---|---|
| Linux | `$XDG_DATA_HOME` (`~/.local/share`) `/com.github.fpurchess.blank/logs/blank.log` |
| Snap | `~/snap/blank/current/.local/share/com.github.fpurchess.blank/logs/blank.log` (the gnome extension sets `XDG_DATA_HOME` per revision; removing the snap deletes it) |
| macOS | `~/Library/Logs/com.github.fpurchess.blank/blank.log` |
| Windows | `%LOCALAPPDATA%\com.github.fpurchess.blank\logs\blank.log` |

- 1 MB per file; a full one becomes `blank_<date>_<time>.log`, and two of those are kept (`RotationStrategy::KeepSome(2)`), so about 3 MB at most. Times are UTC, each line `[date][time][target][LEVEL] message`.
- Debug builds also write to stderr, for `tauri dev`. Release builds don't: they may have none, and a failing write there would make the logger panic. The file is `blank.log` whatever the product name is (`file_name`).
- **A log that can't be written never stops Blank:** `start` builds the logger with `split`, not the plugin's `build`, whose setup would fail the app when the log folder can't be made; then it writes to stderr only.
- Levels: others' crates from `warn`, Blank's own (`blank_lib`) and the webview's (`webview`) from `info`; Tauri's asset protocol not at all (an error for every local image that isn't there, which the webview logs itself, once). Plugins that start before `setup` (single instance, cli) log nowhere.
- E2E profiles point `XDG_DATA_HOME` into the spec's temporary profile, so each spec has its own log (`appLogFile()` in `e2e/helpers.ts`, `e2e/specs/log.e2e.ts`).

## What goes in

- **Each start:** `Blank <version> started on <os> <arch>, webview <version>` (Rust), and `the page layout is ready`/`off` (`main.ts`), or the engine's failure.
- **Rust:** `log::error!`/`log::warn!`/`log::info!` (the `log` crate). A panic hook (`hook_panics`) logs every panic with its thread and its `file:line`, and its message only when it is a fixed text: a formatted one (Rust's own, of slicing a string or unwrapping an error) may quote the document, so it is withheld. The default hook then prints it all to stderr. The layout engine's wasm (`report_panics` in `wasm.rs`) does the same: the location and a fixed message to `console.error`, which reaches the log, and the whole message to `console.debug`, which doesn't. No backtrace: release builds keep no debug info for it, and the location is enough for Blank's few Rust panics. A hard crash (a segfault in WebKit) leaves nothing; that's decided, not missing.
- **Webview (`src/log.ts`):** `bootLog()` runs first in `main.ts`. It sends every `console.error`/`console.warn` to the log as well as the console, and uncaught errors (`error`) and promises nobody caught (`unhandledrejection`). Vue logs component errors with `console.error`, so they land there too. Errors are written with name, message, stack and up to five causes (`describe`), a line is cut at `MAX_LINE`, a burst at `MAX_LINES` per `RATE_WINDOW` (what it left out is counted once it's over), and a write that fails is dropped without a word: logging never throws. `writing` stops what Tauri's IPC logs synchronously while a line is written.
- **Use `logError(context, error)` and `logWarning(context, problem)`** (console.error/warn with what Blank was doing first) for a failure, also where the user is only told by a notification: save, export, the spell check and its dictionary, the default page setup. `logInfo(message)` writes to the file only, for the few lines that tell Blank's state.

## What never goes in

- **The document's text, or anything else the user wrote or typed:** selections, the clipboard, spell check words and personal dictionary entries, form values, link targets (they are the document's text: `openLink.ts` logs only that it failed), header and footer text, passphrases and keys.
- An error whose message may echo such input is logged by its context (and kind) only: blank.json's parse errors (`configError`, JSON quotes what it couldn't read), images from the web or embedded in the document (`imageSource` names only their kind; a local image's path is fine), link targets, and Rust's formatted panic messages.
- Paths and file names are logged as they are (decided with the maintainer); the FAQ says so.
- Don't log per keystroke, scroll or frame: every webview line is an IPC call, and the burst limit would drop the line that matters.
