<script setup lang="ts">
import {
  type ComponentPublicInstance,
  computed,
  nextTick,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { config } from "../config";
import {
  closeDialog,
  savedMarks,
  signDialog,
  type SignDialogRequest,
  signingCertificate,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import MenuButton from "./components/MenuButton.vue";
import OptionGroup from "./components/OptionGroup.vue";
import SettingRow from "./components/SettingRow.vue";
import SwitchControl from "./components/SwitchControl.vue";
import TextField from "./components/TextField.vue";
import {
  canSign,
  dateNote,
  emptyFieldsNote,
  type How,
  initialsProblem,
  namedNote,
  NO_INITIALS,
  othersNote,
  placeNote,
  SIDE_OPTIONS,
  signAsItems,
  signAsText,
  stampNote,
  timeNote,
} from "./signDialogModel";

// Signs, for both flows (see src/editor/commands/signing.ts): a document
// exported as a PDF with one of its signature blocks filled in ("export"),
// or a PDF tab with what the user placed on its pages ("pdf"). It chooses
// whether the user's certificate signs too (with its passphrase), the
// block, the initials on every page, the place and the reason; then the
// request asks where the signed PDF goes. A block that names someone or
// fixes its place keeps them, which the dialog says.
const props = defineProps<{ request: SignDialogRequest }>();

const exporting = props.request.mode === "export";
const chosen = shallowRef(props.request.chosen);
const place = shallowRef(props.request.place);
const reason = shallowRef("");
const how = shallowRef<How>(signingCertificate.value ? "digital" : "visible");
const passphrase = shallowRef("");
const failure = shallowRef("");
const checking = shallowRef(false);
const initialsOn = shallowRef(props.request.initials.on);
const side = shallowRef(props.request.initials.side);
const checked = shallowRef(false);
const open = shallowRef(true);
const certificateName = computed(() =>
  signingCertificate.value ? signingCertificate.value.name : null,
);
const digital = computed(
  () => !!signingCertificate.value && how.value === "digital",
);
const note = computed(() => timeNote(config.value.signing.timestampServer));
const target = computed(() =>
  props.request.targets.find((target) => target.pos === chosen.value),
);
// a block that says where it's signed is signed there, whatever is typed
const fixedPlace = computed(() => (exporting ? placeNote(target.value) : ""));
const named = computed(() => namedNote(target.value, props.request.signer));
const dated = computed(() => dateNote(target.value, props.request.today));
const others = exporting ? othersNote(props.request.targets) : "";
const emptyFields = emptyFieldsNote(props.request.emptyFields);
const stamp = computed(() =>
  exporting ? "" : stampNote(props.request.stamped, digital.value),
);
// why the initials can't go on every page, "" when they can
const initialsBlocked = computed(() =>
  initialsProblem(props.request.initials.reason, !!savedMarks.value?.initials),
);
const signs = computed(() =>
  canSign({
    stamped: props.request.stamped,
    digital: digital.value,
    confirmPages: props.request.confirmPages,
    checked: checked.value,
  }),
);

const signAs = useTemplateRef<ComponentPublicInstance>("signAs");
const placeField = useTemplateRef<InstanceType<typeof TextField>>("placeField");
const passphraseField =
  useTemplateRef<InstanceType<typeof TextField>>("passphraseField");
// the place, or with the block's own place the passphrase; else BaseDialog
// gives its first control the focus
onMounted(() =>
  (
    placeField.value ?? (digital.value ? passphraseField.value : null)
  )?.select(),
);

// a certificate made from here signs at once: on to its passphrase
watch(signingCertificate, (now, before) => {
  if (!now || before) return;
  how.value = "digital";
  void nextTick(() => passphraseField.value?.select());
});
// initials made from here go on every page
watch(
  () => !!savedMarks.value?.initials,
  (now, before) => {
    if (now && !before && !initialsBlocked.value) initialsOn.value = true;
  },
);
// a PDF tab shows the change at once
watch([initialsOn, side], ([on, side]) =>
  props.request.setInitials?.({ on, side }),
);

// once Sign as's menu closes: the passphrase when there's one to type
const afterSignAs = () => {
  if (digital.value) passphraseField.value?.select();
  else (signAs.value?.$el as HTMLElement | undefined)?.focus();
};
const signAsMenu = () =>
  signAsItems({
    certificate: certificateName.value,
    how: how.value,
    choose: (chosen) => {
      how.value = chosen;
      failure.value = "";
    },
    create: () =>
      props.request.createCertificate(
        (signAs.value?.$el as HTMLElement | undefined) ?? null,
      ),
    manage: () => close(props.request.manage),
  });

const close = (callback: () => void) => closeDialog(signDialog, callback);
// the passphrase being checked can't be cancelled, the PDF would still come
const cancel = () => {
  if (!checking.value) close(props.request.cancel);
};
const submit = async () => {
  if (checking.value || !signs.value) return;
  if (digital.value) {
    if (!passphrase.value) {
      failure.value = "Enter the passphrase of your key.";
      passphraseField.value?.select();
      return;
    }
    // the passphrase is checked before anything is exported
    checking.value = true;
    const problem = await props.request.check(passphrase.value);
    // closed meanwhile, e.g. as another tab showed: nothing is signed
    if (signDialog.value !== props.request) return;
    checking.value = false;
    failure.value = problem ?? "";
    // a wrong one is selected, to type it again
    if (failure.value) return passphraseField.value?.select();
  }
  const choices = {
    pos: exporting ? chosen.value : null,
    place: place.value.trim(),
    reason: reason.value.trim(),
    passphrase: digital.value ? passphrase.value : null,
    initials: {
      on: initialsOn.value && !initialsBlocked.value,
      side: side.value,
    },
    open: open.value,
  };
  close(() => props.request.submit(choices));
};
</script>

<template>
  <BaseDialog
    id="sign-dialog"
    :title="`Sign “${request.title}”`"
    form-class="sign-dialog"
    @submit="submit"
    @cancel="cancel"
  >
    <SettingRow id="sign-dialog-how-label" name="how" label="Sign as">
      <MenuButton
        id="sign-dialog-how"
        ref="signAs"
        class="select"
        label="Sign as"
        :text="signAsText(how, certificateName)"
        :items="signAsMenu"
        :refocus="afterSignAs"
      />
    </SettingRow>
    <OptionGroup
      v-if="exporting && request.targets.length > 1"
      id="sign-dialog-target"
      v-model="chosen"
      name="target"
      label="Sign in"
      :options="
        request.targets.map((target) => ({
          value: target.pos,
          label: target.label,
        }))
      "
    />
    <SettingRow
      id="sign-dialog-initials-label"
      name="initials"
      label="Initials"
    >
      <SwitchControl
        id="sign-dialog-initials"
        :model-value="initialsOn && !initialsBlocked"
        :disabled="!!initialsBlocked"
        :aria-describedby="
          initialsBlocked ? 'sign-dialog-initials-note' : undefined
        "
        @update:model-value="initialsOn = $event"
      >
        On every page
      </SwitchControl>
    </SettingRow>
    <p v-if="initialsBlocked" id="sign-dialog-initials-note" class="note">
      {{ initialsBlocked }}
      <button
        v-if="initialsBlocked === NO_INITIALS"
        id="sign-dialog-make-initials"
        type="button"
        class="make-initials"
        @click="request.createInitials($event.currentTarget)"
      >
        Add your initials…
      </button>
    </p>
    <OptionGroup
      v-if="initialsOn && !initialsBlocked"
      id="sign-dialog-initials-side"
      v-model="side"
      name="initials-side"
      label="Corner"
      :options="SIDE_OPTIONS"
    />
    <TextField
      v-if="!fixedPlace"
      id="sign-dialog-place"
      ref="placeField"
      v-model="place"
      label="Place"
      placeholder="Where you sign"
    />
    <p v-else id="sign-dialog-fixed-place" class="note">{{ fixedPlace }}</p>
    <p v-if="named" id="sign-dialog-named" class="warning">{{ named }}</p>
    <p v-if="dated" id="sign-dialog-date" class="note">{{ dated }}</p>
    <TextField
      id="sign-dialog-reason"
      v-model="reason"
      label="Reason"
      placeholder="Optional, e.g. I agree to these terms"
    />
    <TextField
      v-if="digital"
      id="sign-dialog-passphrase"
      ref="passphraseField"
      v-model="passphrase"
      type="password"
      label="Passphrase"
      :error-id="failure ? 'sign-dialog-error' : undefined"
      @input="failure = ''"
    />
    <p id="sign-dialog-error" class="error" aria-live="polite">
      {{ failure }}
    </p>
    <p id="sign-dialog-status" class="note" aria-live="polite">
      {{ checking ? "Checking your passphrase." : "" }}
    </p>
    <p v-for="warning in request.warnings" :key="warning" class="warning">
      {{ warning }}
    </p>
    <SwitchControl
      v-if="request.confirmPages"
      id="sign-dialog-checked"
      v-model="checked"
    >
      I checked every page
    </SwitchControl>
    <p v-if="stamp" id="sign-dialog-stamp" class="note">{{ stamp }}</p>
    <p v-if="emptyFields" id="sign-dialog-empty" class="note">
      {{ emptyFields }}
    </p>
    <p v-if="others" id="sign-dialog-others" class="note">{{ others }}</p>
    <p v-if="digital" class="note">{{ note }}</p>
    <template v-else-if="!request.stamped" />
    <p v-else-if="!signingCertificate" class="note">
      The PDF shows your signature as a picture. A certificate also signs it
      digitally, so PDF apps show whether anything changed after you signed.
    </p>
    <p v-else class="note">The PDF shows your signature as a picture.</p>
    <SwitchControl v-if="!exporting" id="sign-dialog-open" v-model="open">
      Open the signed PDF
    </SwitchControl>
    <template #actions>
      <button type="button" :disabled="checking" @click="cancel">Cancel</button>
      <button type="submit" :disabled="checking || !signs">
        {{ checking ? "Checking…" : "Sign…" }}
      </button>
    </template>
  </BaseDialog>
</template>
