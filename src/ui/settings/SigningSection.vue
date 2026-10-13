<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { focusBack } from "../../dom";
import { errorMessage } from "../../errors";
import { logError } from "../../log";
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
// date next to them is written. Removing them asks nothing: they're made
// again in a moment, unlike the certificate (CertificateRows.vue).
onMounted(() =>
  loadMarks().catch((error: unknown) =>
    logError("failed to read the signature", error),
  ),
);

// the dialog gives the focus back to the button that opened it
const edit = (mark: Mark, event: Event) =>
  void openSignatureDialog(mark, focusBack(event.currentTarget));
const remove = async (mark: Mark, event: Event) => {
  // the focus goes on to Add…, which takes the place of Edit…
  const refocus = focusBack(
    (event.currentTarget as HTMLElement).parentElement?.querySelector(
      "button",
    ) ?? null,
  );
  try {
    await forgetMark(mark);
  } catch (error) {
    logError(`failed to remove the ${mark}`, error);
    sendNotification(`Failed to remove your ${mark}: ${errorMessage(error)}`);
  }
  refocus();
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
      <button type="button" class="edit" @click="edit(row.mark, $event)">
        {{ savedMarks?.[row.mark] ? "Edit…" : "Add…" }}
      </button>
      <button
        v-if="savedMarks?.[row.mark]"
        type="button"
        class="edit"
        @click="remove(row.mark, $event)"
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
