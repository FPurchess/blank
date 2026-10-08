<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";

import { config } from "../../config";
import { signingCertificate } from "../../state";
import {
  forgetCertificate,
  loadCertificate,
  openCertificateDialog,
  saveCertificate,
} from "../../signing/certificate";
import SettingRow from "../components/SettingRow.vue";
import TextField from "../components/TextField.vue";
import { enterInField, save } from "./settingsModel";
import {
  certificateSummary,
  groupFingerprint,
  parseTimestampServer,
  TIMESTAMP_PRESET,
} from "./signingModel";

// Settings ▸ Signing, its certificate: the user's, with its fingerprint and
// what to do with it, or how to get one; and the timestamp server.
onMounted(() => void loadCertificate());

const summary = computed(() =>
  signingCertificate.value ? certificateSummary(signingCertificate.value) : "",
);
const copied = shallowRef(false);
const copy = async () => {
  if (!signingCertificate.value) return;
  await navigator.clipboard.writeText(signingCertificate.value.fingerprint);
  copied.value = true;
};

// the server as typed, saved when it's left or Enter is pressed
const server = shallowRef(config.value.signing.timestampServer);
const serverError = shallowRef("");
const commitServer = () => {
  const parsed = parseTimestampServer(server.value);
  serverError.value = "error" in parsed ? parsed.error : "";
  if (!("url" in parsed)) return;
  server.value = parsed.url;
  if (parsed.url !== config.value.signing.timestampServer)
    void save(
      [{ path: ["signing", "timestampServer"], value: parsed.url }],
      parsed.url
        ? "Timestamps from " + parsed.url
        : "Timestamps from this computer",
    );
};
const usePreset = () => {
  server.value = TIMESTAMP_PRESET;
  commitServer();
};
</script>

<template>
  <h3 class="settings-heading">Certificate</h3>
  <template v-if="signingCertificate">
    <SettingRow
      id="settings-certificate"
      name="certificate"
      :label="signingCertificate.name"
      :description="summary"
    >
      <div class="signing-mark">
        <button type="button" class="edit" @click="saveCertificate(false)">
          Export…
        </button>
        <button type="button" class="edit" @click="saveCertificate(true)">
          Back up key…
        </button>
        <button type="button" class="edit" @click="forgetCertificate">
          Remove
        </button>
      </div>
    </SettingRow>
    <SettingRow
      id="settings-fingerprint"
      name="fingerprint"
      label="Fingerprint"
      description="Tell it to those you send signed PDFs, so they can trust your certificate"
    >
      <div class="signing-mark">
        <code class="fingerprint">{{
          groupFingerprint(signingCertificate.fingerprint)
        }}</code>
        <button type="button" class="edit" @click="copy">
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
    </SettingRow>
  </template>
  <SettingRow
    v-else
    id="settings-certificate"
    name="certificate"
    label="Your certificate"
    description="Signs your PDFs digitally, so anyone can check that you signed them and nothing changed since"
  >
    <div class="signing-mark">
      <button
        type="button"
        class="edit"
        @click="openCertificateDialog('create')"
      >
        Create…
      </button>
      <button
        type="button"
        class="edit"
        @click="openCertificateDialog('import')"
      >
        Import…
      </button>
    </div>
  </SettingRow>
  <SettingRow
    id="settings-timestamp-label"
    name="timestamp"
    label="Timestamp server"
    description="Optional. Proves when you signed. It gets only a fingerprint of your signature"
  >
    <div
      class="compact signing-server"
      @keydown.enter="enterInField($event) && commitServer()"
      @focusout="commitServer"
    >
      <TextField
        id="settings-timestamp"
        v-model="server"
        type="url"
        label="Timestamp server"
        placeholder="https://…"
        :error-id="serverError ? 'settings-timestamp-error' : undefined"
      />
      <button
        v-if="!server"
        type="button"
        class="edit"
        @mousedown.prevent
        @click="usePreset"
      >
        Use DigiCert
      </button>
    </div>
  </SettingRow>
  <p
    v-if="serverError"
    id="settings-timestamp-error"
    class="error"
    role="alert"
  >
    {{ serverError }}
  </p>
</template>
