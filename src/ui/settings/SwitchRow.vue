<script setup lang="ts">
import SettingRow from "../components/SettingRow.vue";
import SwitchControl from "../components/SwitchControl.vue";

// A setting that is on or off: its row with the label and the description,
// and the switch on the right, which the label names. A click on the label
// switches it too.
const props = defineProps<{
  id: string;
  name: string;
  label: string;
  description?: string;
}>();
const on = defineModel<boolean>({ required: true });

const clickLabel = (event: MouseEvent) => {
  if ((event.target as Element).closest(".setting-label")) on.value = !on.value;
};
</script>

<template>
  <SettingRow
    :id="id"
    :name="name"
    :label="label"
    :description="description"
    class="switch-setting"
    @click="clickLabel"
  >
    <SwitchControl
      v-model="on"
      :aria-labelledby="id"
      :aria-describedby="
        props.description ? `${props.id}-description` : undefined
      "
    />
  </SettingRow>
</template>
