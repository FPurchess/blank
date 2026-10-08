<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";

import { config } from "../../config";
import { focusBack } from "../../dom";
import { signingCertificate } from "../../state";
import {
  confirmRemoval,
  loadCertificate,
  openCertificateDialog,
  saveCertificate,
} from "../../signing/certificate";
import { certificateSummary } from "../certificateModel";
import CopyFingerprint from "../components/CopyFingerprint.vue";
import SettingRow from "../components/SettingRow.vue";
import TextField from "../components/TextField.vue";
import { enterInField, save } from "./settingsModel";
import { parseTimestampServer, TIMESTAMP_PRESET } from "./signingModel";

// Settings ▸ Signing, its certificate: the user's, with its fingerprint and
// what to do with it, or how to get one; and the timestamp server.
onMounted(() => void loadCertificate());

const summary = computed(() =>
  signingCertificate.value ? certificateSummary(signingCertificate.value) : "",
);
// the first button of the certificate's row, which takes the focus when
// the button that had it goes, e.g. Create… once the certificate is made
const certificateButton = () =>
  document.querySelector<HTMLElement>("#settings-certificate .edit");
const create = (mode: "create" | "import", event: Event) =>
  void openCertificateDialog(
    mode,
    focusBack(event.currentTarget, certificateButton),
  );
const remove = (event: Event) =>
  confirmRemoval(focusBack(event.currentTarget, certificateButton));

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
        <button type="button" class="edit" @click="remove">Remove</button>
      </div>
    </SettingRow>
    <SettingRow
      id="settings-fingerprint"
      name="fingerprint"
      label="Fingerprint"
      description="Tell it to those you send signed PDFs, so they can trust your certificate"
    >
      <div class="signing-mark">
        <CopyFingerprint
          :fingerprint="signingCertificate.fingerprint"
          button-class="edit"
        />
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
      <button type="button" class="edit" @click="create('create', $event)">
        Create…
      </button>
      <button type="button" class="edit" @click="create('import', $event)">
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
  <p id="settings-timestamp-error" class="error" aria-live="polite">
    {{ serverError }}
  </p>
</template>
