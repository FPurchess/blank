import { bootDialog, createButton, createDialog, createField } from "./dialog";
import {
  choicesOf,
  HEADING_OPTIONS,
  MARGIN_OPTIONS,
  type Option,
  ORIENTATION_OPTIONS,
  type PageChoices,
  paperOptions,
  settingsOf,
} from "./layout/choices";
import { describePaper } from "./layout/describe";
import { layoutOf } from "./layout/resolve";
import { SIDES } from "./layout/settings";
import { thumbnailSvg } from "./layout/thumbnail";
import { type PageSetupRequest, pageSetup } from "./state";
import { uiRoot } from "./uiRoot";

// The page setup dialog: a row of choices for the paper, the orientation, the
// margins and the headings that start a new page, which ↑↓ move between and ←→ change, with a picture of the
// page. Custom sizes and margins are typed in below their row.

const DIALOG_ID = "page-setup";

type RowName = "paper" | "orientation" | "margins" | "newPageBefore";

/**
 * createSetting creates a labelled row of option buttons with the ARIA `role`
 * of the group. One button is in the tab order at a time, which ←→ (and
 * Home and End) move: `move` gets the index to go to.
 */
const createSetting = <T>(
  name: RowName,
  label: string,
  role: "radiogroup" | "group",
  options: Option<T>[],
  move: (index: number) => void,
) => {
  const element = document.createElement("div");
  element.className = "setting";
  element.dataset.row = name;
  element.setAttribute("role", role);
  const title = document.createElement("span");
  title.id = `${DIALOG_ID}-${name}`;
  title.className = "setting-label";
  title.textContent = label;
  element.setAttribute("aria-labelledby", title.id);

  const choices = document.createElement("div");
  choices.className = "options";
  const buttons = options.map((option) => {
    const button = createButton(option.label, "button");
    button.dataset.value = String(option.value);
    choices.append(button);
    return button;
  });
  let current = 0;
  const focusable = (index: number) => {
    current = (index + options.length) % options.length;
    buttons.forEach((button, i) => (button.tabIndex = i === current ? 0 : -1));
    return current;
  };
  element.addEventListener("keydown", (event) => {
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(focusable(moves[event.key]));
    }
  });
  element.append(title, choices);
  return { element, buttons, focusable };
};

/**
 * createRow creates a row of options of which one is checked, as ARIA
 * describes radio groups: ←→ check the next option
 */
const createRow = <T extends string>(
  name: RowName,
  label: string,
  options: Option<T>[],
  value: T,
  onChange: (value: T) => void,
) => {
  let checked = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const check = (index: number) => {
    checked = index;
    buttons.forEach((button, i) =>
      button.setAttribute("aria-checked", String(i === checked)),
    );
  };
  const select = (index: number) => {
    check(focusable(index));
    buttons[checked].focus();
    onChange(options[checked].value);
  };
  const { element, buttons, focusable } = createSetting(
    name,
    label,
    "radiogroup",
    options,
    select,
  );
  buttons.forEach((button, index) => {
    button.setAttribute("role", "radio");
    button.addEventListener("click", () => select(index));
  });
  check(focusable(checked));
  return { element };
};

/**
 * createToggleRow creates a row of options that are each on or off, as
 * toggle buttons: ←→ move between them and Space switches one
 */
const createToggleRow = <T>(
  name: RowName,
  label: string,
  options: Option<T>[],
  values: T[],
  onChange: (values: T[]) => void,
) => {
  const on = new Set(values);
  const { element, buttons, focusable } = createSetting(
    name,
    label,
    "group",
    options,
    (index) => buttons[index].focus(),
  );
  const render = () =>
    buttons.forEach((button, index) =>
      button.setAttribute("aria-pressed", String(on.has(options[index].value))),
    );
  buttons.forEach((button, index) =>
    button.addEventListener("click", () => {
      const { value } = options[index];
      if (on.has(value)) on.delete(value);
      else on.add(value);
      focusable(index);
      render();
      onChange(options.map((option) => option.value).filter((v) => on.has(v)));
    }),
  );
  focusable(0);
  render();
  return { element };
};

/**
 * createFields creates the inputs of a custom size or custom margins, shown
 * below their row while "Custom…" is chosen
 */
const createFields = (
  name: string,
  fields: { key: string; label: string; value: string }[],
  unit: string,
  onInput: (key: string, value: string) => void,
) => {
  const element = document.createElement("div");
  element.className = "custom";
  element.dataset.fields = name;
  for (const { key, label, value } of fields) {
    const field = createField(
      `${DIALOG_ID}-${name}-${key}`,
      `${label} (${unit})`,
      value,
    );
    field.input.inputMode = "decimal";
    field.input.addEventListener("input", () =>
      onInput(key, field.input.value),
    );
    const wrapper = document.createElement("div");
    wrapper.append(field.label, field.input);
    element.append(wrapper);
  }
  return element;
};

/**
 * renderDialog renders the dialog for `request` and focuses its first row
 */
const renderDialog = (request: PageSetupRequest) => {
  const close = (callback: () => void) => {
    pageSetup.value = null;
    callback();
  };
  const { backdrop, form } = createDialog(DIALOG_ID, "Page setup", () =>
    close(request.cancel),
  );
  form.classList.add("page-setup");

  const { locale, unit } = request;
  const choices: PageChoices = choicesOf(request.settings, locale, unit);

  const settings = document.createElement("div");
  settings.className = "settings";
  const picture = document.createElement("figure");
  picture.className = "thumbnail";
  const caption = document.createElement("figcaption");
  const errors = document.createElement("p");
  errors.id = `${DIALOG_ID}-errors`;
  errors.className = "error";
  errors.setAttribute("aria-live", "polite");

  const warnings = document.createElement("p");
  warnings.className = "warning";
  warnings.textContent = request.warnings.join(". ");
  warnings.hidden = request.warnings.length === 0;

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "↑↓ choose · ←→ change · Space switch a heading · Enter apply · Esc cancel";

  const apply = createButton("Apply", "submit");
  const makeDefault = createButton("Make This My Default", "button");

  const paperFields = createFields(
    "paper",
    [
      { key: "width", label: "Width", value: choices.width },
      { key: "height", label: "Height", value: choices.height },
    ],
    unit,
    (key, value) => {
      choices[key as "width" | "height"] = value;
      update();
    },
  );
  const marginFields = createFields(
    "margins",
    SIDES.map((side) => ({
      key: side,
      label: side[0].toUpperCase() + side.slice(1),
      value: choices.sides[side],
    })),
    unit,
    (key, value) => {
      choices.sides[key as keyof PageChoices["sides"]] = value;
      update();
    },
  );

  // update shows the page the choices describe, or what is wrong with them
  const update = () => {
    paperFields.hidden = choices.paper !== "custom";
    marginFields.hidden = choices.margins !== "custom";
    const result = settingsOf(choices, locale, unit);
    const problems = "errors" in result ? Object.values(result.errors) : [];
    errors.textContent = problems.join(". ");
    errors.hidden = problems.length === 0;
    apply.disabled = makeDefault.disabled = problems.length > 0;
    if ("settings" in result) {
      const layout = layoutOf(result.settings, locale);
      picture.innerHTML = thumbnailSvg(layout);
      caption.textContent = describePaper(layout, unit);
      picture.append(caption);
    }
    return "settings" in result ? result.settings : null;
  };

  const paper = createRow(
    "paper",
    "Paper",
    paperOptions(locale),
    choices.paper,
    (value) => {
      choices.paper = value;
      update();
    },
  );
  const orientation = createRow(
    "orientation",
    "Orientation",
    ORIENTATION_OPTIONS,
    choices.orientation,
    (value) => {
      choices.orientation = value;
      update();
    },
  );
  const margins = createRow(
    "margins",
    "Margins",
    MARGIN_OPTIONS,
    choices.margins,
    (value) => {
      choices.margins = value;
      update();
    },
  );
  const newPageBefore = createToggleRow(
    "newPageBefore",
    "New page before",
    HEADING_OPTIONS,
    choices.newPageBefore,
    (levels) => {
      choices.newPageBefore = levels;
      update();
    },
  );
  settings.append(
    paper.element,
    paperFields,
    orientation.element,
    margins.element,
    marginFields,
    newPageBefore.element,
  );

  // ↑↓ move between the rows and the visible inputs, Enter applies
  const stops = () =>
    [
      ...form.querySelectorAll<HTMLElement>(
        '[data-row] button[tabindex="0"], .custom input',
      ),
    ].filter((element) => !element.closest("[hidden]"));
  settings.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const all = stops();
      const index = all.indexOf(document.activeElement as HTMLElement);
      const next = all[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    } else if (
      event.key === "Enter" &&
      event.target instanceof HTMLButtonElement
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // editing the frontmatter as text, for everything the rows don't offer
  const text = document.createElement("textarea");
  text.id = `${DIALOG_ID}-text`;
  text.spellcheck = false;
  text.value = request.frontmatter ?? "";
  const textLabel = document.createElement("label");
  textLabel.htmlFor = text.id;
  textLabel.textContent = "Properties at the top of the file";
  const textEditor = document.createElement("div");
  textEditor.className = "text-editor";
  textEditor.hidden = true;
  textEditor.append(textLabel, text);
  text.addEventListener("input", () => {
    errors.hidden = true;
  });

  const editAsText = createButton("Edit as Text", "button", () => {
    settings.hidden = picture.hidden = hint.hidden = true;
    textEditor.hidden = false;
    editAsText.hidden = makeDefault.hidden = true;
    errors.hidden = true;
    apply.disabled = false;
    text.focus();
  });
  makeDefault.addEventListener("click", () => {
    const chosen = update();
    if (chosen) close(() => request.makeDefault(chosen));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!textEditor.hidden) {
      const error = request.applyText(text.value);
      if (error === null) {
        pageSetup.value = null;
      } else {
        errors.textContent = error;
        errors.hidden = false;
      }
      return;
    }
    const chosen = update();
    if (chosen) close(() => request.apply(chosen));
  });

  const body = document.createElement("div");
  body.className = "body";
  body.append(settings, textEditor, picture);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    editAsText,
    makeDefault,
    apply,
    createButton("Cancel", "button", () => close(request.cancel)),
  );

  form.append(warnings, body, errors, hint, actions);
  uiRoot().append(backdrop);
  update();
  const [first] = stops();
  first?.focus();
};

/**
 * bootPageSetup renders the page setup dialog whenever `pageSetup` holds a
 * request
 */
export const bootPageSetup = () =>
  bootDialog(pageSetup, DIALOG_ID, renderDialog);
