<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { CommandIdentifier } from "../config";
import { closeTabs, reopenPdf, signatureChecks } from "../editor/tabs";
import { commandKeys, WINDOW_COMMANDS } from "../editor/plugins/keymap";
import { useEditor } from "../editor/handle";
import { pointOnPage, viewAnchor } from "../engine/frames";
import { PDF_FILTER } from "../formats";
import { basename } from "../paths";
import {
  checkSignatures,
  problemText,
  withFailedPage,
  withRenderFailure,
} from "../pdf/document";
import { renderPage, cancelRender, type PageBitmap } from "../pdf/ipc";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { RenderQueue } from "../pdf/renderQueue";
import { pageRevision, syncFills } from "../pdf/fills";
import { isTargetPlace } from "../pdf/placeModel";
import { type FieldPlace, type Place, readingOrder } from "../pdf/places";
import {
  readPlaces,
  shownContext,
  shownPlaces,
  shownStamps,
} from "../pdf/placesRead";
import { cancelPlacing, placeStamp } from "../pdf/stampActions";
import { ghostsOf, type Stamp } from "../pdf/stampModel";
import { placeRefusal } from "../pdf/toolRules";
import { listenOnWindow } from "../scope";
import {
  activeTab,
  activeTabId,
  isPdfTab,
  pdfDeskLayout,
  pdfPageInView,
  pdfViewAnchor,
  pdfViewFocused,
  pdfViewport,
  pageRevisions,
  placingStamp,
  selectedStamp,
  shownPdf,
  stampBooks,
  tabs,
} from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { useDeskScroll } from "./composables/useDeskScroll";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useResizeObserver } from "./composables/useResizeObserver";
import { useWheelZoom } from "./composables/useWheelZoom";
import { type Bitmap, pdfBitmaps } from "./pageBitmaps";
import PdfField from "./PdfField.vue";
import PdfPage from "./PdfPage.vue";
import PdfTarget from "./PdfTarget.vue";
import StampOverlay from "./StampOverlay.vue";
import StampToolbar from "./StampToolbar.vue";
import { stampBox } from "./stampOverlayModel";
import {
  pageInView,
  pageKey,
  pageSlot,
  renderScale,
  scrollBy,
  closedKeys,
} from "./pdfViewModel";

// The pages of the PDF tab shown, as its helper draws them (see
// .claude/rules/pdf.md): sheets one below the other at the zoom of the
// window (Fit: the scale that fits the widest), white in every theme, as
// they print. Only the pages near the
// view are mounted, and only those are drawn, the ones in view first. In
// place of the pages, why it can't show them. It holds the focus in a PDF
// tab, whose editor holds no text (src/pdf/placeholder.ts).
const editor = useEditor();
const scroller = useTemplateRef<HTMLElement>("scroller");
const viewHeight = shallowRef(600);
const scrollTop = shallowRef(0);
const scrollLeft = shallowRef(0);
const ratio = shallowRef(window.devicePixelRatio || 1);
// counts the bitmaps drawn, which the pages show once they come
const drawn = shallowRef(0);

const pdf = shownPdf;
const pages = computed(() => pdf.value?.opened?.pages ?? []);
// where the pages are, at the zoom: from the view's width, which measure
// publishes
const layout = pdfDeskLayout;
const problem = computed(() =>
  pdf.value?.problem ? problemText(pdf.value.problem, pdf.value.path) : null,
);

const measure = () => {
  const element = scroller.value;
  if (!element) return;
  viewHeight.value = element.clientHeight || window.innerHeight;
  scrollTop.value = element.scrollTop;
  scrollLeft.value = element.scrollLeft;
  const next = {
    width: element.clientWidth || window.innerWidth,
    height: viewHeight.value,
    scrollTop: scrollTop.value,
    scrollLeft: scrollLeft.value,
  };
  const now = pdfViewport.value;
  if (
    !now ||
    now.width !== next.width ||
    now.height !== next.height ||
    now.scrollTop !== next.scrollTop ||
    now.scrollLeft !== next.scrollLeft
  )
    pdfViewport.value = next;
  pdfViewAnchor.value = layout.value
    ? viewAnchor(layout.value, scrollTop.value)
    : null;
};
useResizeObserver(
  () => [scroller.value],
  () => measure(),
);
listenOnWindow("resize", () => {
  ratio.value = window.devicePixelRatio || 1;
  measure();
});

// the pages mounted and those in view, and where the view scrolls to: back
// to the tab's spot once its pages are there, also the one shown when it
// mounts, keeping the spot when a resize shows them at another scale, the
// one a zoom keeps where it is, and to a page the status bar's menu goes to
const { range, inView } = useDeskScroll({
  scroller: () => scroller.value,
  layout,
  scrollTop,
  scrollLeft,
  viewHeight,
  measure,
  startAt: () => activeTab.value?.viewAnchor ?? null,
  switched: () => queue.stop(),
});

// Ctrl and the wheel zoom the pages about the spot under the pointer
useWheelZoom(
  () => scroller.value,
  (x, y) => (layout.value ? pointOnPage(layout.value, x, y) : undefined),
);

// the bitmap each page showed last, by its slot
const shownKeys = new Map<string, string>();
const cached = (key: string | undefined) =>
  key !== undefined && pdfBitmaps.get(key) ? key : "";

// each page mounted, with the bitmap it wants and the one it shows
const frames = computed(() => {
  void drawn.value;
  void pageRevisions.value;
  const doc = pdf.value;
  const tab = activeTabId.value;
  if (!layout.value || !range.value || !doc?.opened || !tab) return [];
  const [first, last] = range.value.split("-").map(Number);
  const [shownFirst, shownLast] = inView.value
    ? inView.value.split("-").map(Number)
    : [Infinity, -Infinity];
  return layout.value.frames.slice(first, last + 1).map((frame) => {
    const slot = pageSlot(tab, doc.opened!.sha256, frame.page);
    const scale = renderScale(
      pages.value[frame.page],
      layout.value!.scale,
      ratio.value,
    );
    const key = pageKey(slot, scale, pageRevision(tab, frame.page));
    return {
      ...frame,
      scale,
      key,
      // the one at another scale until this one is drawn
      bitmap: cached(key) || cached(shownKeys.get(slot)),
      failed: doc.failedPages.includes(frame.page),
      near: frame.page < shownFirst || frame.page > shownLast,
    };
  });
});

const queue = new RenderQueue<PageBitmap>({
  render: (job, ticket) => renderPage(job.tab, job.page, job.scale, ticket),
  cancel: (job, ticket) => {
    cancelRender(job.tab, ticket).catch(() => {});
  },
  done: (job, result) => {
    // a tab that isn't shown any more learns it when it shows again, and a
    // PDF opened again (Find it…) has pages of its own
    if (
      job.tab !== activeTabId.value ||
      !pdf.value?.opened ||
      job.slot !== pageSlot(job.tab, pdf.value.opened.sha256, job.page)
    )
      return;
    if ("failure" in result) {
      pdf.value = withRenderFailure(pdf.value, job.page, result.failure);
      return;
    }
    const { width, height, pixels } = result.bitmap;
    createImageBitmap(new ImageData(pixels, width, height)).then(
      (bitmap: Bitmap) => {
        // the tab closed while it was made
        if (!tabs.value.some((tab) => tab.id === job.tab)) {
          bitmap.close?.();
          return;
        }
        pdfBitmaps.set(job.key, bitmap, job.slot);
        shownKeys.set(job.slot, job.key);
        drawn.value++;
      },
      () => {
        if (job.tab === activeTabId.value && pdf.value)
          pdf.value = withFailedPage(pdf.value, job.page);
      },
    );
  },
});

// what to draw: the pages mounted without their bitmap, those in view first;
// the cache keeps those mounted, which would otherwise draw each other away
// at a large zoom
watch(frames, (list) => {
  pdfBitmaps.pin(list.map((frame) => frame.key));
  const tab = activeTabId.value;
  if (!tab) return queue.stop();
  queue.want(
    list
      .filter((frame) => !frame.failed && !cached(frame.key))
      .map((frame) => ({
        key: frame.key,
        slot: pageSlot(tab, pdf.value!.opened!.sha256, frame.page),
        tab,
        page: frame.page,
        scale: frame.scale,
        priority: frame.near ? 1 : 0,
      })),
  );
});

// what pages of closed PDF tabs showed (their bitmaps go in bootApp)
watch(tabs, (list) => {
  const open = new Set(list.filter(isPdfTab).map((tab) => tab.id));
  for (const slot of closedKeys(shownKeys.keys(), open)) shownKeys.delete(slot);
});

// the stamps placed on the pages, and the places to fill in or sign (a
// target a stamp fills gives way to it), in reading order, which the DOM
// keeps, so Tab goes through them as they're read; repeated initials show
// faded on the other pages
const stamps = computed(() => {
  void stampBooks.value;
  return shownStamps();
});
// on the pages mounted only, as those are
const ghosts = computed(() => {
  if (!range.value) return [];
  const [first, last] = range.value.split("-").map(Number);
  return ghostsOf(stamps.value, pages.value).filter(
    (ghost) => ghost.page >= first && ghost.page <= last,
  );
});
// what the places and fields may do now: why they can't be filled in, by
// their ids
const placeRefusals = computed(() => {
  const context = shownContext();
  return new Map(
    shownPlaces.value.map((place) => [place.id, placeRefusal(place, context)]),
  );
});
type Overlay =
  | { id: string; page: number; rect: Stamp["rect"]; stamp: Stamp }
  | { id: string; page: number; rect: Stamp["rect"]; target: Place }
  | { id: string; page: number; rect: Stamp["rect"]; field: FieldPlace };
const overlays = computed(() => {
  const filled = new Set(stamps.value.flatMap((stamp) => stamp.place ?? []));
  return readingOrder<Overlay>([
    ...stamps.value.map((stamp) => ({
      id: `stamp:${stamp.id}`,
      page: stamp.page,
      rect: stamp.rect,
      stamp,
    })),
    ...shownPlaces.value.flatMap((place): Overlay[] =>
      place.source === "field" && !isTargetPlace(place)
        ? [{ id: place.id, page: place.page, rect: place.rect, field: place }]
        : filled.has(place.id)
          ? []
          : [
              {
                id: place.id,
                page: place.page,
                rect: place.rect,
                target: place,
              },
            ],
    ),
  ]);
});

// the form's fields and the places found, read once the PDF shows; the
// fills its history holds, sent to its helper whenever they aren't the ones
// it holds
watch(
  () => [activeTabId.value, pdf.value?.opened] as const,
  ([tab, opened]) => {
    if (tab && opened) void readPlaces(tab, opened);
  },
  { immediate: true },
);
watch(
  [activeTabId, () => pdf.value?.opened, stampBooks],
  () => void syncFills(),
  {
    immediate: true,
  },
);
const frameOf = (page: number) => layout.value?.frames[page];

// a press on a page places the stamp whose tool was clicked there, centred
// on the press, and any other press on the desk leaves the stamp selected
const onDeskPress = (event: PointerEvent) => {
  const kind = placingStamp.value;
  if (!kind) {
    selectedStamp.value = null;
    return;
  }
  const desk = event.currentTarget as HTMLElement;
  const bounds = desk.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const frame = layout.value?.frames.find(
    (one) =>
      x >= one.left &&
      x <= one.left + one.width &&
      y >= one.top &&
      y <= one.top + one.height,
  );
  if (!frame || !layout.value) return;
  event.preventDefault();
  placingStamp.value = null;
  const scale = layout.value.scale;
  void placeStamp(
    kind,
    {
      page: frame.page,
      x: (x - frame.left) / scale,
      y: (y - frame.top) / scale,
    },
    () => scroller.value?.focus(),
  ).then((stamp) => {
    if (stamp)
      void nextTick(() =>
        document.getElementById(`stamp-${stamp.id}`)?.focus(),
      );
  });
};

// "Page N of M" in the status bar
watch(
  [layout, scrollTop, viewHeight],
  () => {
    pdfPageInView.value = layout.value
      ? pageInView(layout.value, scrollTop.value, viewHeight.value)
      : null;
  },
  { immediate: true },
);

const focusRegion = useFocusRegion(() => scroller.value, pdfViewFocused);

// the signatures are checked once the PDF shows, and again when Blank
// trusts other certificates (forgetSignatureChecks)
watch(
  () =>
    pdf.value?.opened && pdf.value.signatures === null
      ? activeTabId.value
      : null,
  async (tab) => {
    if (!tab || !pdf.value) return;
    const sha256 = pdf.value.opened?.sha256;
    let checked;
    let asked;
    // Blank trusted other certificates while it checked: again
    do {
      asked = signatureChecks();
      checked = await checkSignatures(tab, pdf.value, asked);
    } while (asked !== signatureChecks() && pdf.value);
    // the same PDF still, not one opened again from elsewhere meanwhile
    if (
      activeTabId.value === tab &&
      pdf.value?.signatures === null &&
      pdf.value.opened?.sha256 === sha256
    )
      pdf.value = { ...pdf.value, signatures: checked.signatures };
  },
  { immediate: true },
);

// a PDF tab shows: the pages take the focus, as the text does in a
// markdown tab
watch(
  () => pdf.value !== null,
  (shown) => {
    if (shown) void nextTick(() => scroller.value?.focus());
  },
  { immediate: true },
);

// the commands' keys that aren't the window's say why they don't work here
// (src/pdf/commands.ts)
const refusals = commandKeys(
  Object.values(CommandIdentifier).filter(
    (id) => !WINDOW_COMMANDS.includes(id),
  ),
);
const onKeydown = (event: KeyboardEvent) => {
  const element = scroller.value;
  if (!element) return;
  const by =
    event.ctrlKey || event.metaKey || event.altKey
      ? null
      : scrollBy(event.key, event.shiftKey, element.clientHeight);
  if (by !== null) {
    event.preventDefault();
    element.scrollTop = Math.max(
      0,
      Math.min(element.scrollHeight, element.scrollTop + by),
    );
    measure();
    return;
  }
  // Tab moves the focus as anywhere, not Indent's refusal
  if (event.key === "Tab") return;
  // Esc puts the tool down that was to place a stamp, or leaves the stamp
  // selected
  if (event.key === "Escape" && !event.ctrlKey && !event.metaKey) {
    if (cancelPlacing() || selectedStamp.value !== null) {
      selectedStamp.value = null;
      event.preventDefault();
      return;
    }
  }
  if (refusals(editor.view, event)) event.preventDefault();
};

onMounted(measure);
// a markdown tab shows (or the last PDF tab closed) while the focus is in
// the pages: it would drop to the body with them, so the text takes it
onBeforeUnmount(() => {
  if (scroller.value?.contains(document.activeElement)) editor.focus();
});
onUnmounted(() => {
  queue.stop();
  pdfBitmaps.pin([]);
  pdfPageInView.value = null;
  pdfViewAnchor.value = null;
  pdfViewport.value = null;
});

const label = computed(() => (pdf.value ? basename(pdf.value.path) : ""));
const tabId = computed(() => activeTabId.value ?? "");
// the pages take the focus back, from the button that goes or the dialog
const focusPages = () => void nextTick(() => scroller.value?.focus());
const again = () => {
  void reopenPdf(tabId.value).then(focusPages);
};
const find = async () => {
  // the tab the dialog is for, which may not show when it closes
  const id = tabId.value;
  const chosen = await open({ filters: [PDF_FILTER] });
  if (typeof chosen === "string") await reopenPdf(id, chosen);
  if (id === activeTabId.value) focusPages();
};
// the tab shown next takes the focus: another PDF's pages here, else the
// text (onBeforeUnmount)
const close = () => void closeTabs([tabId.value]).then(focusPages);
</script>

<template>
  <div
    v-if="pdf"
    :id="PDF_VIEW_ID"
    ref="scroller"
    tabindex="0"
    role="document"
    :aria-label="label"
    :class="{ 'pdf-placing': placingStamp !== null }"
    @scroll="measure"
    @keydown="onKeydown"
    @focusin="focusRegion.onFocusin"
    @focusout="focusRegion.onFocusout"
  >
    <div v-if="problem" class="pdf-problem" role="alert">
      <IconGlyph name="pdf" size="huge" />
      <p class="pdf-problem-title">{{ problem.title }}</p>
      <p class="pdf-problem-reason">{{ problem.reason }}</p>
      <div class="pdf-problem-actions">
        <button v-if="problem.find" type="button" @click="find">
          Find it…
        </button>
        <button v-else type="button" @click="again">Open again</button>
        <button type="button" @click="close">Close tab</button>
      </div>
    </div>
    <p v-else-if="!pdf.opened" class="pdf-problem pdf-opening" role="status">
      Opening {{ label }}…
    </p>
    <div
      v-else-if="layout"
      class="page-desk"
      :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
      @pointerdown="onDeskPress"
    >
      <div
        v-for="frame in frames"
        :key="frame.page"
        class="page-sheet"
        aria-hidden="true"
        :style="{
          top: `${frame.top}px`,
          left: `${frame.left}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        }"
      />
      <PdfPage
        v-for="frame in frames"
        :key="frame.page"
        :top="frame.top"
        :left="frame.left"
        :width="frame.width"
        :height="frame.height"
        :ratio="ratio"
        :bitmap="frame.bitmap"
        :failed="frame.failed"
      />
      <StampOverlay
        v-for="ghost in ghosts"
        :key="`${ghost.stamp.id}:${ghost.page}`"
        :stamp="ghost.stamp"
        :frame="frameOf(ghost.page)!"
        :page="pages[ghost.page]"
        :scale="layout.scale"
        :ghost="ghost.rect"
      />
      <template v-for="item in overlays" :key="item.id">
        <template v-if="'stamp' in item">
          <StampOverlay
            :stamp="item.stamp"
            :frame="frameOf(item.page)!"
            :page="pages[item.page]"
            :scale="layout.scale"
          />
          <StampToolbar
            v-if="item.stamp.id === selectedStamp"
            :stamp="item.stamp"
            :box="stampBox(item.rect, frameOf(item.page)!, layout.scale)"
          />
        </template>
        <PdfTarget
          v-else-if="'target' in item"
          :place="item.target"
          :frame="frameOf(item.page)!"
          :scale="layout.scale"
          :refusal="placeRefusals.get(item.id) ?? null"
        />
        <PdfField
          v-else
          :place="item.field"
          :frame="frameOf(item.page)!"
          :scale="layout.scale"
          :refusal="placeRefusals.get(item.id) ?? null"
        />
      </template>
    </div>
  </div>
</template>
