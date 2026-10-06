<script setup lang="ts">
import { computed, watch } from "vue";

import { config } from "../../config";
import { pickerLanguages } from "../../languagePicker";
import { languageName } from "../../spellcheck/service";
import { announce, language, type MenuItem, spellcheck } from "../../state";
import MenuButton from "../components/MenuButton.vue";
import { radioItems } from "../menuModel";
import SettingRow from "../components/SettingRow.vue";
import DictionaryPage from "./DictionaryPage.vue";
import { dictionaryOf, dictionarySummary } from "./dictionaryModel";
import EditRow from "./EditRow.vue";
import PagedSection from "./PagedSection.vue";
import { save } from "./settingsModel";
import SwitchRow from "./SwitchRow.vue";

// Spelling: spell check on or off, the language, which words it ignores,
// and your dictionary.
const checking = computed({
  get: () => spellcheck.value,
  set: (on: boolean) => {
    spellcheck.value = on;
    announce(on ? "Spelling on" : "Spelling off");
  },
});

const languageItems = (): MenuItem[] =>
  radioItems(
    pickerLanguages().map((code) => ({
      value: code,
      label: languageName(code),
    })),
    language.value,
    (code) => {
      language.value = code;
      announce(languageName(code));
    },
  );

const ignore = (
  key: "ignoreUppercase" | "ignoreWordsWithNumbers",
  label: string,
) =>
  computed({
    get: () => config.value.spellcheck[key],
    set: (on: boolean) =>
      void save(
        [{ path: ["spellcheck", key], value: on }],
        `${label} ${on ? "ignored" : "checked"}`,
      ),
  });
const ignoreUppercase = ignore("ignoreUppercase", "Words in capitals");
const ignoreNumbers = ignore("ignoreWordsWithNumbers", "Words with numbers");

// the dictionary of the language, which its page changes too
const dictionary = computed(() => dictionaryOf(language.value));
watch(dictionary, (words) => void words.load(), { immediate: true });
const summary = computed(() =>
  dictionarySummary(dictionary.value.words.value.length, language.value),
);
</script>

<template>
  <PagedSection>
    <template #page="{ back }">
      <DictionaryPage :tag="language" :dictionary="dictionary" @back="back" />
    </template>
    <template #default="{ open }">
      <SwitchRow
        id="settings-spellcheck"
        v-model="checking"
        name="spellcheck"
        label="Check spelling"
        description="Underlines words the dictionary doesn't know"
      />
      <SettingRow
        id="settings-language-label"
        name="language"
        label="Language"
        description="Also sets the quotes autocorrect uses"
      >
        <MenuButton
          id="settings-language"
          class="select"
          label="Language"
          :text="languageName(language)"
          :items="languageItems"
        />
      </SettingRow>
      <SwitchRow
        id="settings-ignore-uppercase"
        v-model="ignoreUppercase"
        name="ignore-uppercase"
        label="Ignore words in capitals"
        description="Like NASA or GmbH"
      />
      <SwitchRow
        id="settings-ignore-numbers"
        v-model="ignoreNumbers"
        name="ignore-numbers"
        label="Ignore words with numbers"
        description="Like mp3 or B2B"
      />
      <EditRow
        id="settings-dictionary"
        name="dictionary"
        label="Your dictionary"
        :description="summary"
        @open="open('dictionary', $event)"
      />
    </template>
  </PagedSection>
</template>
