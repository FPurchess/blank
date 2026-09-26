// Building blocks of the modal dialogs (link, image): a backdrop with a form
// that keeps the focus inside and closes on Escape.

/**
 * createField creates a labelled text input
 */
export const createField = (id: string, label: string, value: string) => {
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

export const createButton = (
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
 * createDialog creates the backdrop and form of a dialog with the id `id`.
 * Escape and a click on the backdrop call `cancel`, Tab cycles the focus
 * within the form.
 */
export const createDialog = (id: string, title: string, cancel: () => void) => {
  const backdrop = document.createElement("div");
  backdrop.id = id;
  backdrop.className = "dialog-backdrop";
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) {
      event.preventDefault();
      cancel();
    }
  });

  const form = document.createElement("form");
  form.className = "dialog";
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");
  form.setAttribute("aria-labelledby", `${id}-title`);

  const heading = document.createElement("h2");
  heading.id = `${id}-title`;
  heading.textContent = title;
  form.append(heading);

  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
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

  backdrop.append(form);
  return { backdrop, form };
};
