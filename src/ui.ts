import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

import { path, textContent } from "./state";
import { bootLinkDialog } from "./linkDialog";

export const setupNotification = async () => {
  const hasPermission = await isPermissionGranted();
  if (!hasPermission) {
    await requestPermission();
  }
};

export const bootUI = () => {
  const uiTop = document.createElement("div");
  uiTop.id = "ui-top";
  document.body.appendChild(uiTop);
  path.subscribe(
    (path) => {
      // textContent: the path is user controlled and must not be parsed as HTML
      uiTop.textContent = "» " + (path ?? "Untitled");
    },
    { immediate: true },
  );

  const uiBottom = document.createElement("div");
  uiBottom.id = "ui-bottom";
  document.body.appendChild(uiBottom);
  textContent.subscribe(
    (content) => {
      const charCount = content.length;
      const wordCount = content.length ? content.split(/\s/).length : 0;
      uiBottom.textContent = `${wordCount} words ${charCount} chars`;
    },
    { immediate: true },
  );

  bootLinkDialog();

  // FIXME: better handling of permission errors
  setupNotification().catch(console.error);
};
