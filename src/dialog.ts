// Building blocks of the modal dialogs (link, image, page setup): a backdrop
// with a form that keeps the focus inside and closes on Escape.

import { onScopeDispose, type Ref, watch } from "vue";

import { bootScope } from "./scope";

// the dispose function of each booted dialog, by its id
const booted = new Map<string, () => void>();

/**
 * bootDialog renders the dialog with the id `id` with `render` whenever
 * `requests` holds a request, and removes it once the request is gone. Booting
 * a dialog again replaces the earlier boot, so it's never shown twice.
 * @returns dispose, which removes the dialog and stops rendering it
 */
export const bootDialog = <T>(
  requests: Readonly<Ref<T | null>>,
  id: string,
  render: (request: T) => void,
) => {
  booted.get(id)?.();
  const dispose = bootScope(() => {
    watch(
      requests,
      (request) => {
        document.getElementById(id)?.remove();
        if (request) render(request);
      },
      { flush: "sync", immediate: true },
    );
    // runs once: disposing again, e.g. after booting again, would remove the
    // dialog of the newer boot
    onScopeDispose(() => {
      document.getElementById(id)?.remove();
      if (booted.get(id) === dispose) booted.delete(id);
    });
  });
  booted.set(id, dispose);
  return dispose;
};

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
      // what Tab can reach: not the unchecked options of a radio group, nor
      // what is hidden
      const focusable = Array.from(
        form.querySelectorAll<HTMLElement>(
          'input, textarea, button:not(:disabled):not([tabindex="-1"])',
        ),
      ).filter((element) => !element.closest("[hidden]"));
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
