<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";

import { config } from "../../config";
import { language, savedMarks } from "../../state";
import { openSignatureDialog } from "../../editor/commands/signing";
import { forgetMark, loadMarks } from "../../signing/marks";
import type { Mark } from "../../signing/profile";
import { DATE_FORMATS, type DateFormat } from "../../signing/date";
import OptionGroup from "../components/OptionGroup.vue";
import SettingRow from "../components/SettingRow.vue";
import TextField from "../components/TextField.vue";
import CertificateRows from "./CertificateRows.vue";
import { enterInField, save } from "./settingsModel";
import { dateFormatOptions, MARK_ROWS } from "./signingModel";

// Signing: your signature and initials, the name under them, and how the
// date next to them is written.
onMounted(() => void loadMarks());

const edit = (mark: Mark) => void openSignatureDialog(mark);
const remove = async (mark: Mark) => {
  await forgetMark(mark);
};

// the name as typed, saved when the field is left or Enter is pressed
const name = shallowRef(config.value.signing.name);
const commitName = () => {
  const typed = name.value.trim();
  if (typed !== config.value.signing.name)
    void save(
      [{ path: ["signing", "name"], value: typed }],
      typed ? `Your name is ${typed}` : "Your name removed",
    );
};

const options = computed(() => dateFormatOptions(language.value));
const dateFormat = computed({
  get: () => config.value.signing.dateFormat,
  set: (format: DateFormat) =>
    void save(
      [{ path: ["signing", "dateFormat"], value: format }],
      `Dates like ${options.value[DATE_FORMATS.indexOf(format)].label}`,
    ),
});
</script>

<template>
  <h3 class="settings-heading">Your signature</h3>
  <SettingRow
    v-for="row in MARK_ROWS"
    :id="`settings-${row.mark}`"
    :key="row.mark"
    :name="row.mark"
    :label="row.label"
    :description="savedMarks?.[row.mark] ? undefined : row.empty"
  >
    <div class="signing-mark">
      <img
        v-if="savedMarks?.[row.mark]"
        class="signing-preview"
        :src="savedMarks[row.mark]!.png"
        :alt="row.label"
      />
      <button type="button" class="edit" @click="edit(row.mark)">
        {{ savedMarks?.[row.mark] ? "Edit…" : "Add…" }}
      </button>
      <button
        v-if="savedMarks?.[row.mark]"
        type="button"
        class="edit"
        @click="remove(row.mark)"
      >
        Remove
      </button>
    </div>
  </SettingRow>
  <SettingRow
    id="settings-signing-name-label"
    name="signing-name"
    label="Your name"
    description="Under your signature, where a signature block names nobody"
  >
    <div
      class="compact"
      @keydown.enter="enterInField($event) && commitName()"
      @focusout="commitName"
    >
      <TextField id="settings-signing-name" v-model="name" label="Your name" />
    </div>
  </SettingRow>
  <OptionGroup
    id="settings-date-format"
    v-model="dateFormat"
    name="date-format"
    label="Date"
    description="How the date next to your signature is written"
    aria-describedby="settings-date-format-description"
    :options="options"
  />
  <CertificateRows />
</template>
