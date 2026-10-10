<script setup lang="ts">
import { announcement, shownPdf } from "../state";
import FocusModeButton from "./FocusModeButton.vue";
import LanguageChooser from "./LanguageChooser.vue";
import MisspellingButtons from "./MisspellingButtons.vue";
import PageButton from "./PageButton.vue";
import PageStatus from "./PageStatus.vue";
import SignaturesStatus from "./SignaturesStatus.vue";
import SpellcheckStatus from "./SpellcheckStatus.vue";
import ViewButton from "./ViewButton.vue";
import ZoomControl from "./ZoomControl.vue";
import WordCount from "./WordCount.vue";

// The status bar at the bottom of the window: the word count and what just
// happened on the left; the page in view, the paper, the language, spell
// check, the zoom, the view and focus mode on the right. Every item is a
// button (StatusItem.vue) and a component of its own, so typing only updates
// the word count. A PDF tab, which holds no text, shows the page in view,
// what its signatures say, the paper and the zoom.
</script>

<template>
  <footer id="ui-bottom">
    <WordCount v-if="!shownPdf" />
    <!-- what just happened, e.g. "2 rows added": shown for a moment and read
    out by screen readers, so it's always there, empty in between. It sits
    next to the counter, so it doesn't push the items on the right. -->
    <span id="ui-announcement" role="status">{{
      announcement?.quiet ? "" : announcement?.text
    }}</span>
    <!-- what only screen readers hear, e.g. which tab is now open -->
    <span id="ui-announcement-spoken" class="visually-hidden" role="status">{{
      announcement?.quiet ? announcement.text : ""
    }}</span>
    <span class="status-grow" />
    <PageStatus />
    <SignaturesStatus v-if="shownPdf" />
    <PageButton />
    <template v-if="!shownPdf">
      <LanguageChooser />
      <SpellcheckStatus />
      <MisspellingButtons />
    </template>
    <ZoomControl />
    <template v-if="!shownPdf">
      <ViewButton />
      <FocusModeButton />
    </template>
  </footer>
</template>
