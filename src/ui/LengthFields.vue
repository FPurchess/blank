<script setup lang="ts" generic="K extends string">
import TextField from "./components/TextField.vue";
import type { Field } from "./pageSetupModel";

// The fields of a custom size or custom margins in the page setup, below
// their row: one per length, with the unit inside it. The values stay the
// dialog's: a change goes up as `update`.
defineProps<{
  // what the lengths are of, in the fields' ids and as `data-fields`
  name: "paper" | "margins";
  fields: Field<K>[];
  values: Record<K, string>;
  unit: string;
  // the id of what is wrong with the lengths, while something is
  errorId?: string;
}>();
const emit = defineEmits<{ update: [key: K, value: string] }>();
</script>

<template>
  <div class="custom" :data-fields="name">
    <div v-for="field in fields" :key="field.key">
      <TextField
        :id="`page-setup-${name}-${field.key}`"
        :model-value="values[field.key]"
        :label="field.label"
        inputmode="decimal"
        :unit="unit"
        :error-id="errorId"
        @update:model-value="emit('update', field.key, $event)"
      />
    </div>
  </div>
</template>
