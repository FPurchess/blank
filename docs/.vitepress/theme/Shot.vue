<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useData, withBase } from "vitepress";

// A picture of the app from docs/public/screenshots/, as the site's theme is
// light or dark: e2e/shots/ captures each in the light theme as `<src>` and
// in the dark one as `<src>-dark` (see e2e/shots/shots.ts). `single` has the
// light one only, e.g. a recording that switches themes itself.
//
// A GIF plays from its start when most of it scrolls into view, and starts
// over each time it comes back; until then it shows its first frame. With
// reduced motion, it plays only when clicked. Without JavaScript, the
// pictures are plain lazy images, the light or the dark one by CSS.
const props = defineProps<{ src: string; alt: string; single?: boolean }>();
const { isDark } = useData();

const light = computed(() => withBase(`/screenshots/${props.src}`));
const dark = computed(() =>
  withBase(`/screenshots/${props.src.replace(/(\.[a-z]+)$/, "-dark$1")}`),
);
const isGif = computed(() => props.src.endsWith(".gif"));

// whether the GIF is under the component's control, once mounted
const controlled = ref(false);
// the GIF of the site's theme
const shown = computed(() =>
  isDark.value && !props.single ? dark.value : light.value,
);
const playing = ref(false);
// a new fragment makes the browser start the GIF over, from its cache:
// images of the same address share where their animation is
const round = ref(0);
const root = ref<HTMLElement | null>(null);
const poster = ref<HTMLCanvasElement | null>(null);

/** draws the first frame of the GIF, which an image not on the page shows */
const drawPoster = () => {
  const image = new Image();
  image.onload = () => {
    const canvas = poster.value;
    if (!canvas) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
  };
  image.src = shown.value;
};

const play = () => {
  round.value++;
  playing.value = true;
};

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let observer: IntersectionObserver | undefined;

onMounted(async () => {
  if (!isGif.value) return;
  controlled.value = true;
  await nextTick();
  watch(shown, drawPoster, { immediate: true });
  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) playing.value = false;
      else if (!playing.value && !reducedMotion()) play();
    },
    { threshold: 0.5 },
  );
  observer.observe(root.value!);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <span v-if="controlled" ref="root" class="shot-box" @click="play">
    <img v-if="playing" class="shot" :src="`${shown}#${round}`" :alt="alt" />
    <canvas
      v-show="!playing"
      ref="poster"
      class="shot"
      role="img"
      :aria-label="alt"
      :title="reducedMotion() ? 'Click to play' : undefined"
    />
  </span>
  <span v-else class="shot-box">
    <img
      class="shot"
      :class="{ 'shot-light': !single }"
      :src="light"
      :alt="alt"
      loading="lazy"
    />
    <img
      v-if="!single"
      class="shot shot-dark"
      :src="dark"
      :alt="alt"
      loading="lazy"
    />
  </span>
</template>

<style scoped>
.shot-box {
  display: block;
}
canvas.shot {
  height: auto;
}
</style>
