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
  bandSummary,
  chooseFirstPage,
  firstPageLabel,
  firstPageMenu,
  mirrorOddPages,
  NAMES,
  openStrip,
  pageNumberMenu,
  pagesShown,
  removeBand,
  showPages,
  type Strip,
  stripSettings,
  tabLabel,
  toggleEvenPages,
  withSlots,
} from "../bandStrip";
import { shownIn } from "../dom";
import { FIELD_FULL_NAMES } from "../layout/placeholders";
import { SLOTS } from "../layout/settings";
import type { SlotEditor } from "../slotEditor";
import {
  announce,
  type BandEditorRequest,
  bandEditor,
  bandEditorDone,
  engineMissing,
  pageScrollRequest,
} from "../state";
import {
  bandInWindow,
  bandPage,
  centerRequest,
  INSERTS,
} from "./bandStripsModel";
import IconButton from "./components/IconButton.vue";
import IconGlyph from "./components/IconGlyph.vue";
import MenuButton from "./components/MenuButton.vue";
import SegmentedTabs from "./components/SegmentedTabs.vue";
import SwitchControl from "./components/SwitchControl.vue";
import { useBodyClass } from "./composables/useBodyClass";
import { useDismiss } from "./composables/useDismiss";
import { useResizeObserver } from "./composables/useResizeObserver";
import { useWindowWidth } from "./composables/useWindowWidth";
import { bandEditorPlace, fitsInView } from "./pageViewModel";
import { styleOf } from "./rect";
import SlotField from "./SlotField.vue";
import { tipAttrs } from "./tooltipModel";

// The header or footer being edited, on the page where it prints: its three
// slots over the band in the page's margin, and the strip beside them, on
// the popover surface, below a header and above a footer, with what to
// insert, which pages have it, and which pages' band the slots show.
// Without pages (without the layout engine) the strip sits at the window's
// edge and holds the slots itself. What it does is in src/bandStrip.ts;
// this renders it and wires the keys, the menus and the slot editors. Done,
// Enter or Esc in a slot, and a click anywhere else keep what was typed,
// like leaving Word's header.
const props = defineProps<{ request: BandEditorRequest }>();
// read once: BandStrips keys the strip by its request, so a new request
// mounts a new strip
const { band, page } = props.request;

const strip = shallowRef<Strip>(openStrip(band, props.request.bands, page));
// counts the changes that show the slots of other pages, which mount new
// slot editors for them
const shownSlots = shallowRef(0);
const tabs = computed(() =>
  pagesShown(strip.value).map((pages) => ({
    value: pages,
    label: tabLabel(strip.value, pages),
  })),
);

const root = useTemplateRef<HTMLElement>("root");
const card = useTemplateRef<HTMLElement>("card");
const slotRow = useTemplateRef<HTMLElement>("slotRow");
// the slot editors, by their position, and the one last in use, which the
// buttons insert into
const editors: SlotEditor[] = [];
let active = 1;
let closed = false;
const ready = (index: number, editor: SlotEditor) => (editors[index] = editor);
const focused = (index: number) => (active = index);
const focusSlot = () => editors[active]?.focus();

useBodyClass("band-editing", () => true);

// where the band is in the window, which follows the scrolling, the window
// and the zoom; null without pages, when the strip sits at the window's edge
const place = computed(() =>
  page === null || engineMissing.value ? null : bandInWindow(page - 1, band),
);
const windowWidth = useWindowWidth();
const cardHeight = shallowRef(0);
const measureCard = () => (cardHeight.value = card.value?.offsetHeight ?? 0);
useResizeObserver(() => [card.value], measureCard);
// the slots and the strip beside them, inside the view that clips them
const placed = computed(
  () =>
    place.value &&
    bandEditorPlace(place.value, band, cardHeight.value, windowWidth.value),
);
const rootStyle = computed(() => styleOf(placed.value?.view ?? null));
const cardStyle = computed(() => styleOf(placed.value?.card ?? null));
// at least as high as the band, and higher where a slot's text wraps
const slotsStyle = computed(() => {
  const slots = placed.value?.slots;
  return (
    slots && {
      ...styleOf({ ...slots, height: undefined }),
      minHeight: `${slots.height}px`,
      fontSize: `${slots.fontSize}px`,
    }
  );
});

// keeps what the slot editors hold for the pages they show
const save = () => {
  const [left, center, right] = editors.map((editor) => editor.text());
  strip.value = withSlots(strip.value, { left, center, right });
};

// closes the strip and keeps `kept`. The state goes first, so the editor
// that `apply` focuses keeps the focus; Vue removes the strip's DOM on the
// next tick.
const finish = (kept: Strip) => {
  if (closed) return;
  closed = true;
  bandEditor.value = null;
  props.request.apply(stripSettings(kept, props.request.bands));
};

// closes the strip and keeps what was typed
const done = () => {
  if (!closed) {
    save();
    finish(strip.value);
  }
  return true;
};

// Tab goes around the controls and slots in the order they show: the slots
// first where they're above the strip, e.g. for a header, and last where
// they're below it; the controls a roving row keeps out of the tab order
// are left out
const move = (by: number) => {
  const controls = shownIn(card.value!, "button:not([tabindex='-1'])");
  const slots = shownIn(slotRow.value!, ".ProseMirror");
  const all = placed.value?.slotsFirst
    ? [...slots, ...controls]
    : [...controls, ...slots];
  const index = all.indexOf(document.activeElement as HTMLElement);
  all[(index + by + all.length) % all.length].focus();
  return true;
};
const keys = { next: () => move(1), previous: () => move(-1), done };

// changes the strip: what the slots hold is kept first, and the slots then
// show the band of the pages the strip shows. A control the keys are on
// keeps the focus; otherwise the slot last in use gets it back, also when a
// click left it in a slot that's gone now.
const change = async (next: (current: Strip) => Strip) => {
  save();
  strip.value = next(strip.value);
  shownSlots.value++;
  await nextTick();
  if (closed) return;
  const on = document.activeElement;
  if (!(on instanceof HTMLElement && card.value?.contains(on))) focusSlot();
};

// inserts into the slot last in use, which keeps its cursor while a button
// is clicked
const insert = (text: string) => editors[active].insert(text);

const firstPageItems = () =>
  firstPageMenu(strip.value, (choice) =>
    change((current) => chooseFirstPage(current, choice)),
  );
const pageNumberItems = () =>
  pageNumberMenu(strip.value, {
    insert,
    setNumberStyle: (numberStyle) => {
      strip.value = { ...strip.value, numberStyle };
    },
    setStartNumber: (startNumber) => {
      strip.value = { ...strip.value, startNumber };
    },
  });

const mirror = async () => {
  await change(mirrorOddPages);
  announce("Even pages mirrored");
};

const remove = () => {
  finish(removeBand(strip.value));
  announce(`${NAMES[band]} removed`);
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

// a click anywhere else but on the strip, its slots, its menus, submenus
// included (src/ui/ContextMenu.vue), and the band it edits on the page (a
// sheet's whole margin, which a double click presses twice), keeps what was
// typed
useDismiss(
  () => [
    root.value,
    document.querySelector(".context-menus"),
    ...(page === null
      ? []
      : document.querySelectorAll(
          `[data-band-page="${bandPage(band, page)}"]`,
        )),
  ],
  () => done(),
);

// a strip that goes without done, e.g. with the app, focuses nothing more
onUnmounted(() => {
  closed = true;
  if (bandEditorDone.value === done) bandEditorDone.value = null;
});

onMounted(() => {
  // e.g. before another tab shows, whose bands these aren't
  bandEditorDone.value = done;
  measureCard();
  announce(`Editing the ${band}`);
  focusSlot();
  // the keys open it on the page in view, which scrolls its band to the
  // middle unless it shows with its strip already; a click opened it where
  // it is, and the second press of a double click lands on its band
  const shown = place.value;
  if (
    props.request.center &&
    page !== null &&
    shown &&
    !fitsInView(shown.band, band, shown.view, cardHeight.value)
  )
    pageScrollRequest.value = centerRequest(page - 1, band);
});
</script>

<template>
  <!-- every control leaves the focus where it is when pressed, e.g. in the
  slot that gets what it inserts -->
  <div
    id="band-editor"
    ref="root"
    :class="[band, { 'at-edge': !place }]"
    :style="rootStyle"
    role="group"
    :aria-label="NAMES[band]"
    @keydown="onKeydown"
  >
    <div ref="card" class="band-card" :style="cardStyle">
      <div class="band-card-head">
        <IconGlyph :name="band" />
        <div class="band-card-title">
          <b>{{ NAMES[band] }}</b
          >{{ " " }}<span class="summary">{{ bandSummary(strip) }}</span>
        </div>
        <IconButton
          class="quiet danger"
          icon="trash"
          label="Remove"
          :tip="`Remove the ${band} from every page`"
          @mousedown.prevent
          @click="remove"
          >Remove</IconButton
        >
        <button
          type="button"
          class="done"
          v-bind="tipAttrs({ name: 'Done', key: 'Esc' })"
          @mousedown.prevent
          @click="done"
        >
          Done
        </button>
      </div>
      <div class="band-card-body">
        <span class="band-card-label">Insert</span>
        <div class="band-card-row">
          <MenuButton
            class="chip"
            icon="plus"
            :label="FIELD_FULL_NAMES.page"
            :items="pageNumberItems"
            :refocus="focusSlot"
            @mousedown.prevent
            >{{ FIELD_FULL_NAMES.page }}</MenuButton
          >
          <IconButton
            v-for="placeholder in INSERTS"
            :key="placeholder.text"
            class="chip"
            icon="plus"
            :label="placeholder.label"
            :tip="placeholder.tip"
            @mousedown.prevent
            @click="insert(placeholder.text)"
            >{{ placeholder.label }}</IconButton
          >
        </div>
        <span class="band-card-label">Pages</span>
        <div class="band-card-row">
          <span class="band-card-field"
            >First page
            <MenuButton
              class="select"
              label="First page"
              :text="firstPageLabel(strip)"
              :items="firstPageItems"
              :refocus="focusSlot"
              @mousedown.prevent
          /></span>
          <SwitchControl
            :model-value="strip.evenPages"
            @update:model-value="change(toggleEvenPages)"
            @mousedown.prevent
            >Odd and even pages differ</SwitchControl
          >
          <button
            v-if="strip.evenPages"
            type="button"
            class="quiet"
            @mousedown.prevent
            @click="mirror"
          >
            Mirror the odd pages
          </button>
        </div>
        <template v-if="tabs.length > 1">
          <span class="band-card-label">Editing</span>
          <div class="band-card-row">
            <SegmentedTabs
              :label="`Pages of the ${band}`"
              :items="tabs"
              :model-value="strip.pages"
              @update:model-value="
                (pages) => change((current) => showPages(current, pages))
              "
              @mousedown.prevent
            />
          </div>
        </template>
      </div>
    </div>
    <div ref="slotRow" class="band-slots" :style="slotsStyle">
      <SlotField
        v-for="(position, index) in SLOTS"
        :key="`${shownSlots}-${position}`"
        :position="position"
        :text="strip.slots[strip.pages][position]"
        :label="`${NAMES[band]}, ${position}`"
        :keys="keys"
        @ready="(editor) => ready(index, editor)"
        @focus="focused(index)"
      />
    </div>
  </div>
</template>
