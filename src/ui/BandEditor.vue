<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
} from "vue";

import {
  chooseFirstPage,
  firstPageMenu,
  mirrorOddPages,
  NAMES,
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
} from "../bandStrip";
import { shownIn } from "../dom";
import { SLOTS } from "../layout/settings";
import type { SlotEditor } from "../slotEditor";
import {
  type BandEditorRequest,
  bandEditor,
  contextMenu,
  type MenuItem,
} from "../state";
import { INSERTS } from "./bandStripsModel";
import { useBodyClass } from "./composables/useBodyClass";
import { useDismiss } from "./composables/useDismiss";
import SlotField from "./SlotField.vue";

// The open header or footer strip, at the top or bottom of the window: which
// pages it is for above the slots, the placeholders to insert below them.
// What it does is in src/bandStrip.ts; this renders it and wires the keys,
// the menus and the slot editors. Done, Enter or Esc in a slot, and a click
// anywhere else keep what was typed, like leaving Word's header.
const props = defineProps<{ request: BandEditorRequest }>();
// read once: BandStrips keys the strip by its request, so a new request
// mounts a new strip
const { band, fields } = props.request;

const strip = shallowRef<Strip>(openStrip(band, props.request.bands));
// counts the changes that show the slots of other pages, which mount new
// slot editors for them
const shownSlots = shallowRef(0);
const shown = computed(() => pagesShown(strip.value));

const root = useTemplateRef<HTMLElement>("root");
// the slot editors, by their position, and the one last in use, which the
// buttons insert into
const editors: SlotEditor[] = [];
let active = 1;
let closed = false;
const ready = (index: number, editor: SlotEditor) => (editors[index] = editor);
const focused = (index: number) => (active = index);

useBodyClass("band-editing", () => true);
useBodyClass(`editing-${band}`, () => true);

// keeps what the slot editors hold for the pages they show
const save = () => {
  const [left, center, right] = editors.map((editor) => editor.text());
  strip.value = withSlots(strip.value, { left, center, right });
};

// closes the strip and keeps what it holds. The state goes first, so the
// editor that `apply` focuses keeps the focus; Vue removes the strip's DOM on
// the next tick.
const done = () => {
  if (closed) return true;
  closed = true;
  save();
  bandEditor.value = null;
  props.request.apply(stripSettings(strip.value, props.request.bands));
  return true;
};

// Tab goes around the buttons and slots in the order they are shown
const move = (by: number) => {
  const all = shownIn(root.value!, "button, .ProseMirror");
  const index = all.indexOf(document.activeElement as HTMLElement);
  all[(index + by + all.length) % all.length].focus();
  return true;
};
const keys = { next: () => move(1), previous: () => move(-1), done };

// changes the strip: what the slots hold is kept first, and the slots then
// show the band of the pages the strip shows
const change = async (next: (current: Strip) => Strip) => {
  save();
  strip.value = next(strip.value);
  shownSlots.value++;
  await nextTick();
  if (!closed) editors[active].focus();
};

// inserts into the slot last in use, which keeps its cursor while a button
// is clicked
const insert = (text: string) => editors[active].insert(text);

// opens a menu below or above the button pressed, which gives the slot the
// focus back when it closes
const menu = (event: MouseEvent, items: MenuItem[]) => {
  const anchor = event.currentTarget as HTMLElement;
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
const openFirstPageMenu = (event: MouseEvent) =>
  menu(
    event,
    firstPageMenu(strip.value, (choice) =>
      change((current) => chooseFirstPage(current, choice)),
    ),
  );
const openPageNumberMenu = (event: MouseEvent) =>
  menu(
    event,
    pageNumberMenu(strip.value, fields, {
      insert,
      setNumberStyle: (numberStyle) => {
        strip.value = { ...strip.value, numberStyle };
      },
      setStartNumber: (startNumber) => {
        strip.value = { ...strip.value, startNumber };
      },
    }),
  );

const remove = () => {
  // the slots shown too, which done keeps
  editors.forEach(({ view }) =>
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size)),
  );
  strip.value = removeBand(strip.value);
  done();
};

// the buttons take the keys of the slots: Tab goes around, Esc is done
const onKeydown = (event: KeyboardEvent) => {
  if (!(event.target instanceof HTMLButtonElement)) return;
  if (event.key === "Tab") {
    event.preventDefault();
    move(event.shiftKey ? -1 : 1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    done();
  }
};

// a click anywhere else but on the strip and its menus, submenus included
// (src/ui/ContextMenu.vue), keeps what was typed
useDismiss(
  () => [root.value, document.querySelector(".context-menus")],
  () => done(),
);

// a strip that goes without done, e.g. with the app, focuses nothing more
onUnmounted(() => (closed = true));

onMounted(() => {
  if (props.request.insert) editors[1].insert(props.request.insert);
  editors[active].focus();
});
</script>

<template>
  <!-- every button leaves the focus where it is when pressed, e.g. in the
  slot that gets what it inserts -->
  <div
    id="band-editor"
    ref="root"
    class="band-editor"
    :class="band"
    role="group"
    :aria-label="NAMES[band]"
    @keydown="onKeydown"
  >
    <div class="band-inner">
      <div class="band-pages">
        <span class="band-label">{{ stripLabel(strip) }}</span>
        <div
          class="band-tabs"
          role="tablist"
          :aria-label="`Pages of the ${band}`"
          :hidden="shown.length < 2"
        >
          <button
            v-for="pages in shown"
            :key="pages"
            type="button"
            role="tab"
            :aria-selected="pages === strip.pages"
            :data-pages="pages"
            @mousedown.prevent
            @click="change((current) => showPages(current, pages))"
          >
            {{ tabLabel(strip, pages) }}
          </button>
        </div>
        <span class="spacer" />
        <button
          type="button"
          title="The left and right of the odd pages, swapped"
          :hidden="strip.pages !== 'even'"
          @mousedown.prevent
          @click="change(mirrorOddPages)"
        >
          Mirror Odd Pages
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          @mousedown.prevent
          @click="openFirstPageMenu"
        >
          First Page ▾
        </button>
        <button
          type="button"
          title="Different headers and footers on left and right pages"
          :aria-pressed="strip.evenPages"
          @mousedown.prevent
          @click="change(toggleEvenPages)"
        >
          Odd &amp; Even Pages
        </button>
      </div>
      <div class="slots">
        <SlotField
          v-for="(position, index) in SLOTS"
          :key="`${shownSlots}-${position}`"
          :position="position"
          :text="strip.slots[strip.pages][position]"
          :fields="fields"
          :keys="keys"
          @ready="(editor) => ready(index, editor)"
          @focus="focused(index)"
        />
      </div>
      <div class="band-tools">
        <button
          type="button"
          aria-haspopup="menu"
          @mousedown.prevent
          @click="openPageNumberMenu"
        >
          # Page number ▾
        </button>
        <button
          v-for="placeholder in INSERTS"
          :key="placeholder.text"
          type="button"
          @mousedown.prevent
          @click="insert(placeholder.text)"
        >
          {{ placeholder.label }}
        </button>
        <span class="spacer" />
        <button
          type="button"
          :title="`Remove the ${band}`"
          @mousedown.prevent
          @click="remove"
        >
          Remove
        </button>
        <button type="button" class="done" @mousedown.prevent @click="done">
          Done
        </button>
      </div>
    </div>
  </div>
</template>
