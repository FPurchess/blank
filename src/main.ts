import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootState } from "./state";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootEngine, useFallbackEditor } from "./engine/engine";
import { exposeGeometry } from "./engine/geometry";
import { bootMark } from "./engine/perf";
import { bootUI } from "./ui";
import { bootSpellcheck } from "./spellcheck/service";
import { errorMessage } from "./errors";

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

(async () => {
  let editorReady = false;
  try {
    bootMark("start");
    // the page view's layout engine loads while the rest boots; the editor
    // lays out its document once it's there. Without it, the editor shows
    // the text itself.
    const engine = bootEngine().then(
      () => bootMark("engine"),
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
    // the engine compiles best while nothing else runs, before the editor
    // renders its document
    await engine;
    const editor = await bootEditor();
    bootMark("editor");
    editorReady = true;
    exposeGeometry(editor.view);
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
