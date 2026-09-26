import { type LinkDialogRequest, linkDialog } from "./state";
import { isAbsoluteUrl, isSavableUrl, normalizeUrl } from "./url";
import { createButton, createDialog, createField } from "./dialog";

const DIALOG_ID = "link-dialog";

const MESSAGES = {
  empty: "Enter a URL",
  unsavable: "javascript:, vbscript:, file: and data: links can't be saved",
  notAbsolute: "This doesn't look like a full URL, e.g. https://example.com",
};

let unsubscribe: (() => void) | undefined;

/**
 * renderDialog renders the dialog for `request` and focuses the URL input
 */
const renderDialog = (request: LinkDialogRequest) => {
  // close hides the dialog before the callback returns the focus to the editor
  const close = (callback: () => void) => {
    linkDialog.value = null;
    callback();
  };

  const { backdrop, form } = createDialog(
    DIALOG_ID,
    request.isEdit ? "Edit link" : "Link",
    () => close(request.cancel),
  );

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

  form.append(url.label, url.input, hint, text.label, text.input, actions);
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
