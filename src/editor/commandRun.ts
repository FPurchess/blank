import type { Command } from "prosemirror-state";

import { CommandIdentifier } from "../config";
import { recordCommand } from "../state";

// commands that aren't worth remembering: they only move the focus, open a
// menu, or clear the very list of recent files
const UNRECORDED: ReadonlySet<CommandIdentifier> = new Set([
  CommandIdentifier.CONTEXT_MENU,
  CommandIdentifier.VIEW_FOCUS_NEXT,
  CommandIdentifier.VIEW_FOCUS_PREVIOUS,
  CommandIdentifier.VIEW_TOOLBAR_FOCUS,
  CommandIdentifier.FILE_CLEAR_RECENT,
]);

/**
 * recorded returns `command`, which remembers that the command `id` ran
 * whenever it runs and does something: not when it's only asked whether it
 * can (without `dispatch`). The one place commands are remembered from, for
 * the main menu's Recent and its search (see .claude/rules/main-menu.md).
 * @param byKey whether its key runs it, rather than a click
 */
export const recorded = (
  id: CommandIdentifier,
  command: Command,
  byKey: boolean,
): Command =>
  UNRECORDED.has(id)
    ? command
    : (state, dispatch, view) => {
        const done = command(state, dispatch, view);
        if (done && dispatch) recordCommand(id, byKey);
        return done;
      };
