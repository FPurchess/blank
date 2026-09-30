import { computed, effectScope, onScopeDispose, watch } from "vue";

import {
  chooseFirstPage,
  firstPageMenu,
  mirrorOddPages,
  openStrip,
  pageNumberMenu,
  pagesShown,
  removeBand,
  showPages,
  type Strip,
  stripLabel,
  stripSettings,
  tabLabel,
  toggleEvenPages,
  withSlots,
} from "./bandStrip";
import { CommandIdentifier, getKeyBinding } from "./config";
import { editBand } from "./editor/commands/editBand";
import type { EditorHandle } from "./editor/handle";
import { shownIn } from "./dom";
import {
  type Band,
  type DocumentFields,
  hasText,
  NO_FIELDS,
  variantsOf,
} from "./layout/bands";
import { type PageSettings, SLOTS, type Slots } from "./layout/settings";
import { createSlotEditor, renderSlot, type SlotEditor } from "./slotEditor";
import { bootScope, listenOnWindow } from "./scope";
import { uiRoot } from "./uiRoot";
import {
  type BandEditorRequest,
  bandEditor,
  contextMenu,
  type MenuItem,
  pageFields,
  pageLayout,
} from "./state";

// The header and footer strips: pinned to the top and bottom of the window
// and lined up with the text, since they repeat on every page. At rest a
// faint line shows what they say, or a hint appears on hover where there is
// none. A click opens the strip for editing: which pages it is for above
// the slots, the placeholders to insert below them. What the open strip
// does is in bandStrip.ts; this renders it.

const BANDS: Band[] = ["header", "footer"];
const NAMES: Record<Band, string> = { header: "Header", footer: "Footer" };
const EDITOR_ID = "band-editor";
// the context menu with its submenus, see src/ui/ContextMenu.vue
const MENUS = ".context-menus";

// the placeholders the strips insert, see tokens.ts
const INSERTS = [
  ["Title", "{title}"],
  ["Author", "{author}"],
  ["Chapter", "{chapter}"],
  ["Date", "{date}"],
  ["File", "{file}"],
] as const;

// the classes the strips give the body
const BODY_CLASSES = [
  "has-header",
  "has-footer",
  "near-top",
  "near-bottom",
  "band-editing",
  "editing-header",
  "editing-footer",
];

// the dispose of the strips booted last, which booting again replaces
let booted: (() => void) | undefined;

/**
 * button creates a button that leaves the focus where it is when clicked,
 * e.g. in a slot, whose cursor then gets what the button inserts
 */
const button = (text: string, onClick: () => void) => {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.addEventListener("click", onClick);
  element.addEventListener("mousedown", (event) => event.preventDefault());
  return element;
};

/**
 * edge creates the element at the top or bottom of the window that shows a
 * band at rest
 */
const edge = (band: Band) => {
  const element = document.createElement("div");
  element.id = `band-${band}`;
  element.className = `band-edge ${band}`;
  const inner = document.createElement("div");
  inner.className = "band-inner";
  element.append(inner);
  uiRoot().append(element);
  return { element, inner };
};

/**
 * renderRest shows a band at rest: its faint line, or the hints to add it
 * @param slots the band of every page, or else of the first or even pages
 */
const renderRest = (
  editor: EditorHandle,
  inner: HTMLElement,
  band: Band,
  slots: Slots | undefined,
  fields: DocumentFields,
) => {
  // the strip takes the focus itself
  const open = (insert?: string) =>
    editor.run(editBand(band, insert), { focus: false });
  inner.parentElement?.classList.toggle("empty", !slots);
  if (slots) {
    const line = document.createElement("div");
    line.className = "band-line";
    line.title = `Edit the ${band} (${getKeyBinding(band === "header" ? CommandIdentifier.EDIT_HEADER : CommandIdentifier.EDIT_FOOTER)})`;
    line.setAttribute("role", "button");
    for (const slot of SLOTS) {
      const part = document.createElement("span");
      part.className = `slot-text ${slot}`;
      renderSlot(part, slots[slot], fields);
      line.append(part);
    }
    line.addEventListener("mousedown", (event) => event.preventDefault());
    line.addEventListener("click", () => open());
    inner.replaceChildren(line);
    return;
  }
  const hint = document.createElement("div");
  hint.className = "band-hint";
  hint.append(button(`+ ${NAMES[band]}`, () => open()));
  if (band === "footer") {
    hint.append(button("# Page numbers", () => open("{page}")));
  }
  // for the mouse: the keyboard opens the strips with their shortcuts
  hint.querySelectorAll("button").forEach((hinted) => (hinted.tabIndex = -1));
  inner.replaceChildren(hint);
};

/**
 * renderEditor renders the open strip of `request`, in the scope it's
 * called in, whose stop closes it again
 */
const renderEditor = (request: BandEditorRequest) => {
  const { band, fields } = request;
  let strip: Strip = openStrip(band, request.bands);
  let closed = false;

  const element = document.createElement("div");
  element.id = EDITOR_ID;
  element.className = `band-editor ${band}`;
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", NAMES[band]);
  const inner = document.createElement("div");
  inner.className = "band-inner";
  element.append(inner);

  const pagesRow = document.createElement("div");
  pagesRow.className = "band-pages";
  const label = document.createElement("span");
  label.className = "band-label";
  const tabs = document.createElement("div");
  tabs.className = "band-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", `Pages of the ${band}`);
  const slotsRow = document.createElement("div");
  slotsRow.className = "slots";
  const tools = document.createElement("div");
  tools.className = "band-tools";

  let editors: SlotEditor[] = [];
  // the slot last in use, which the buttons insert into
  let active = 1;

  // keeps what the slot editors hold for the pages they show
  const save = () => {
    const [left, center, right] = editors.map((editor) => editor.text());
    strip = withSlots(strip, { left, center, right });
  };

  const done = () => {
    if (closed) return true;
    closed = true;
    save();
    bandEditor.value = null;
    request.apply(stripSettings(strip, request.bands));
    return true;
  };

  // Tab goes around the buttons and slots in the order they are shown
  const move = (by: number) => {
    const all = shownIn(element, "button, .ProseMirror");
    const index = all.indexOf(document.activeElement as HTMLElement);
    all[(index + by + all.length) % all.length].focus();
    return true;
  };

  // the slot editors of the pages shown
  const mountEditors = () => {
    editors.forEach((editor) => editor.destroy());
    slotsRow.replaceChildren();
    editors = SLOTS.map((slot, index) => {
      const place = document.createElement("div");
      place.className = `slot ${slot}`;
      place.dataset.placeholder = slot[0].toUpperCase() + slot.slice(1);
      slotsRow.append(place);
      const text = strip.slots[strip.pages][slot];
      const editor = createSlotEditor(place, text, fields, {
        next: () => move(1),
        previous: () => move(-1),
        done,
      });
      editor.view.dom.addEventListener("focus", () => (active = index));
      return editor;
    });
  };

  const renderPages = () => {
    const shown = pagesShown(strip);
    tabs.hidden = shown.length < 2;
    label.textContent = stripLabel(strip);
    tabs.replaceChildren(
      ...shown.map((pages) => {
        const tab = button(tabLabel(strip, pages), () =>
          change((current) => showPages(current, pages)),
        );
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(pages === strip.pages));
        tab.dataset.pages = pages;
        return tab;
      }),
    );
    even.setAttribute("aria-pressed", String(strip.evenPages));
    mirror.hidden = strip.pages !== "even";
  };

  // changes the strip: what the slots hold is kept first, and the slots
  // then show the band of the pages the strip shows
  const change = (next: (current: Strip) => Strip) => {
    save();
    strip = next(strip);
    mountEditors();
    renderPages();
    editors[active].focus();
  };

  // inserts into the slot last in use, which keeps its cursor while a
  // button is clicked
  const insert = (text: string) => editors[active].insert(text);
  const tool = (
    parent: HTMLElement,
    text: string,
    onClick: (element: HTMLButtonElement) => void,
  ) => {
    const element: HTMLButtonElement = button(text, () => onClick(element));
    parent.append(element);
    return element;
  };
  // opens a menu below or above a button, which gives the slot the focus
  // back when it closes
  const menu = (anchor: HTMLElement, items: MenuItem[]) => {
    const rect = anchor.getBoundingClientRect();
    const close = () => {
      if (contextMenu.value?.close === close) contextMenu.value = null;
      editors[active].focus();
    };
    contextMenu.value = {
      items,
      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
      keyboard: document.activeElement === anchor,
      close,
    };
  };
  const spacer = () => {
    const element = document.createElement("span");
    element.className = "spacer";
    return element;
  };

  // which pages: the tabs, what the first and even pages have
  pagesRow.append(label, tabs, spacer());
  const mirror = tool(pagesRow, "Mirror Odd Pages", () =>
    change(mirrorOddPages),
  );
  mirror.title = "The left and right of the odd pages, swapped";
  tool(pagesRow, "First Page ▾", (anchor) =>
    menu(
      anchor,
      firstPageMenu(strip, (choice) =>
        change((current) => chooseFirstPage(current, choice)),
      ),
    ),
  ).setAttribute("aria-haspopup", "menu");
  const even = tool(pagesRow, "Odd & Even Pages", () =>
    change(toggleEvenPages),
  );
  even.title = "Different headers and footers on left and right pages";

  // what to insert, and leaving
  tool(tools, "# Page number ▾", (anchor) =>
    menu(
      anchor,
      pageNumberMenu(strip, fields, {
        insert,
        setNumberStyle: (numberStyle) => {
          strip = { ...strip, numberStyle };
        },
        setStartNumber: (startNumber) => {
          strip = { ...strip, startNumber };
        },
      }),
    ),
  ).setAttribute("aria-haspopup", "menu");
  for (const [text, placeholder] of INSERTS) {
    tool(tools, text, () => insert(placeholder));
  }
  tools.append(spacer());
  tool(tools, "Remove", () => {
    // the slots shown too, which done keeps
    editors.forEach(({ view }) =>
      view.dispatch(view.state.tr.delete(0, view.state.doc.content.size)),
    );
    strip = removeBand(strip);
    done();
  }).title = `Remove the ${band}`;
  tool(tools, "Done", done).classList.add("done");

  inner.append(pagesRow, slotsRow, tools);
  mountEditors();
  renderPages();
  uiRoot().append(element);
  document.body.classList.add("band-editing", `editing-${band}`);

  // the buttons take the keys of the slots: Tab goes around, Esc is done
  element.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    if (event.key === "Tab") {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      done();
    }
  });

  // a click anywhere else keeps what was typed, like leaving Word's header
  listenOnWindow(
    "mousedown",
    (event) => {
      const target = event.target as Element | null;
      if (!target?.closest(`#${EDITOR_ID}, ${MENUS}`)) done();
    },
    true,
  );
  onScopeDispose(() => {
    editors.forEach((editor) => editor.destroy());
    element.remove();
    document.body.classList.remove("band-editing", `editing-${band}`);
  });

  if (request.insert) editors[1].insert(request.insert);
  editors[active].focus();
};

/**
 * shownAtRest returns the band to show at an edge: that of every page, or
 * else of the first or even pages, undefined where there is none
 */
const shownAtRest = (settings: PageSettings, band: Band) =>
  variantsOf(settings)
    .map((bands) => bands[band])
    .find(hasText);

/**
 * bootBandStrips shows the header and footer at the edges of the window,
 * and their strip while one is edited. Booting them again replaces the
 * earlier boot.
 * @param editor the editor whose strips a click opens
 * @returns dispose, which takes them away again and closes an open strip
 */
export const bootBandStrips = (editor: EditorHandle) => {
  booted?.();
  const dispose = bootScope(() => {
    const edges = Object.fromEntries(
      BANDS.map((band) => [band, edge(band)]),
    ) as Record<Band, ReturnType<typeof edge>>;

    // what the edges show, which only changes with the page setup, and what
    // its placeholders show, which pageFields keeps the same while typing;
    // asked for only while there is a band to show them in
    const atRest = computed(() => ({
      header: shownAtRest(pageLayout.value.settings, "header"),
      footer: shownAtRest(pageLayout.value.settings, "footer"),
    }));
    const fields = computed(() =>
      atRest.value.header || atRest.value.footer ? pageFields.value : NO_FIELDS,
    );
    watch(
      [atRest, fields],
      ([bands, values]) => {
        for (const band of BANDS) {
          renderRest(editor, edges[band].inner, band, bands[band], values);
          document.body.classList.toggle(
            `has-${band}`,
            bands[band] !== undefined,
          );
        }
      },
      { flush: "sync", immediate: true },
    );

    // the hints show while the mouse is on the bar at the top or bottom,
    // where they sit, without an area of their own that would take clicks
    // meant for the text; $bar-height in main.scss
    const NEAR = 44;
    listenOnWindow("mousemove", (event) => {
      document.body.classList.toggle("near-top", event.clientY < NEAR);
      document.body.classList.toggle(
        "near-bottom",
        event.clientY > window.innerHeight - NEAR,
      );
    });
    // leaving the window, e.g. through an edge, leaves no hint behind
    listenOnWindow("mouseout", (event) => {
      if (event.relatedTarget === null) {
        document.body.classList.remove("near-top", "near-bottom");
      }
    });

    // the open strip has a scope of its own, detached, so it's never owned
    // by a scope that happens to run when bandEditor is written; it's
    // closed here, and when the strips are disposed
    let closeEditor = () => {};
    watch(
      bandEditor,
      (request) => {
        closeEditor();
        closeEditor = () => {};
        if (request) {
          const scope = effectScope(true);
          scope.run(() => renderEditor(request));
          closeEditor = () => scope.stop();
        }
      },
      { flush: "sync", immediate: true },
    );
    // the pages show the bands themselves, on the sheets, where each page
    // ends and above the first page (src/ui/PageFrame.vue,
    // PageFirstHeader.vue), and open their strips on a click; the edges
    // only offer to add one, near the bars. Without the layout engine there
    // are no pages, and the edges show the bands.
    const withoutPages = document.body.classList.contains("without-engine");
    watch(
      [bandEditor, atRest],
      ([request, bands]) => {
        for (const band of BANDS) {
          edges[band].element.hidden =
            request?.band === band ||
            (bands[band] !== undefined && !withoutPages);
        }
      },
      { flush: "sync", immediate: true },
    );

    onScopeDispose(() => {
      closeEditor();
      // with the strips gone, no strip is open, and the editor takes the
      // focus again
      bandEditor.value = null;
      for (const band of BANDS) edges[band].element.remove();
      document.body.classList.remove(...BODY_CLASSES);
      if (booted === dispose) booted = undefined;
    });
  });
  booted = dispose;
  return dispose;
};
