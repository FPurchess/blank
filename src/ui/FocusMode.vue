<script setup lang="ts">
import { controlsFaded, focusMode } from "../state";
import { useBodyClass } from "./composables/useBodyClass";
import { watchFocusMode } from "./focusModeModel";

// Focus mode, which renders nothing: the classes on the body that fade the
// controls (src/scss/_focusMode.scss), and when they fade and come back
// (focusModeModel.ts).
useBodyClass("focus-mode", () => focusMode.value);
useBodyClass("controls-faded", () => controlsFaded.value);
watchFocusMode();
</script>

<template></template>
