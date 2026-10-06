import type { Node } from "prosemirror-model";
import { history } from "prosemirror-history";

import { type Config, config } from "../config";
import { keymap } from "../editor/plugins/keymap";
import {
  createState,
  createTestView,
  pressKey,
  type StateOptions,
} from "./editor";

/**
 * withKeymap returns a test view of `node` with Blank's keymap and history,
 * and `press`, which sends it a key combination such as "Mod-z"
 */
export const withKeymap = (node: Node, options: StateOptions = {}) => {
  const plugin = keymap();
  const view = createTestView(
    createState(node, { ...options, plugins: [history(), plugin] }),
  );
  return { view, press: (combo: string) => pressKey(view, plugin, combo) };
};

/**
 * bindKeys gives the commands in `changes` those keys, as the settings would,
 * over the keymap of the config now; reset `config.value` after the test
 */
export const bindKeys = (changes: Partial<Config["keymap"]>) => {
  config.value = {
    ...config.value,
    keymap: { ...config.value.keymap, ...changes },
  };
};
