<script setup lang="ts">
import {
  computed,
  nextTick,
  onScopeDispose,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import type { CommandIdentifier } from "../../config";
import { config, defaults } from "../../config";
import { announce } from "../../state";
import IconButton from "../components/IconButton.vue";
import TextField from "../components/TextField.vue";
import { save } from "./settingsModel";
import {
  assign,
  type Assigned,
  filterCommands,
  isChanged,
  type Pending,
  recordedKey,
  refusal,
  remove,
  reset,
  shortcutText,
} from "./shortcutsModel";

// Keyboard shortcuts: every command with its key, which a click records
// anew. While recording, the dialog's keys are the recording's: Esc cancels,
// Backspace removes the key, and Enter and Tab are keys like any other.
const root = useTemplateRef<HTMLElement>("root");
const query = shallowRef("");
const shown = computed(() => filterCommands(query.value));
const keymap = computed(() => config.value.keymap);
const changed = computed(() =>
  (Object.keys(keymap.value) as CommandIdentifier[]).some((id) =>
    isChanged(id, keymap.value),
  ),
);

// the command whose key is being recorded
const recording = shallowRef<CommandIdentifier | null>(null);
// a key another command has, which pressing (or resetting) again moves
const pending = shallowRef<Pending | undefined>();
// what a row says below it: why a key can't be, or whose it is
const message = shallowRef<{ id: CommandIdentifier; text: string } | null>(
  null,
);
const confirming = shallowRef(false);

const say = (id: CommandIdentifier, text: string) => {
  message.value = { id, text };
};
const stop = () => {
  recording.value = null;
};

const apply = async (id: CommandIdentifier, result: Assigned) => {
  if ("pending" in result) {
    pending.value = result.pending;
    say(id, result.message);
    return;
  }
  stop();
  pending.value = undefined;
  message.value = null;
  await save(result.changes, result.message);
};

const onKey = (event: KeyboardEvent) => {
  const id = recording.value;
  if (!id) return;
  event.preventDefault();
  event.stopPropagation();
  const key = recordedKey(event);
  if (key === undefined) return;
  if (key === "cancel") {
    stop();
    message.value = null;
    pending.value = undefined;
    announce("Shortcut unchanged");
    return;
  }
  if (key === "remove") return void apply(id, remove(id));
  if ("error" in key) return say(id, key.error);
  const refused = refusal(key.binding, id);
  if (refused) return say(id, refused);
  void apply(id, assign(id, key.binding, keymap.value, pending.value));
};

// the dialog's keys go to the recording first, so nothing submits, closes or
// moves the focus
const form = () => root.value?.closest("form");
watch(recording, (id, before) => {
  if (id && !before) form()?.addEventListener("keydown", onKey, true);
  if (!id) form()?.removeEventListener("keydown", onKey, true);
});
onScopeDispose(() => form()?.removeEventListener("keydown", onKey, true));

const record = (id: CommandIdentifier) => {
  if (recording.value === id) return stop();
  recording.value = id;
  pending.value = undefined;
  message.value = null;
  announce("Press the new keys");
};

const resetKey = (id: CommandIdentifier) => {
  stop();
  void apply(
    id,
    reset(
      id,
      keymap.value,
      pending.value?.id === id ? pending.value : undefined,
    ),
  );
};

const resetAll = async () => {
  confirming.value = false;
  await save([{ path: ["keymap"] }], "All shortcuts reset");
};
const askResetAll = async () => {
  confirming.value = true;
  await nextTick();
  root.value?.querySelector<HTMLElement>(".confirm .cancel")?.focus();
};
const cancelResetAll = async () => {
  confirming.value = false;
  await nextTick();
  root.value?.querySelector<HTMLElement>(".reset-all")?.focus();
};

const keyLabel = (label: string, id: CommandIdentifier) =>
  recording.value === id
    ? `Press the new keys for ${label}`
    : `${label}: ${shortcutText(keymap.value[id])}`;
</script>

<template>
  <div ref="root" class="shortcuts">
    <div v-if="!confirming" class="shortcuts-top">
      <div class="compact search">
        <TextField
          id="settings-shortcuts-search"
          v-model="query"
          label="Search shortcuts"
          placeholder="Search shortcuts"
        />
      </div>
      <button
        type="button"
        class="reset-all quiet"
        :disabled="!changed"
        @click="askResetAll"
      >
        Reset all
      </button>
    </div>
    <div
      v-else
      class="shortcuts-top confirm"
      role="group"
      aria-labelledby="settings-reset-all-question"
      @keydown.esc.stop.prevent="cancelResetAll"
    >
      <span id="settings-reset-all-question">Reset all shortcuts?</span>
      <button type="button" class="reset" @click="resetAll">Reset</button>
      <button type="button" class="cancel" @click="cancelResetAll">
        Cancel
      </button>
    </div>
    <ul class="shortcut-list" aria-label="Shortcuts">
      <li
        v-for="info in shown"
        :key="info.id"
        class="shortcut"
        :data-command="info.id"
      >
        <span class="shortcut-text">
          {{ info.label.replace(/…$/, "") }}
          <small>{{ info.group }}</small>
        </span>
        <button
          type="button"
          class="shortcut-key"
          :class="{
            recording: recording === info.id,
            none: !keymap[info.id],
          }"
          :aria-label="keyLabel(info.label.replace(/…$/, ''), info.id)"
          :aria-describedby="
            message?.id === info.id ? `shortcut-message-${info.id}` : undefined
          "
          @click="record(info.id)"
          @blur="recording === info.id && stop()"
        >
          {{
            recording === info.id
              ? "Press keys…"
              : shortcutText(keymap[info.id])
          }}
        </button>
        <IconButton
          v-if="isChanged(info.id, keymap)"
          class="reset-key"
          icon="undo"
          :label="`Reset to ${shortcutText(defaults.keymap[info.id])}`"
          @click="resetKey(info.id)"
        />
        <span v-else class="reset-key" aria-hidden="true" />
        <p
          v-if="message?.id === info.id"
          :id="`shortcut-message-${info.id}`"
          class="message"
          role="alert"
        >
          {{ message.text }}
        </p>
      </li>
    </ul>
    <p v-if="shown.length === 0" class="empty">No command matches.</p>
    <p class="note">
      Click a shortcut to record a new one. Esc cancels, Backspace removes it.
    </p>
  </div>
</template>
