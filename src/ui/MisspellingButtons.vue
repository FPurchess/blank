<script setup lang="ts">
import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import { commandFor } from "../editor/plugins/keymap";
import { useEditor } from "../editor/handle";
import { spellcheck } from "../state";
import StatusItem from "./StatusItem.vue";

// The previous and next misspelling, next to spell check in the bottom bar
// while it's on, and only where the window is wide enough. The editor
// doesn't take the focus back: the command opens the misspelling's menu,
// which has it.
const editor = useEditor();
const go = (direction: 1 | -1) =>
  editor.run(
    commandFor(
      direction > 0
        ? CommandIdentifier.SPELLCHECK_NEXT
        : CommandIdentifier.SPELLCHECK_PREVIOUS,
    ),
    { focus: false },
  );
</script>

<template>
  <span v-if="spellcheck" class="status-wide">
    <StatusItem
      id="ui-misspelling-previous"
      icon="chevron-left"
      :label="commandLabel(CommandIdentifier.SPELLCHECK_PREVIOUS)"
      :command="CommandIdentifier.SPELLCHECK_PREVIOUS"
      @click="go(-1)"
    />
    <StatusItem
      id="ui-misspelling-next"
      icon="chevron-right"
      :label="commandLabel(CommandIdentifier.SPELLCHECK_NEXT)"
      :command="CommandIdentifier.SPELLCHECK_NEXT"
      @click="go(1)"
    />
  </span>
</template>
