<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";

import { languageName } from "../../spellcheck/service";
import TextField from "../components/TextField.vue";
import AddRow from "./AddRow.vue";
import { type dictionaryOf, validateWord } from "./dictionaryModel";
import EntryList from "./EntryList.vue";
import InnerPage from "./InnerPage.vue";

// Your dictionary: the words spell check accepts in the language, to add and
// remove one by one. The Spelling section hands it the dictionary it counts,
// so both show the same words.
const props = defineProps<{
  tag: string;
  dictionary: ReturnType<typeof dictionaryOf>;
}>();
const emit = defineEmits<{ back: [] }>();

onMounted(() => void props.dictionary.load());
const entries = computed(() =>
  props.dictionary.words.value.map((word) => ({ key: word })),
);
const locked = computed(
  () => props.dictionary.busy.value || props.dictionary.unreadable.value,
);

const word = shallowRef("");
const error = shallowRef("");
const field = useTemplateRef<InstanceType<typeof TextField>>("field");

const add = async () => {
  const typed = word.value.trim();
  if (!typed || locked.value) return;
  error.value = validateWord(typed, props.dictionary.words.value) ?? "";
  if (error.value) return;
  await props.dictionary.add(typed);
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
    <AddRow
      id="settings-dictionary"
      :error="error"
      :disabled="locked"
      @add="add"
    >
      <template #default="{ errorId }">
        <div class="compact">
          <TextField
            id="settings-dictionary-add"
            ref="field"
            v-model="word"
            label="Add a word"
            placeholder="Add a word"
            :error-id="errorId"
          />
        </div>
      </template>
    </AddRow>
    <p v-if="dictionary.busy.value" class="note" role="status">
      Spell check is loading your dictionary. You can change it in a moment.
    </p>
    <p v-else-if="dictionary.unreadable.value" class="error" role="alert">
      Your dictionary file couldn't be read, so Blank leaves it as it is.
    </p>
    <EntryList
      id="settings-dictionary-list"
      label="your words"
      :entries="entries"
      :disabled="locked"
      empty="No words yet. Add one here, or choose “Add to dictionary” on a word the spell check underlines."
      :remove-label="(entry) => `Remove ${entry.key}`"
      @remove="(key) => void dictionary.remove(key)"
    />
    <template #footnote>
      A word in lowercase also counts with a capital or in capitals. The list is
      a plain text file, one word per line, that you can sync or back up.
    </template>
  </InnerPage>
</template>
