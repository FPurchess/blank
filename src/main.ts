import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootState } from "./state";
import { bootStorage, exposeStorage } from "./storage";
import { exposeAppearance } from "./state/appearance";
import { bootEditor } from "./editor";
import {
  bootEngine,
  engineStatus,
  exposeEngineHooks,
  useFallbackEditor,
} from "./engine/engine";
import { exposeGeometry } from "./engine/geometry";
import { bootMark, exposePerf } from "./engine/perf";
import { bootUI } from "./ui";
import { bootSpellcheck } from "./spellcheck/service";
import { errorMessage } from "./errors";
import { bootLog, logInfo } from "./log";

import "./scss/main.scss";

/**
 * showBootError explains in the window why Blank couldn't start, since there
 * is no editor to show instead
 */
const showBootError = (error: unknown) => {
  const message = document.createElement("pre");
  message.className = "boot-error";
  // textContent, never innerHTML: the error may contain text from blank.json
  message.textContent = [
    "Blank couldn't start.",
    "",
    errorMessage(error),
    "",
    "If you changed blank.json, fix or remove it and start Blank again.",
  ].join("\n");
  document.body.appendChild(message);
};

// the hooks E2E tests measure and break the page view with, in `bun run
// dev` and the debug builds they run
const testHooks = import.meta.env.DEV || __TEST_HOOKS__;

// first, so what goes wrong while starting is in the log
bootLog();

(async () => {
  let editorReady = false;
  try {
    bootMark("start");
    if (testHooks) {
      exposePerf();
      exposeEngineHooks();
      exposeStorage();
      exposeAppearance();
    }
    // the page view's layout engine loads while the rest boots, and the
    // editor lays out its document once it's there (see pageSync). Without
    // it, the editor shows the text itself.
    void bootEngine().then(
      () => {
        bootMark("engine");
        // "ready", or "off" when switched off on purpose
        logInfo(`the page layout is ${engineStatus()}`);
      },
      (error: unknown) => {
        console.error("failed to load the layout engine", error);
        useFallbackEditor("unavailable");
      },
    );
    bootState();
    await bootConfig();
    bootMark("config");
    await bootStorage();
    bootMark("storage");
    // not waiting for the engine: the editor and the UI mount while it loads
    // (fetching its wasm takes ~120 ms, compiling it ~15 ms), and the pages
    // show once it laid the document out. Measured in the debug app on a
    // quiet machine: the pages show ~50 ms sooner (~575 ms after the window
    // opens instead of ~630), and the hidden editor is never shown meanwhile.
    const editor = await bootEditor();
    bootMark("editor");
    editorReady = true;
    if (testHooks) exposeGeometry(editor.view);
    bootUI(editor);
    bootMark("ui");
    // doesn't wait for the dictionary, which may need a download
    bootSpellcheck();
  } catch (error) {
    console.error("failed to start Blank", error);
    if (!editorReady) {
      showBootError(error);
      return;
    }
    // the editor works, so don't cover it
    try {
      sendNotification(
        `Parts of Blank failed to start: ${errorMessage(error)}`,
      );
    } catch (notifyError) {
      console.error("failed to send notification", notifyError);
    }
  }
})();
