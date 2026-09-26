import { type ImageDialogRequest, imageDialog } from "./state";
import { createButton, createDialog, createField } from "./dialog";
import { isSavableUrl, normalizeUrl } from "./url";

const DIALOG_ID = "image-dialog";

const MESSAGES = {
  empty: "Choose a file, or enter a path or web address",
  unsavable: "javascript:, vbscript: and file: addresses can't be saved",
  embedded: "Embedded in the document",
  choosing: "Choosing a file…",
};

let unsubscribe: (() => void) | undefined;

/**
 * renderDialog renders the dialog for `request` and focuses its first field
 */
const renderDialog = (request: ImageDialogRequest) => {
  // close hides the dialog before the callback returns the focus to the editor
  const close = (callback: () => void) => {
    imageDialog.value = null;
    callback();
  };

  const { backdrop, form } = createDialog(
    DIALOG_ID,
    request.isEdit ? "Edit image" : "Image",
    () => close(request.cancel),
  );

  // an embedded image isn't shown as its data: URL, which is long and
  // unreadable, but as a note; typing a path or address replaces it
  let embedded = request.src.startsWith("data:") ? request.src : null;
  const source = createField(
    `${DIALOG_ID}-src`,
    "File or web address",
    embedded ? "" : request.src,
  );
  source.input.placeholder = embedded ? "Embedded image" : "images/chart.png";
  const hint = document.createElement("p");
  hint.id = `${DIALOG_ID}-hint`;
  hint.setAttribute("aria-live", "polite");
  source.input.setAttribute("aria-describedby", hint.id);

  const choose = createButton("Choose file…", "button");
  choose.className = "choose";

  const alt = createField(`${DIALOG_ID}-alt`, "Description", request.alt);

  const save = createButton(request.isEdit ? "Save" : "Insert", "submit");
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(save);
  if (request.isEdit) {
    actions.append(
      createButton("Remove", "button", () => close(request.remove)),
    );
  }
  actions.append(createButton("Cancel", "button", () => close(request.cancel)));

  const showHint = (message: string) => {
    hint.textContent = message;
    hint.hidden = message === "";
  };

  // validate shows the hint for the current source and returns whether it can be saved
  const validate = (showEmpty = false) => {
    const value = normalizeUrl(source.input.value);
    let message = embedded ? MESSAGES.embedded : "";
    let valid = embedded !== null;
    if (!embedded) {
      if (value === "") {
        message = showEmpty ? MESSAGES.empty : "";
      } else if (!isSavableUrl(value)) {
        message = MESSAGES.unsavable;
      } else {
        valid = true;
      }
    }
    showHint(message);
    save.disabled = value !== "" && !valid;
    return valid;
  };

  source.input.addEventListener("input", () => {
    embedded = null;
    source.input.placeholder = "images/chart.png";
    validate();
  });

  choose.addEventListener("click", async () => {
    choose.disabled = true;
    showHint(MESSAGES.choosing);
    const image = await request.chooseFile();
    choose.disabled = false;
    // the dialog may have been closed meanwhile
    if (!backdrop.isConnected) return;
    if (image) {
      embedded = image.src;
      source.input.value = image.name;
      if (alt.input.value.trim() === "") {
        alt.input.value = image.name.replace(/\.[^.]+$/, "");
      }
      validate();
      alt.input.focus();
      alt.input.select();
    } else {
      validate();
      choose.focus();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validate(true)) {
      const src = embedded ?? source.input.value;
      close(() => request.submit(src, alt.input.value));
    }
  });

  const sourceRow = document.createElement("div");
  sourceRow.className = "row";
  sourceRow.append(source.input, choose);
  form.append(source.label, sourceRow, hint, alt.label, alt.input, actions);
  document.body.append(backdrop);

  validate();
  source.input.focus();
  source.input.select();
};

/**
 * bootImageDialog renders the image dialog whenever `imageDialog` holds a request
 */
export const bootImageDialog = () => {
  unsubscribe?.();
  unsubscribe = imageDialog.subscribe(
    (request) => {
      document.getElementById(DIALOG_ID)?.remove();
      if (request) renderDialog(request);
    },
    { immediate: true },
  );
};
