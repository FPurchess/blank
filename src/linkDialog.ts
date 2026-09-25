import { type LinkDialogRequest, linkDialog } from "./state";
import { isAbsoluteUrl, isSavableUrl, normalizeUrl } from "./url";

const DIALOG_ID = "link-dialog";

const MESSAGES = {
  empty: "Enter a URL",
  unsavable: "javascript:, vbscript:, file: and data: links can't be saved",
  notAbsolute: "This doesn't look like a full URL, e.g. https://example.com",
};

let unsubscribe: (() => void) | undefined;

/**
 * createField creates a labelled text input
 */
const createField = (id: string, label: string, value: string) => {
  const labelElement = document.createElement("label");
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = value;

  return { label: labelElement, input };
};

const createButton = (
  text: string,
  type: "submit" | "button",
  onClick?: () => void,
) => {
  const button = document.createElement("button");
  button.type = type;
  button.textContent = text;
  if (onClick) button.addEventListener("click", onClick);
  return button;
};

/**
 * renderDialog renders the dialog for `request` and focuses the URL input
 */
const renderDialog = (request: LinkDialogRequest) => {
  // close hides the dialog before the callback returns the focus to the editor
  const close = (callback: () => void) => {
    linkDialog.value = null;
    callback();
  };

  const backdrop = document.createElement("div");
  backdrop.id = DIALOG_ID;
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) {
      event.preventDefault();
      close(request.cancel);
    }
  });

  const form = document.createElement("form");
  form.className = "link-dialog";
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");
  form.setAttribute("aria-labelledby", `${DIALOG_ID}-title`);

  const title = document.createElement("h2");
  title.id = `${DIALOG_ID}-title`;
  title.textContent = request.isEdit ? "Edit link" : "Link";

  const url = createField(`${DIALOG_ID}-url`, "URL", request.url);
  const hint = document.createElement("p");
  hint.id = `${DIALOG_ID}-hint`;
  hint.setAttribute("aria-live", "polite");
  url.input.setAttribute("aria-describedby", hint.id);

  const text = createField(`${DIALOG_ID}-text`, "Link Text", request.text);

  const save = createButton("Save", "submit");
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(save);
  if (request.isEdit) {
    actions.append(
      createButton("Convert to Text", "button", () =>
        close(request.convertToText),
      ),
    );
  }
  actions.append(createButton("Cancel", "button", () => close(request.cancel)));

  // validate shows the hint for the current URL and returns whether it can be saved
  const validate = (showEmpty = false) => {
    const value = normalizeUrl(url.input.value);
    let message = "";
    let valid = true;
    if (value === "") {
      message = showEmpty ? MESSAGES.empty : "";
      valid = false;
    } else if (!isSavableUrl(value)) {
      message = MESSAGES.unsavable;
      valid = false;
    } else if (!isAbsoluteUrl(value)) {
      message = MESSAGES.notAbsolute;
    }
    hint.textContent = message;
    hint.hidden = message === "";
    save.disabled = value !== "" && !valid;
    return valid;
  };
  url.input.addEventListener("input", () => validate());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validate(true)) {
      close(() => request.submit(url.input.value, text.input.value));
    }
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(request.cancel);
    } else if (event.key === "Tab") {
      // keep the focus inside the dialog
      const focusable = Array.from(
        form.querySelectorAll<HTMLElement>("input, button:not(:disabled)"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  form.append(title, url.label, url.input, hint, text.label, text.input);
  form.append(actions);
  backdrop.append(form);
  document.body.append(backdrop);

  validate();
  url.input.focus();
  url.input.select();
};

/**
 * bootLinkDialog renders the link dialog whenever `linkDialog` holds a request
 */
export const bootLinkDialog = () => {
  unsubscribe?.();
  unsubscribe = linkDialog.subscribe(
    (request) => {
      document.getElementById(DIALOG_ID)?.remove();
      if (request) renderDialog(request);
    },
    { immediate: true },
  );
};
