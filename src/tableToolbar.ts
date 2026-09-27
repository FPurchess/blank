import { CommandIdentifier, getKeyBinding } from "./config";
import { formatShortcut } from "./contextMenu";
import { icon } from "./icons";
import {
  tableToolbar,
  type TableToolbarItem,
  type TableToolbarState,
} from "./state";

const TOOLBAR_ID = "table-toolbar";
// the space between the toolbar and the table, and the window's edges
const GAP = 6;
// the top bar with the file name, which the toolbar stays below
const TOP = 36;

/**
 * button creates the button of `item`. Pressing it keeps the focus in the
 * editor, which the toolbar works on.
 */
const button = (item: TableToolbarItem) => {
  const element = document.createElement("button");
  element.type = "button";
  element.tabIndex = -1;
  element.dataset.id = item.id;
  element.append(icon(item.icon));
  const key = document.createElement("kbd");
  key.setAttribute("aria-hidden", "true");
  element.append(key);
  element.addEventListener("mousedown", (event) => event.preventDefault());
  return element;
};

/**
 * createToolbar creates the toolbar with a button for each of `items`, in
 * groups, and the hint and caption field of table mode
 */
const createToolbar = (items: TableToolbarItem[]) => {
  const element = document.createElement("div");
  element.id = TOOLBAR_ID;
  element.className = "table-toolbar";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "Table");

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  items.forEach((item, index) => {
    if (index > 0 && items[index - 1].group !== item.group) {
      const separator = document.createElement("span");
      separator.className = "separator";
      separator.setAttribute("role", "separator");
      buttons.append(separator);
    }
    buttons.append(button(item));
  });

  const hint = document.createElement("div");
  hint.className = "hint";
  const done = formatShortcut(getKeyBinding(CommandIdentifier.INSERT_TABLE));
  hint.textContent = `Shift+arrows move rows and columns · Esc or ${done}: done`;

  element.append(buttons, hint);
  return element;
};

/**
 * updateButtons shows the state of `items` on the buttons, and runs an item
 * when its button is clicked
 */
const updateButtons = (element: HTMLElement, state: TableToolbarState) => {
  for (const item of state.items) {
    const button = element.querySelector<HTMLButtonElement>(
      `button[data-id="${item.id}"]`,
    );
    if (!button) continue;
    const label = state.keys ? `${item.label} (${item.key})` : item.label;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-disabled", String(!item.enabled));
    if (item.checked === undefined) button.removeAttribute("aria-pressed");
    else button.setAttribute("aria-pressed", String(item.checked));
    button.querySelector("kbd")!.textContent = item.key;
    button.onclick = item.enabled ? () => item.run() : null;
  }
};

/**
 * updateCaption shows the caption field while it's open
 */
const updateCaption = (element: HTMLElement, state: TableToolbarState) => {
  let form = element.querySelector<HTMLFormElement>("form.caption");
  if (!state.caption) {
    form?.remove();
    return;
  }
  if (form) return;
  const { value, submit, cancel } = state.caption;
  form = document.createElement("form");
  form.className = "caption";
  const input = document.createElement("input");
  input.value = value;
  input.placeholder = "Caption";
  input.setAttribute("aria-label", "Caption of the table");
  form.append(input);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });
  element.append(form);
  input.focus();
  input.select();
};

/**
 * place puts the toolbar above the table's right end, where it rarely covers
 * the text above, which starts on the left. It stays at the top of the window
 * while the table's top is scrolled away, and hides while the table is out of
 * view.
 */
const place = (element: HTMLElement, anchor: TableToolbarState["anchor"]) => {
  // measured at the window's left edge, since where it stands now limits
  // its width, e.g. while table mode makes it wider
  element.style.left = "0px";
  const { width, height } = element.getBoundingClientRect();
  const top = Math.max(anchor.top - height - GAP, TOP);
  element.hidden =
    anchor.bottom < TOP + height || anchor.top > window.innerHeight;
  const left = Math.max(
    GAP,
    Math.min(anchor.right - width, window.innerWidth - GAP - width),
  );
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};

/**
 * bootTableToolbar shows the toolbar of the table the cursor is in. It is
 * created once per table visit and updated in place, so it doesn't flicker.
 */
export const bootTableToolbar = () => {
  let element: HTMLElement | null = null;
  tableToolbar.subscribe(
    (state) => {
      if (!state) {
        element?.remove();
        element = null;
        return;
      }
      if (!element) {
        element = createToolbar(state.items);
        document.body.append(element);
      }
      element.classList.toggle("keys", state.keys);
      updateButtons(element, state);
      updateCaption(element, state);
      place(element, state.anchor);
    },
    { immediate: true },
  );
};
