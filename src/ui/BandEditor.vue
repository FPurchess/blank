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
  centerRequest,
  fitsInView,
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
import { slotRowPlace, stripPlace } from "./pageViewModel";
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
const px = (value: number) => `${value}px`;
const cardStyle = computed(() => {
  if (!place.value) return undefined;
  const { left, top, width } = stripPlace({
    ...place.value,
    which: band,
    height: cardHeight.value,
    windowWidth: windowWidth.value,
  });
  return { left: px(left), top: px(top), width: px(width) };
});
const slotsStyle = computed(() => {
  if (!place.value) return undefined;
  const { left, top, width, height, fontSize } = slotRowPlace(place.value.band);
  return {
    left: px(left),
    top: px(top),
    width: px(width),
    minHeight: px(height),
    fontSize: px(fontSize),
  };
});

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

// Tab goes around the controls and slots in the order they show: the slots
// first below a header's strip, last above a footer's; the controls a
// roving row keeps out of the tab order are left out
const move = (by: number) => {
  const controls = shownIn(card.value!, "button:not([tabindex='-1'])");
  const slots = shownIn(slotRow.value!, ".ProseMirror");
  const all =
    band === "header" && place.value
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
  // the slots shown too, which done keeps
  editors.forEach(({ view }) =>
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size)),
  );
  strip.value = removeBand(strip.value);
  done();
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

// a click anywhere else but on the strip, its slots and its menus, submenus
// included (src/ui/ContextMenu.vue), keeps what was typed
useDismiss(
  () => [root.value, document.querySelector(".context-menus")],
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
  // the band to the middle of the view, unless it shows with its strip
  // already: a click on it opened it, and the second of a double click
  // then lands in its slots
  const shown = place.value;
  if (
    page !== null &&
    shown &&
    !fitsInView(shown.band, band, shown.view, cardHeight.value + 8)
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
            label="Page number"
            tip="Page number, in a style you choose"
            :items="pageNumberItems"
            :refocus="focusSlot"
            @mousedown.prevent
            >Page number</MenuButton
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
            v-bind="
              tipAttrs({
                name: `Give the even pages the odd pages' ${band}, left and right swapped`,
              })
            "
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
