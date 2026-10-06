<script setup lang="ts">
import { onMounted, shallowRef } from "vue";

import { _openLink } from "../../editor/plugins/openLink";
import { announce } from "../../state";
import BlankLogo from "../BlankLogo.vue";
import { SOURCE_CODE, WEBSITE } from "../../links";
import { appVersion } from "./aboutModel";
import LicensesPage from "./LicensesPage.vue";
import PagedSection from "./PagedSection.vue";

// About: Blank's name and version, its license, and where to learn more.
const version = shallowRef<string>();
onMounted(async () => {
  version.value = await appVersion();
});

const visit = (url: string) => {
  announce(`Opens ${url} in your browser`);
  void _openLink(url);
};
</script>

<template>
  <PagedSection>
    <template #page="{ back }">
      <LicensesPage @back="back" />
    </template>
    <template #default="{ open }">
      <div class="about">
        <BlankLogo class="about-logo" />
        <div class="about-name">Blank</div>
        <div v-if="version" class="about-version">Version {{ version }}</div>
        <p>
          Free and open source under the GNU Affero General Public License,
          version 3.
        </p>
        <div class="about-links">
          <button type="button" @click="visit(WEBSITE)">Website</button>
          <button type="button" @click="visit(SOURCE_CODE)">Source code</button>
          <button type="button" @click="open('licenses', $event)">
            Licenses of the software Blank uses
          </button>
        </div>
      </div>
    </template>
  </PagedSection>
</template>
