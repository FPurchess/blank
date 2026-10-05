<script setup lang="ts">
import { computed, shallowRef } from "vue";

import { config, MAX_INDENT, MIN_INDENT, wholeNumberIn } from "../../config";
import SettingRow from "../components/SettingRow.vue";
import TextField from "../components/TextField.vue";
import ReplacementsPage from "./ReplacementsPage.vue";
import {
  AUTOCORRECT_ROWS,
  autocorrectChange,
  enterInField,
  replacementsSummary,
  save,
  useInnerPage,
} from "./settingsModel";
import SwitchRow from "./SwitchRow.vue";

// Writing: a switch per group of autocorrect, your replacements, and the
// indent of code blocks.
const { page, open, back } = useInnerPage();

const setAutocorrect = (
  key: (typeof AUTOCORRECT_ROWS)[number]["key"],
  on: boolean,
) => {
  const { changes, message } = autocorrectChange(key, on);
  void save(changes, message);
};

const summary = computed(() => replacementsSummary(config.value));

// the indent as typed, saved once it's a whole number from 1 to 16
const indent = shallowRef(String(config.value.editor.indentSize));
const indentError = shallowRef("");
const commitIndent = () => {
  const size = Number(indent.value.trim());
  if (!wholeNumberIn(size, MIN_INDENT, MAX_INDENT) || !indent.value.trim()) {
    indentError.value = `Enter a whole number from ${MIN_INDENT} to ${MAX_INDENT}.`;
    return;
  }
  indentError.value = "";
  indent.value = String(size);
  if (size !== config.value.editor.indentSize)
    void save(
      [{ path: ["editor", "indentSize"], value: size }],
      `Code blocks indent by ${size} spaces`,
    );
};
</script>

<template>
  <ReplacementsPage v-if="page === 'replacements'" @back="back" />
  <!-- hidden, not gone, so Back gives its button the focus again -->
  <div :hidden="page !== null" class="section">
    <h3 class="settings-heading">Autocorrect</h3>
    <SwitchRow
      v-for="row in AUTOCORRECT_ROWS"
      :id="`settings-autocorrect-${row.key}`"
      :key="row.key"
      :name="`autocorrect-${row.key}`"
      :label="row.label"
      :description="row.description"
      :model-value="config.autocorrect[row.key]"
      @update:model-value="setAutocorrect(row.key, $event)"
    />
    <SettingRow
      id="settings-replacements"
      name="replacements"
      label="Your replacements"
      :description="summary"
    >
      <button
        type="button"
        class="edit"
        aria-describedby="settings-replacements settings-replacements-description"
        @click="open('replacements', $event)"
      >
        Edit…
      </button>
    </SettingRow>
    <h3 class="settings-heading">Code blocks</h3>
    <SettingRow
      id="settings-indent-label"
      name="indent"
      label="Indent size"
      :description="`Spaces Tab indents a line by, ${MIN_INDENT} to ${MAX_INDENT}`"
    >
      <div
        class="compact number"
        @keydown.enter="enterInField($event) && commitIndent()"
        @focusout="commitIndent"
      >
        <TextField
          id="settings-indent"
          v-model="indent"
          label="Indent size"
          unit="spaces"
          :error-id="indentError ? 'settings-indent-error' : undefined"
        />
      </div>
    </SettingRow>
    <p v-if="indentError" id="settings-indent-error" class="error" role="alert">
      {{ indentError }}
    </p>
  </div>
</template>
