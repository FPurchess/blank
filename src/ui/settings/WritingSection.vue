<script setup lang="ts">
import { computed, shallowRef } from "vue";

import { config, MAX_INDENT, MIN_INDENT } from "../../config";
import SettingRow from "../components/SettingRow.vue";
import TextField from "../components/TextField.vue";
import EditRow from "./EditRow.vue";
import PagedSection from "./PagedSection.vue";
import ReplacementsPage from "./ReplacementsPage.vue";
import {
  AUTOCORRECT_ROWS,
  autocorrectChange,
  enterInField,
  parseIndent,
  replacementsSummary,
  save,
} from "./settingsModel";
import SwitchRow from "./SwitchRow.vue";

// Writing: a switch per group of autocorrect, your replacements, and the
// indent of code blocks.
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
  const parsed = parseIndent(indent.value);
  indentError.value = "error" in parsed ? parsed.error : "";
  if (!("size" in parsed)) return;
  indent.value = String(parsed.size);
  if (parsed.size !== config.value.editor.indentSize)
    void save(
      [{ path: ["editor", "indentSize"], value: parsed.size }],
      `Code blocks indent by ${parsed.size} spaces`,
    );
};
</script>

<template>
  <PagedSection>
    <template #page="{ back }">
      <ReplacementsPage @back="back" />
    </template>
    <template #default="{ open }">
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
      <EditRow
        id="settings-replacements"
        name="replacements"
        label="Your replacements"
        :description="summary"
        @open="open('replacements', $event)"
      />
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
      <p
        v-if="indentError"
        id="settings-indent-error"
        class="error"
        role="alert"
      >
        {{ indentError }}
      </p>
    </template>
  </PagedSection>
</template>
