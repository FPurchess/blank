<script setup lang="ts">
import {
  computed,
  nextTick,
  onScopeDispose,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { type CommandIdentifier, config, defaults } from "../../config";
import { announce } from "../../state";
import IconButton from "../components/IconButton.vue";
import TextField from "../components/TextField.vue";
import { save } from "./settingsModel";
import {
  type Assigned,
  commandName,
  filterCommands,
  isChanged,
  keyButton,
  type Pending,
  recordingAction,
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

const stop = () => {
  recording.value = null;
};
const focus = async (selector: string) => {
  await nextTick();
  root.value?.querySelector<HTMLElement>(selector)?.focus();
};
const keyOf = (id: CommandIdentifier) =>
  `.shortcut[data-command="${id}"] .shortcut-key`;

const apply = async (id: CommandIdentifier, result: Assigned) => {
  if ("pending" in result) {
    pending.value = result.pending;
    message.value = { id, text: result.message };
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
  const action = recordingAction(event, id, keymap.value, pending.value);
  if (!("kind" in action)) return void apply(id, action);
  if (action.kind === "say") message.value = { id, text: action.text };
  if (action.kind === "cancel") {
    stop();
    message.value = null;
    pending.value = undefined;
    announce("Shortcut unchanged");
  }
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

// the reset button goes with the change, so the key gets the focus
const resetKey = async (id: CommandIdentifier) => {
  stop();
  const ask = pending.value?.id === id ? pending.value : undefined;
  await apply(id, reset(id, keymap.value, ask));
  await focus(keyOf(id));
};

const resetAll = async () => {
  confirming.value = false;
  await save([{ path: ["keymap"] }], "All shortcuts reset");
  await focus("#settings-shortcuts-search");
};
const askResetAll = async () => {
  confirming.value = true;
  await focus(".confirm .cancel");
};
const cancelResetAll = async () => {
  confirming.value = false;
  await focus(".reset-all");
};
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
          {{ commandName(info.id) }}
          <small>{{ info.group }}</small>
        </span>
        <button
          type="button"
          class="shortcut-key"
          :class="{
            recording: recording === info.id,
            none: !keymap[info.id],
          }"
          :aria-label="
            keyButton(info.id, keymap[info.id], recording === info.id).label
          "
          :aria-describedby="
            message?.id === info.id ? `shortcut-message-${info.id}` : undefined
          "
          @click="record(info.id)"
          @blur="recording === info.id && stop()"
        >
          {{ keyButton(info.id, keymap[info.id], recording === info.id).text }}
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
