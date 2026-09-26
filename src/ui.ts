import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

import {
  importedFrom,
  language,
  languagePicker,
  path,
  spellcheck,
  spellcheckMessage,
  spellcheckStatus,
  textContent,
  type LanguagePickerState,
} from "./state";
import type { SpellcheckStatus } from "./spellcheck/types";
import { languageName } from "./spellcheck/service";
import { bootContextMenu } from "./contextMenu";
import { bootLinkDialog } from "./linkDialog";
import { bootImageDialog } from "./imageDialog";
import { basename } from "./paths";
import { confirm, openPicker, pickerLanguages, select } from "./languagePicker";
import { hasOwnRules } from "./editor/plugins/autocomplete/languages/lookup";

// how many languages the open picker shows at once
const pickerWindow = 5;

/**
 * languageLabel returns the footer label of `code`, marked with "*" if it
 * falls back to the English rules
 */
const languageLabel = (code: string) =>
  code.toUpperCase() + (hasOwnRules(code) ? "" : "*");

/**
 * renderLanguage renders the language chooser: the current language, or the
 * open picker with the languages around the selected one
 */
const renderLanguage = (element: HTMLElement, picker: LanguagePickerState) => {
  element.replaceChildren();
  element.classList.toggle("open", picker.open);
  element.classList.toggle("invalid", picker.invalid);

  if (!picker.open) {
    element.textContent = languageLabel(language.value);
    element.title = "Choose language";
    return;
  }

  const languages = pickerLanguages();
  const index = languages.indexOf(picker.selected);
  const count = Math.min(pickerWindow, languages.length);
  const first = index - Math.floor(count / 2);
  const item = (text: string, className?: string) => {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    element.appendChild(span);
    return span;
  };

  item("‹", "more");
  for (let i = 0; i < count; i++) {
    const code = languages[(first + i + languages.length) % languages.length];
    const option = item(
      code + (hasOwnRules(code) ? "" : "*"),
      code === picker.selected ? "option selected" : "option",
    );
    option.addEventListener("click", (event) => {
      // the chooser itself would open the picker again
      event.stopPropagation();
      select(code);
      confirm();
    });
  }
  item("›", "more");
  if (picker.buffer) item(picker.buffer + "_", "buffer");
};

// how long a message like "No spelling errors" shows
const MESSAGE_DURATION = 2000;

/**
 * renderSpellcheck renders the spell check status, or `message` if there is one
 */
const renderSpellcheck = (
  element: HTMLElement,
  status: SpellcheckStatus,
  message: string | null,
) => {
  const name = languageName(status.tag);
  const [text, title] = message
    ? [message, ""]
    : ({
        off: ["", ""],
        loading: ["Spelling …", `Loading the ${name} dictionary`],
        downloading: [
          `Spelling ${Math.round((status.progress ?? 0) * 100)} %`,
          `Downloading the ${name} dictionary`,
        ],
        ready: ["Spelling ✓", `Checking ${name} spelling`],
        unavailable: ["No spelling", `No spell check dictionary for ${name}`],
        error: ["Spelling ✗", status.message ?? ""],
      }[status.state] as [string, string]);
  element.textContent = text;
  element.title = title && `${title}, click to turn spell check off`;
  element.hidden = !text;
  element.dataset.state = status.state;
};

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
  const renderTitle = () => {
    const source = importedFrom.value;
    // textContent: the path is user controlled and must not be parsed as HTML
    uiTop.textContent =
      "» " +
      (path.value ??
        (source === null ? "Untitled" : `${basename(source)} (imported)`));
  };
  path.subscribe(renderTitle, { immediate: true });
  importedFrom.subscribe(renderTitle);

  const uiBottom = document.createElement("div");
  uiBottom.id = "ui-bottom";
  document.body.appendChild(uiBottom);

  const uiStats = document.createElement("span");
  uiStats.id = "ui-stats";
  uiBottom.appendChild(uiStats);
  textContent.subscribe(
    (content) => {
      const charCount = content.length;
      const wordCount = content.length ? content.split(/\s/).length : 0;
      uiStats.textContent = `${wordCount} words ${charCount} chars`;
    },
    { immediate: true },
  );

  const uiSpellcheck = document.createElement("span");
  uiSpellcheck.id = "ui-spellcheck";
  uiBottom.appendChild(uiSpellcheck);
  uiSpellcheck.addEventListener("mousedown", (event) => event.preventDefault());
  uiSpellcheck.addEventListener("click", () => {
    spellcheck.value = !spellcheck.value;
  });
  let messageTimer: number | undefined;
  const renderStatus = () =>
    renderSpellcheck(
      uiSpellcheck,
      spellcheckStatus.value,
      spellcheckMessage.value,
    );
  spellcheckStatus.subscribe(renderStatus);
  spellcheckMessage.subscribe((message) => {
    renderStatus();
    window.clearTimeout(messageTimer);
    if (message) {
      messageTimer = window.setTimeout(() => {
        spellcheckMessage.value = null;
      }, MESSAGE_DURATION);
    }
  });
  renderStatus();

  const uiLanguage = document.createElement("span");
  uiLanguage.id = "ui-language";
  uiBottom.appendChild(uiLanguage);
  // keep the focus in the editor, which handles the picker's keys
  uiLanguage.addEventListener("mousedown", (event) => event.preventDefault());
  uiLanguage.addEventListener("click", () => {
    if (!languagePicker.value.open) openPicker();
  });
  const render = () => renderLanguage(uiLanguage, languagePicker.value);
  language.subscribe(render);
  languagePicker.subscribe(render, { immediate: true });

  bootLinkDialog();
  bootImageDialog();
  bootContextMenu();

  // FIXME: better handling of permission errors
  setupNotification().catch(console.error);
};
