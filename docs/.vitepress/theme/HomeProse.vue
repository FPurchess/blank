<template>
  <section class="home-prose">
    <p class="lead">
      Every piece of writing begins the same way: an empty page, a blinking
      cursor, and the quiet question of what comes next.
    </p>
    <p>
      Blank is made for that moment and for everything after it. There are no
      toolbars, no buttons, no panels asking for your attention. There is the
      page and the sentence you are writing. Your hands stay on the keyboard,
      and the formatting follows them: type <kbd>#</kbd> and a space, and a
      heading appears, press <kbd>Mod</kbd> <kbd>I</kbd> and your words lean
      into italics.
    </p>
    <p>
      The small things take care of themselves. Quotes curl, dashes find their
      length, and a new sentence starts with a capital letter in the language
      you write in. Underneath, it’s plain markdown, so your writing stays
      yours.
    </p>
  </section>
</template>

<style scoped>
.home-prose {
  max-width: 680px;
  margin: 0 auto;
  padding: 16px 24px 72px;
  font-size: 18px;
  line-height: 1.75;
  color: var(--vp-c-text-2);
}
.home-prose p + p {
  margin-top: 20px;
}
.lead {
  font-size: 24px;
  line-height: 1.5;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}
kbd {
  padding: 1px 6px;
  border: 1px solid var(--vp-c-divider);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.8em;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}
</style>
