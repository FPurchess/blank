import { shallowRef } from "vue";

// Find and replace (src/editor/plugins/find, src/ui/FindPanel.vue): the panel
// and what it searches with. What each tab found is in its editor state. See
// .claude/rules/find.md.

export interface FindOptions {
  // upper and lower case must match
  matchCase: boolean;
  // only whole words: no letter, digit or _ right before or after
  wholeWord: boolean;
  // the query is a JavaScript regular expression
  regex: boolean;
}

// asks the panel to show and to put the focus in its field, a new object
// each time; null while it's closed. It stays open while the tabs change.
export const findPanel = shallowRef<{ id: number } | null>(null);

// the options of the panel, for the session, the same in every tab
export const findOptions = shallowRef<FindOptions>({
  matchCase: false,
  wholeWord: false,
  regex: false,
});

// whether the focus is in the panel, which the editor then leaves it (see
// uiTakesFocus)
export const findFocused = shallowRef(false);
