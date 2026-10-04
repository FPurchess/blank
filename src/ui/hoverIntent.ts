// Opening something after the pointer rested on it, and closing it a moment
// after the pointer left, like the tooltip (tooltipModel.ts) or a card that
// opens on hover. One timer, so a leave cancels a pending open and an enter a
// pending close, and moving from an anchor to its card (leave, then enter)
// keeps the card open. It cancels on nothing by itself: presses and keys are
// the caller's to wire up.

export interface HoverIntent {
  // the pointer entered the anchor, or what it opened
  enter(): void;
  // the pointer left either
  leave(): void;
  // opens at once, e.g. on a click, dropping what's pending
  openNow(): void;
  // drops what's pending, e.g. when it closed otherwise or unmounts
  cancel(): void;
}

export interface HoverIntentOptions {
  // how long the pointer rests before it opens, in ms
  openAfter: number;
  // how long after the pointer left it closes, in ms; 0 closes at once
  closeAfter: number;
  // both may be called while already open or closed
  open(): void;
  close(): void;
}

/**
 * hoverIntent returns the timer that opens and closes on the pointer's rest
 */
export const hoverIntent = ({
  openAfter,
  closeAfter,
  open,
  close,
}: HoverIntentOptions): HoverIntent => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const after = (delay: number, run: () => void) => {
    cancel();
    if (delay <= 0) run();
    else timer = setTimeout(run, delay);
  };
  return {
    enter: () => after(openAfter, open),
    leave: () => after(closeAfter, close),
    openNow: () => after(0, open),
    cancel,
  };
};
