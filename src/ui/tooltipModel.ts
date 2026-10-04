import { onScopeDispose, watch } from "vue";

import { commandLabel } from "../commandList";
import { type CommandIdentifier, getKeyBinding } from "../config";
import { ariaShortcut, commandShortcut } from "../editor/keyBindings";
import { listenOnWindow } from "../scope";
import { tooltipsSuppressed } from "../state";
import { hoverIntent } from "./hoverIntent";

// The shared tooltip of controls (UiTooltip.vue): a control's name and its
// shortcut, shown after the pointer rested on it, gone at once when it
// leaves, presses or types. Controls opt in with tipAttrs(); one set of
// window listeners serves them all.

// how long the pointer rests on a control before its tooltip shows, in ms
export const TIP_DELAY = 400;

// the ids of the tooltip and of its shortcut, which the control is
// described by while it shows
export const TIP_ID = "ui-tooltip";
export const TIP_KEY_ID = "ui-tooltip-key";

// what a control's tooltip says: its name, the command it runs, and the key
// to write instead of the command's
export interface TipSpec {
  name?: string;
  command?: CommandIdentifier;
  key?: string;
}

/**
 * tipAttrs returns the attributes that give a control the shared tooltip:
 * its name, the command's label unless given, and its shortcut, the
 * command's unless `key` gives one; for a command also aria-keyshortcuts
 */
export const tipAttrs = ({ name, command, key }: TipSpec) => ({
  "data-tip": name ?? (command ? commandLabel(command) : undefined),
  "data-tip-key": key ?? (command ? commandShortcut(command) : undefined),
  "aria-keyshortcuts": command
    ? ariaShortcut(getKeyBinding(command))
    : undefined,
});

// a tooltip as it shows: its control, its text, and where the pointer was
export interface Tip {
  target: HTMLElement;
  name: string;
  key?: string;
  x: number;
}

/**
 * tipTarget returns the control with a tooltip at `node`, or null, also
 * while that control has opened what it controls (a menu)
 */
export const tipTarget = (node: EventTarget | null) => {
  const target =
    node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null;
  return target?.getAttribute("aria-expanded") === "true" ? null : target;
};

/**
 * tipOf returns what the tooltip of `target` shows
 */
export const tipOf = (target: HTMLElement, x: number): Tip | null => {
  const name = target.dataset.tip;
  if (!name) return null;
  return { target, name, key: target.dataset.tipKey || undefined, x };
};

/**
 * describedBy returns the id the control of `tip` is described by while it
 * shows: only the shortcut when the control's own name already says the
 * tooltip's, nothing when that is all the tooltip says
 */
export const describedBy = ({ target, name, key }: Tip) => {
  const own = (
    target.getAttribute("aria-label") ??
    target.textContent ??
    ""
  ).trim();
  if (!own.startsWith(name)) return TIP_ID;
  return key && !own.includes(key) ? TIP_KEY_ID : undefined;
};

/**
 * describe adds `id` to what `target` is described by, and returns how to
 * take it away again, leaving what it said before
 */
const describe = (target: HTMLElement, id: string | undefined) => {
  if (!id) return () => {};
  const before = target.getAttribute("aria-describedby");
  target.setAttribute("aria-describedby", before ? `${before} ${id}` : id);
  return () => {
    if (before === null) target.removeAttribute("aria-describedby");
    else target.setAttribute("aria-describedby", before);
  };
};

/**
 * watchTips calls `show` with the tooltip of the control the pointer rested
 * on for TIP_DELAY, again when the control's tooltip changes while it shows,
 * and `hide` at once when the pointer leaves it, on a press, a key, the
 * wheel or when the window loses the focus, and while tooltipsSuppressed.
 * Its listeners and timer go with the current scope (a component's setup).
 */
export const watchTips = (show: (tip: Tip) => void, hide: () => void) => {
  // the control the pointer is on, and where it entered it
  let target: HTMLElement | null = null;
  let x = 0;
  // the control a press or key dismissed the tooltip of, which stays
  // without one until the pointer leaves it
  let dismissed: HTMLElement | null = null;
  // while one shows: how to undo its description, and what watches it
  let undescribe = () => {};
  let observer: MutationObserver | null = null;

  const showTip = () => {
    const tip = target?.isConnected ? tipOf(target, x) : null;
    // a control whose tooltip went away while it showed
    if (!tip && observer) return close();
    if (!tip || tooltipsSuppressed.value) return;
    undescribe();
    undescribe = describe(tip.target, describedBy(tip));
    show(tip);
  };
  const open = () => {
    showTip();
    if (!target || observer) return;
    observer = new MutationObserver(showTip);
    observer.observe(target, {
      attributeFilter: ["data-tip", "data-tip-key"],
    });
  };
  const close = () => {
    observer?.disconnect();
    observer = null;
    undescribe();
    undescribe = () => {};
    hide();
  };
  const intent = hoverIntent({
    openAfter: TIP_DELAY,
    closeAfter: 0,
    open,
    close,
  });
  const dismiss = () => {
    dismissed = target;
    target = null;
    intent.cancel();
    close();
  };

  listenOnWindow("mouseover", (event) => {
    const next = tipTarget(event.target);
    if (next === target || next === dismissed) return;
    if (target) intent.leave();
    target = next;
    x = event.clientX;
    if (next) intent.enter();
  });
  listenOnWindow("mouseout", (event) => {
    const to = event.relatedTarget as Node | null;
    if (dismissed && !dismissed.contains(to)) dismissed = null;
    if (target && !target.contains(to)) {
      target = null;
      intent.leave();
    }
  });
  for (const type of ["mousedown", "keydown", "wheel"] as const) {
    listenOnWindow(type, dismiss, true);
  }
  listenOnWindow("blur", dismiss);
  watch(tooltipsSuppressed, (suppressed) => suppressed && dismiss(), {
    flush: "sync",
  });
  onScopeDispose(dismiss);
};
