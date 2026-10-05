<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";

import { config } from "../../config";
import { language } from "../../state";
import SegmentedTabs from "../components/SegmentedTabs.vue";
import TextField from "../components/TextField.vue";
import EntryList from "./EntryList.vue";
import InnerPage from "./InnerPage.vue";
import {
  addMessage,
  ALL_LANGUAGES,
  entriesOf,
  noneYet,
  scopes,
  validate,
  withEntry,
} from "./replacementsModel";
import { enterInField, save } from "./settingsModel";

// Your replacements: what you type and what it becomes, for every language
// or for one, added and removed in blank.json at once.
const emit = defineEmits<{ back: [] }>();

const choices = computed(() => scopes(config.value, language.value));
const scope = shallowRef(ALL_LANGUAGES);
const entries = computed(() => entriesOf(config.value, scope.value));

const typed = shallowRef("");
const becomes = shallowRef("");
const error = shallowRef("");
const typedField = useTemplateRef<InstanceType<typeof TextField>>("typedField");

const add = async () => {
  const problem = validate(typed.value.trim(), becomes.value);
  error.value = problem ?? "";
  if (problem) return;
  const key = typed.value.trim();
  const old = config.value.autocorrect.replace[scope.value]?.[key];
  const saved = await save(
    withEntry(scope.value, key, becomes.value),
    addMessage(key, becomes.value, old),
  );
  if (!saved) return;
  typed.value = "";
  becomes.value = "";
  typedField.value?.select();
};
const remove = (key: string) =>
  void save(withEntry(scope.value, key), `Replacement of ${key} removed`);
</script>

<template>
  <InnerPage
    title="Your replacements"
    back-tip="Back to Writing"
    @back="emit('back')"
  >
    <SegmentedTabs v-model="scope" class="scope" label="For" :items="choices" />
    <div class="add-row" @keydown.enter="enterInField($event) && add()">
      <div class="compact">
        <TextField
          id="settings-replace-typed"
          ref="typedField"
          v-model="typed"
          label="Typed"
          placeholder="Typed"
          :error-id="error ? 'settings-replace-error' : undefined"
        />
      </div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="compact">
        <TextField
          id="settings-replace-becomes"
          v-model="becomes"
          label="Becomes"
          placeholder="Becomes"
          :error-id="error ? 'settings-replace-error' : undefined"
        />
      </div>
      <button type="button" class="add" @click="add">Add</button>
    </div>
    <p v-if="error" id="settings-replace-error" class="error" role="alert">
      {{ error }}
    </p>
    <EntryList
      id="settings-replacements-list"
      :entries="entries"
      :empty="noneYet(scope)"
      filter-label="Filter your replacements"
      :remove-label="(entry) => `Remove the replacement of ${entry.key}`"
      @remove="remove"
    >
      <template #default="{ entry }">
        <code>{{ entry.key }}</code> → {{ entry.label }}
      </template>
    </EntryList>
    <template #footnote>
      Blank replaces what you typed once the word is complete: when you type a
      space, punctuation, Tab or Enter after it. Yours come before Blank's own replacements.
    </template>
  </InnerPage>
</template>
