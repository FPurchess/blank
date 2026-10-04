<script setup lang="ts">
import { announcement } from "../state";
import LanguageChooser from "./LanguageChooser.vue";
import MisspellingButtons from "./MisspellingButtons.vue";
import PageButton from "./PageButton.vue";
import PageStatus from "./PageStatus.vue";
import SpellcheckStatus from "./SpellcheckStatus.vue";
import ViewButton from "./ViewButton.vue";
import WordCount from "./WordCount.vue";

// The status bar at the bottom of the window: the word count and what just
// happened on the left; the page in view, the paper, the language, spell
// check and the view on the right. Every item is a button (StatusItem.vue)
// and a component of its own, so typing only updates the word count.
</script>

<template>
  <footer id="ui-bottom">
    <WordCount />
    <!-- what just happened, e.g. "2 rows added": shown for a moment and read
    out by screen readers, so it's always there, empty in between. It sits
    next to the counter, so it doesn't push the items on the right. -->
    <span id="ui-announcement" role="status">{{
      announcement?.text ?? ""
    }}</span>
    <span class="status-grow" />
    <PageStatus />
    <PageButton />
    <LanguageChooser />
    <SpellcheckStatus />
    <MisspellingButtons />
    <ViewButton />
  </footer>
</template>
