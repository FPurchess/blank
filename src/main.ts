import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
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
    await bootConfig();
    await bootStorage();
    await bootEditor();
    editorReady = true;
    bootUI();
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
