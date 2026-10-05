<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef } from "vue";

import { useEditor } from "../../editor/handle";
import {
  closeDialog,
  settingsDialog,
  type SettingsRequest,
  settingsSection,
  type SettingsSection,
} from "../../state";
import BaseDialog from "../components/BaseDialog.vue";
import IconGlyph from "../components/IconGlyph.vue";
import { useRovingFocus } from "../composables/useRovingFocus";
import AboutSection from "./AboutSection.vue";
import AppearanceSection from "./AppearanceSection.vue";
import { enterInField, SECTIONS } from "./settingsModel";
import ShortcutsSection from "./ShortcutsSection.vue";
import SpellingSection from "./SpellingSection.vue";
import WritingSection from "./WritingSection.vue";

// The settings (Mod-,): the sections in a list on the left, the chosen one on
// the right. Every change applies at once, so the only button is Close. The
// dialog is as tall as Appearance on every section, so it never jumps; longer
// sections and the inner pages scroll.
const props = defineProps<{ request: SettingsRequest }>();
const editor = useEditor();

if (props.request.section) settingsSection.value = props.request.section;

const sections = useTemplateRef<HTMLElement>("sections");
const body = useTemplateRef<HTMLElement>("body");

const show = (key: SettingsSection) => {
  settingsSection.value = key;
};
const { current, onKeydown, follow, focusCurrent } = useRovingFocus(
  () => sections.value,
  "[role=tab]",
  SECTIONS.findIndex((section) => section.key === settingsSection.value),
  (index) => show(SECTIONS[index].key),
  "vertical",
);
const choose = (key: SettingsSection, event: MouseEvent) => {
  follow(event.currentTarget);
  show(key);
};

const close = () => closeDialog(settingsDialog, () => editor.focus());

onMounted(async () => {
  // measure Appearance once, and keep every section that tall
  const shown = settingsSection.value;
  settingsSection.value = "appearance";
  await nextTick();
  const height = body.value!.offsetHeight;
  // it may shrink in a low window, never grow
  if (height > 0) body.value!.style.flexBasis = `${height}px`;
  settingsSection.value = shown;
  await nextTick();
  focusCurrent();
});
</script>

<template>
  <BaseDialog
    id="settings-dialog"
    title="Settings"
    form-class="settings"
    @submit="close"
    @cancel="close"
  >
    <div ref="body" class="settings-body">
      <div
        ref="sections"
        class="settings-sections"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Sections"
        @keydown="onKeydown"
      >
        <button
          v-for="(section, index) in SECTIONS"
          :id="`settings-tab-${section.key}`"
          :key="section.key"
          type="button"
          role="tab"
          :aria-selected="settingsSection === section.key"
          aria-controls="settings-panel"
          :tabindex="index === current ? 0 : -1"
          @click="choose(section.key, $event)"
        >
          <IconGlyph :name="section.icon" />
          {{ section.label }}
        </button>
      </div>
      <div
        id="settings-panel"
        class="settings-panel"
        role="tabpanel"
        :aria-labelledby="`settings-tab-${settingsSection}`"
        :data-section="settingsSection"
        tabindex="-1"
        @keydown.enter="enterInField"
      >
        <AppearanceSection v-if="settingsSection === 'appearance'" />
        <WritingSection v-else-if="settingsSection === 'writing'" />
        <SpellingSection v-else-if="settingsSection === 'spelling'" />
        <ShortcutsSection v-else-if="settingsSection === 'shortcuts'" />
        <AboutSection v-else />
      </div>
    </div>
    <template #secondary>
      <p class="note">Changes apply at once.</p>
    </template>
    <template #actions>
      <button type="submit">Close</button>
    </template>
  </BaseDialog>
</template>
