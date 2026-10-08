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
import { closeTabs, reopenPdf } from "../editor/tabs";
import { commandKeys, WINDOW_COMMANDS } from "../editor/plugins/keymap";
import { useEditor } from "../editor/handle";
import {
  anchorTop,
  keptRange,
  onDesk,
  sheetLayout,
  viewAnchor,
  type ViewAnchor,
  visibleRange,
} from "../engine/frames";
import { PDF_FILTER } from "../formats";
import { basename } from "../paths";
import {
  checkSignatures,
  problemText,
  withFailedPage,
  withProblem,
} from "../pdf/document";
import { renderPage, cancelRender, type PageBitmap } from "../pdf/ipc";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { RenderQueue } from "../pdf/renderQueue";
import { listenOnWindow } from "../scope";
import {
  activeTab,
  activeTabId,
  isPdfTab,
  pageScrollRequest,
  pdfPageInView,
  pdfViewAnchor,
  pdfViewFocused,
  shownPdf,
  tabs,
  tabSwitch,
} from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useResizeObserver } from "./composables/useResizeObserver";
import { type Bitmap, pdfBitmaps } from "./pageBitmaps";
import PdfPage from "./PdfPage.vue";
import {
  pageInView,
  pageKey,
  pageSlot,
  renderScale,
  scrollBy,
  closedKeys,
} from "./pdfViewModel";
import { scrollFor } from "./scrollModel";

// The pages of the PDF tab shown, as its helper draws them (see
// .claude/rules/pdf.md): sheets one below the other at the scale that fits
// the widest, white in every theme, as they print. Only the pages near the
// view are mounted, and only those are drawn, the ones in view first. In
// place of the pages, why it can't show them. It holds the focus in a PDF
// tab, whose editor holds no text (src/pdf/placeholder.ts).
const editor = useEditor();
const scroller = useTemplateRef<HTMLElement>("scroller");
const width = shallowRef(800);
const viewHeight = shallowRef(600);
const scrollTop = shallowRef(0);
const ratio = shallowRef(window.devicePixelRatio || 1);
// counts the bitmaps drawn, which the pages show once they come
const drawn = shallowRef(0);

const pdf = shownPdf;
const pages = computed(() => pdf.value?.opened?.pages ?? []);
const layout = computed(() =>
  pages.value.length ? sheetLayout(pages.value, width.value) : null,
);
const problem = computed(() =>
  pdf.value?.problem ? problemText(pdf.value.problem, pdf.value.path) : null,
);

const measure = () => {
  const element = scroller.value;
  if (!element) return;
  width.value = element.clientWidth || window.innerWidth;
  viewHeight.value = element.clientHeight || window.innerHeight;
  scrollTop.value = element.scrollTop;
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

// the pages mounted: within a view's height of it, kept until two views away
let kept = "";
const range = computed(() => {
  if (!layout.value) return (kept = "");
  const near = visibleRange(layout.value, scrollTop.value, viewHeight.value);
  const far = visibleRange(
    layout.value,
    scrollTop.value,
    viewHeight.value,
    2 * viewHeight.value,
  );
  return (kept = keptRange(kept, near, far));
});
const inView = computed(() =>
  layout.value
    ? visibleRange(layout.value, scrollTop.value, viewHeight.value, 0)
    : "",
);

// the bitmap each page showed last, by its slot
const shownKeys = new Map<string, string>();
const cached = (key: string | undefined) =>
  key !== undefined && pdfBitmaps.get(key) ? key : "";

// each page mounted, with the bitmap it wants and the one it shows
const frames = computed(() => {
  void drawn.value;
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
    const key = pageKey(slot, scale);
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
      if (result.failure === "closed") return;
      pdf.value =
        result.failure === "failed"
          ? withProblem(pdf.value, "failed")
          : withFailedPage(pdf.value, job.page);
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

// what to draw: the pages mounted without their bitmap, those in view first
watch(frames, (list) => {
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

// another tab shows: the view goes back to where it was on it, also the
// one shown when it mounts
let restoring: { anchor: ViewAnchor | null } | null = {
  anchor: activeTab.value?.viewAnchor ?? null,
};
watch(
  tabSwitch,
  (change) => {
    queue.stop();
    kept = "";
    restoring = change && { anchor: change.anchor };
  },
  { flush: "sync" },
);
watch(
  layout,
  (next, previous) => {
    const element = scroller.value;
    if (!element || !next) return;
    const anchor = restoring
      ? restoring.anchor
      : previous && viewAnchor(previous, element.scrollTop);
    restoring = null;
    void nextTick(() => {
      element.scrollTop = anchor ? (anchorTop(next, anchor) ?? 0) : 0;
      measure();
    });
  },
  { flush: "post" },
);

// a page the status bar's menu goes to
watch(
  pageScrollRequest,
  (request) => {
    const element = scroller.value;
    if (!request || !element || !layout.value) return;
    const rect = onDesk(layout.value, { ...request, width: 0 });
    if (rect) {
      element.scrollTop =
        request.at !== undefined
          ? Math.max(0, rect.top - request.at)
          : (scrollFor(rect, element.scrollTop, element.clientHeight) ??
            element.scrollTop);
      measure();
    }
    pageScrollRequest.value = null;
  },
  { flush: "post" },
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
    const checked = await checkSignatures(tab, pdf.value);
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
  pdfPageInView.value = null;
  pdfViewAnchor.value = null;
});

const label = computed(() => (pdf.value ? basename(pdf.value.path) : ""));
const tabId = computed(() => activeTabId.value ?? "");
const again = () => void reopenPdf(tabId.value);
const find = async () => {
  // the tab the dialog is for, which may not show when it closes
  const id = tabId.value;
  const chosen = await open({ filters: [PDF_FILTER] });
  if (typeof chosen === "string") await reopenPdf(id, chosen);
};
const close = () => void closeTabs([tabId.value]);
</script>

<template>
  <div
    v-if="pdf"
    :id="PDF_VIEW_ID"
    ref="scroller"
    tabindex="0"
    role="document"
    :aria-label="label"
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
      aria-hidden="true"
      :style="{ height: `${layout.height}px` }"
    >
      <div
        v-for="frame in frames"
        :key="frame.page"
        class="page-sheet"
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
    </div>
  </div>
</template>
