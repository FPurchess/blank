<script setup lang="ts">
import { computed, onMounted } from "vue";

import { trustedCertificates } from "../../state";
import { loadTrusted, untrust } from "../../signing/trusted";
import { groupFingerprint } from "./signingModel";
import EntryList from "./EntryList.vue";

// Settings ▸ Signing, the certificates the user trusts: each with the start
// of its fingerprint, and Remove. One is trusted from a signature's details
// (SignatureDetailsDialog.vue).
onMounted(() => void loadTrusted());

const entries = computed(() =>
  (trustedCertificates.value ?? []).map((certificate) => ({
    key: certificate.fingerprint,
    label: certificate.name,
  })),
);
</script>

<template>
  <h3 class="settings-heading">Trusted certificates</h3>
  <EntryList
    id="settings-trusted"
    label="certificates you trust"
    :entries="entries"
    empty="None yet. Trust a certificate from a signature's details, after you compared its fingerprint."
    :remove-label="(entry) => `Remove ${entry.label}`"
    @remove="untrust"
  >
    <template #default="{ entry }">
      {{ entry.label }}
      <small class="fingerprint"
        >{{ groupFingerprint(entry.key.slice(0, 16)) }} …</small
      >
    </template>
  </EntryList>
</template>
