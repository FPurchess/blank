<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";

import { languageName } from "../../spellcheck/service";
import { language } from "../../state";
import TextField from "../components/TextField.vue";
import { dictionaryOf, validateWord } from "./dictionaryModel";
import EntryList from "./EntryList.vue";
import InnerPage from "./InnerPage.vue";
import { enterInField } from "./settingsModel";

// Your dictionary: the words spell check accepts in the current language, to
// add and remove one by one.
const emit = defineEmits<{ back: [] }>();

const tag = language.value;
const dictionary = dictionaryOf(tag);
onMounted(() => void dictionary.load());
const entries = computed(() =>
  dictionary.words.value.map((word) => ({ key: word })),
);

const word = shallowRef("");
const error = shallowRef("");
const field = useTemplateRef<InstanceType<typeof TextField>>("field");

const add = async () => {
  const typed = word.value.trim();
  if (!typed) return;
  const problem = validateWord(typed, dictionary.words.value);
  error.value = problem ?? "";
  if (problem) return;
  await dictionary.add(typed);
  word.value = "";
  field.value?.select();
};
</script>

<template>
  <InnerPage
    title="Your dictionary"
    :subtitle="languageName(tag)"
    back-tip="Back to Spelling"
    @back="emit('back')"
  >
    <div class="add-row" @keydown.enter="enterInField($event) && add()">
      <div class="compact">
        <TextField
          id="settings-dictionary-add"
          ref="field"
          v-model="word"
          label="Add a word"
          placeholder="Add a word"
          :error-id="error ? 'settings-dictionary-error' : undefined"
        />
      </div>
      <button
        type="button"
        class="add"
        :disabled="dictionary.readOnly.value"
        @click="add"
      >
        Add
      </button>
    </div>
    <p v-if="error" id="settings-dictionary-error" class="error" role="alert">
      {{ error }}
    </p>
    <p v-if="dictionary.readOnly.value" class="error" role="alert">
      Your dictionary file couldn't be read, so Blank leaves it as it is.
    </p>
    <EntryList
      id="settings-dictionary-list"
      :entries="entries"
      :disabled="dictionary.readOnly.value"
      empty="No words yet. Add one here, or choose “Add to dictionary” on a word the spell check underlines."
      filter-label="Filter your words"
      :remove-label="(entry) => `Remove ${entry.key}`"
      @remove="(key) => void dictionary.remove(key)"
    />
    <template #footnote>
      A word in lowercase also counts with a capital or in capitals. The list is
      a plain text file, one word per line, that you can sync or back up.
    </template>
  </InnerPage>
</template>
