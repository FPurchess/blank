<script setup lang="ts">
import { computed, shallowRef } from "vue";

import { listenOnWindow } from "../scope";
import { type Point, tableHandles } from "../state";
import {
  anchorOf,
  type Axis,
  DOUBLE_CLICK,
  DRAG_AFTER,
  type Drag,
  handlesOf,
  hidesHandles,
  type Hover,
  hoverAt,
  NO_HOVER,
  NO_PREVIEW,
  outcomeOf,
  previewOf,
  sameHover,
  spanOf,
} from "./tableHandlesModel";
import { styleOf } from "./rect";

// The handles of the table under the mouse, see
// src/editor/plugins/tables/handles.ts: a grip on the left edge of the row and
// the top edge of the column under the mouse (click: select them and open
// the table menu, drag: move them), a "+" on the line between two rows or
// columns (click: insert one there), the lines between columns (drag: resize,
// double click: widths by content again) and the table's right and bottom
// edges and corner (drag: add or drop columns and rows). Where each goes and
// what a drag leads to is in tableHandlesModel.ts; they are placed by inline
// styles from it, never measured.

const pointer = shallowRef<Point>({ x: -1, y: -1 });
// the drag under way, replaced on every move of the pointer
const drag = shallowRef<Drag | null>(null);
// whether a handle is held, and whether that hides the handles, which only
// change at the start and end of a drag, so moving the pointer while dragging
// renders only the preview
const held = computed(() => drag.value !== null);
const hiding = computed(() => hidesHandles(drag.value));
// the line between columns pressed last, for double clicks
let lastPress: { index: number; time: number } | null = null;

// what the mouse is over, the same object while that stays the same, and
// kept as it is while a handle is dragged
const hover = computed<Hover>((previous) => {
  if (held.value && previous) return previous;
  const table = tableHandles.value;
  const next = table ? hoverAt(table, pointer.value) : NO_HOVER;
  return previous && sameHover(previous, next) ? previous : next;
});
const handles = computed(
  () =>
    tableHandles.value &&
    handlesOf(tableHandles.value, hover.value, hiding.value),
);
// what the drag leads to, once the pointer moved: a press alone shows none,
// and a move only once it's past DRAG_AFTER
const preview = computed(() => {
  const current = drag.value;
  const table = tableHandles.value;
  const started =
    current &&
    current.at !== current.start &&
    (current.kind !== "move" || current.moving);
  return started && table ? previewOf(current, table) : NO_PREVIEW;
});

listenOnWindow("mousemove", (event) => {
  pointer.value = { x: event.clientX, y: event.clientY };
});

const endDrag = () => {
  drag.value = null;
  tableHandles.value?.hold(false);
};

// Esc cancels a drag
listenOnWindow(
  "keydown",
  (event) => {
    if (drag.value && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      endDrag();
    }
  },
  true,
);

/**
 * dragOf returns the drag a press on `target` starts, or null for one that
 * starts none
 */
const dragOf = (target: HTMLElement, start: Point): Drag | null => {
  const table = tableHandles.value!;
  const { row, column } = hover.value;
  const is = (name: string) => target.classList.contains(name);
  const move = (axis: Axis, index: number): Drag => ({
    kind: "move",
    axis,
    span: spanOf(table, axis, index),
    start,
    at: start,
    moving: false,
  });
  if (is("grip") && is("row") && row !== null) return move("rows", row);
  if (is("grip") && is("column") && column !== null) {
    return move("columns", column);
  }
  if (is("resizer")) {
    const index = Number(target.dataset.index);
    return { kind: "resize", index, start, at: start };
  }
  if (is("edge")) {
    return {
      kind: "edge",
      horizontal: !is("bottom"),
      vertical: !is("right"),
      start,
      at: start,
    };
  }
  return null;
};

const press = (event: PointerEvent) => {
  const table = tableHandles.value;
  const target = event.target as HTMLElement;
  if (!table || event.button !== 0) return;
  if (target.classList.contains("insert")) {
    const { insertRow, insertColumn } = hover.value;
    if (insertRow !== null) table.insertRow(insertRow);
    else if (insertColumn !== null) table.insertColumn(insertColumn);
    return;
  }
  if (target.classList.contains("resizer")) {
    // a double click sizes the columns by content again; told apart here,
    // since the pointer capture sends the dblclick event to the root
    const index = Number(target.dataset.index);
    const now = Date.now();
    if (lastPress?.index === index && now - lastPress.time < DOUBLE_CLICK) {
      lastPress = null;
      table.setWidths(null);
      return;
    }
    lastPress = { index, time: now };
  }
  const started = dragOf(target, { x: event.clientX, y: event.clientY });
  if (!started) return;
  drag.value = started;
  // keeps the drag going while the mouse leaves the handle
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  table.hold(true);
};

const follow = (event: PointerEvent) => {
  const current = drag.value;
  if (!current || !tableHandles.value) return;
  const at = { x: event.clientX, y: event.clientY };
  if (current.kind !== "move") {
    drag.value = { ...current, at };
    return;
  }
  // a press that slips less than DRAG_AFTER is still a click
  const moved = Math.hypot(at.x - current.start.x, at.y - current.start.y);
  if (current.moving || moved >= DRAG_AFTER) {
    drag.value = { ...current, at, moving: true };
  }
};

/**
 * finish does what the drag led to
 */
const finish = () => {
  const current = drag.value;
  const table = tableHandles.value;
  if (!current || !table) return;
  endDrag();
  const outcome = outcomeOf(current, table);
  if (current.kind === "move" && !current.moving) {
    // a click on a grip opens the table menu below it
    const box =
      current.axis === "rows"
        ? handles.value?.rowGrip
        : handles.value?.columnGrip;
    const anchor = box
      ? anchorOf(box)
      : {
          left: current.start.x,
          top: current.start.y,
          bottom: current.start.y,
        };
    if (current.axis === "rows") table.selectRows(current.span, anchor);
    else table.selectColumns(current.span, anchor);
  } else if (outcome.kind === "move" && current.kind === "move") {
    if (outcome.by === 0) return;
    if (current.axis === "rows") table.moveRows(current.span, outcome.by);
    else table.moveColumns(current.span, outcome.by);
  } else if (outcome.kind === "resize") {
    if (current.at.x !== current.start.x) table.setWidths(outcome.widths);
  } else if (outcome.kind === "edge") {
    const changed =
      outcome.cols !== table.columns.length - 1 ||
      outcome.rows !== table.rowCount;
    if (changed) table.resize(outcome.cols, outcome.rows);
  }
};
</script>

<template>
  <!-- pressing a handle keeps the focus in the editor -->
  <div
    id="table-handles"
    class="table-handles"
    aria-hidden="true"
    :hidden="!handles"
    @mousedown.prevent
    @pointerdown="press"
    @pointermove="follow"
    @pointerup="finish"
    @pointercancel="endDrag"
  >
    <template v-if="handles">
      <div
        class="grip row"
        :class="{ selected: handles.rowSelected }"
        :hidden="!handles.rowGrip"
        :style="styleOf(handles.rowGrip)"
      />
      <div
        class="grip column"
        :class="{ selected: handles.columnSelected }"
        :hidden="!handles.columnGrip"
        :style="styleOf(handles.columnGrip)"
      />
      <div
        class="insert"
        :hidden="!handles.insert"
        :style="styleOf(handles.insert)"
      />
      <div
        class="insert-line"
        :hidden="!handles.insertLine"
        :style="styleOf(handles.insertLine)"
      />
      <div class="resizers">
        <div
          v-for="(box, index) in handles.resizers"
          :key="index"
          class="resizer"
          :data-index="index + 1"
          :hidden="!box"
          :style="styleOf(box)"
        />
      </div>
      <div
        class="edge right"
        :hidden="!handles.right"
        :style="styleOf(handles.right)"
      />
      <div
        class="edge bottom"
        :hidden="!handles.bottom"
        :style="styleOf(handles.bottom)"
      />
      <div
        class="edge corner"
        :hidden="!handles.corner"
        :style="styleOf(handles.corner)"
      />
      <div
        class="guide"
        :hidden="!preview.guide"
        :style="styleOf(preview.guide)"
      />
      <div
        class="dragged"
        :hidden="!preview.dragged"
        :style="styleOf(preview.dragged)"
      />
      <div
        class="ghost"
        :hidden="!preview.ghost"
        :style="styleOf(preview.ghost)"
      >
        <span class="size">{{ preview.size }}</span>
      </div>
    </template>
  </div>
</template>
