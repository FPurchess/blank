import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

import {
  language,
  languagePicker,
  path,
  textContent,
  type LanguagePickerState,
} from "./state";
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

  // FIXME: better handling of permission errors
  setupNotification().catch(console.error);
};
