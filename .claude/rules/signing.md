---
paths:
  - "src/signing/**"
  - "src/editor/commands/signing.ts"
  - "src/ui/Sign*.vue"
  - "src/ui/sign*Model.ts"
  - "src/ui/CertificateDialog.vue"
  - "src/ui/certificateDialogModel.ts"
  - "src/ui/ConfirmDialog.vue"
  - "src/ui/settings/Signing*"
  - "src/ui/settings/signingModel.ts"
  - "src/ui/settings/CertificateRows.vue"
  - "src/markdown/blocks/signature.ts"
  - "src/importers/docx/signatures.ts"
  - "src-tauri/layout/src/items/signature.rs"
---

# Signing

Blank signs what the user writes by exporting a signed PDF; a markdown file never holds a signature. The plan and its later parts (certificates, PAdES, signing received PDFs) are in the e-signing plan; this is what is built.

## The user's signature and initials

- Made in `SignatureDialog.vue` (request `signatureDialog`, opened by `openSignatureDialog` in `src/editor/commands/signing.ts`): Draw (`SignaturePad.vue`, strokes in the pad's own units, `src/signing/pad.ts`), Type (one of `SIGNATURE_FONTS`) or Image (`chooseImageFile`, then `removeBackground`).
- Every kind becomes the same thing: a transparent PNG of the ink, trimmed (`renderMark`, `src/signing/render.ts`; the pixels through `src/images/codec.ts`, the only decoder, and the pure `src/signing/ink.ts`). The pages, the PDF and Word show it as any image, so the layout engine needs no signature fonts.
- Kept as one JSON file each, `signing/signature.json` and `signing/initials.json` in the app config dir (`src/signing/profile.ts`): how it was made, so the dialog opens it as it was, and the PNG as a data URL. Read once, when first needed (`loadMarks`, `src/signing/marks.ts`, again after a failure; `saveMark` and `forgetMark` wait for it, so a late read never overwrites them), published in `savedMarks`. Saving the saved picture on Image unchanged only closes the dialog: cleaning the cleaned PNG again would wear it down. Where the user signed last is `signingPlace`, persisted in localforage like the theme, and remembered once a signed PDF is written.
- The focus: every dialog here gives it back to where it was opened from, on cancel and on success (`cancel` and `done` in the requests): the editor's `view.focus()` from a command, or `focusBack(opener)` (`src/dom.ts`, after the next render, else what took the opener's place, else the first control of the dialog it was in) from Settings or the Sign dialog, which stay open below.
- The fonts are the upstream TTFs in `fonts/`, as they are. Only the webview loads them (`src/signing/fonts.ts`, `FontFace` from the TTF's URL), when the dialog opens: no woff2 copies, so nothing is converted. Dancing Script has a Reserved Font Name, so its file must never change, like Plex; Pinyon Script, Ms Madi and Caveat have none.

## Signature blocks

- `ATOMS.signature` (`src/markdown/blocks/atoms.ts`): `<!-- blank:signature@1 role="…" name="…" place="…" date="signing|none|YYYY-MM-DD" width="NN%" -->`, defaults left out. One signer per block; a contract for two has two blocks. Its words (the lines under the line, its label) come from `src/markdown/blocks/signature.ts` for the pages, the editor's DOM and Word alike.
- The engine item `signature` (`items/signature.rs`): `SIGNATURE_ROOM` above a line `share` of the text's width (0 sends none, for the engine's `SIGNATURE_SHARE`), the image standing on it once signed, else the hint on the screen only (`Part::Hint`), then the lines as extras. Word mirrors `SIGNATURE_ROOM` and `SIGNATURE_SHARE` in `signature.ts`, which `signature.parity.test.ts` compares with the Rust source.
- The lines (`signatureLines`): dates are written as Settings ▸ Signing ▸ Date says in the document's language (`signingDates`, `src/state/signing.ts`), fixed ones too, on the pages (`SyncOptions.dates`, part of what makes the page view flatten again), in the PDF and in Word; the editor's DOM writes ISO dates, having no settings. `date="none"` always leaves a line to write the date by hand. A fixed date must be a day of the calendar (`calendarDate`).
- A signed export fills one block: `ExportContext.signed` (`SignedBlock`: pos, the PNG, who/where/when) goes to `flatten`/`flattenBlocks` (`FlattenOptions`) through the export's own engine (`PageEngine.sync`'s `signed`, part of its sameness key, so no sync keeps a block an earlier one filled in) and the PDF worker's job; the PNG goes into the export's images under `SIGNATURE_IMAGE`. A picture that can't be read fails the export.
- Settings: `SignaturePopover.vue` (request `signaturePopover`) on `components/BlockPopover.vue`, like the table of contents', opened by `editSignature` in `editBlock`'s chain. Width: 50% (the default, written as nothing), 75%, 100%. To move onto `blockCaps.width` once it lands.
- Word: a content control tagged `SIGNATURE_TAG` holding the marker line as hidden text; the import (`signatures.ts`) turns it, and Word's own signature lines (`o:signatureline`), into marker paragraphs of `ATOM_STYLE`, which `cleanup.ts` reads with `readAtom` like a table of contents.

## Certificates and digital signatures (native, `src-tauri/src/signing/`)

- Ported from the spike (`spike/signer` on `spike/signing`, with its SPIKE.md): `keys` (a P-256 key and a self-signed certificate made with rcgen, for document signing, in a PKCS#12 file of 600,000 PBKDF2 rounds, returned with its identity so it isn't read back; any .p12 read, NSS's BER ones through a shim that lets p12-keystore check the MAC on the original bytes and then reads the DER copy without one; `OpenError` says why one doesn't open: `WrongPassphrase`, `Unsupported`, `Malformed`), `cms` (CAdES-BES SignedData over the byte ranges, ESS signing-certificate-v2, no signing-time; a timestamp token as an unsigned attribute), `tsa` (RFC 3161 over reqwest, only the signature value's SHA-256 sent), `pdf` (lopdf's incremental update with our guards: the old trailer cleaned, reconstructed xrefs, encrypted files and DocMDP P=1 refused; a /Sig field and widget with an empty appearance, since the block is in the page content and Blank draws no frame), `verify` (every signature, against USF and wrapping attacks; `valid()` doesn't cover later bytes, `covers_the_whole_file()` does), `certificate` (`CertificateInfo`, the one summary of a certificate, and `common_name` from the name's parts), `commands` (what the webview asks for). HTTP clients come from `src-tauri/src/http.rs`, which installs rustls' provider.
- The key and certificate are `key.p12` and `certificate.cer` in the app config's `signing` folder. The key never goes to the webview: the passphrase comes once per signing (`signing_check_passphrase` before anything is exported, then `signing_sign_pdf` with the PDF as the raw body and the options in the `blank-signing` header), and a signed PDF is checked with `verify` before it's returned (`check_signed`: valid and covering the whole file). `key.p12` is written 0600 on unix, both files through temp files, under one lock with removing them; a key there is replaced only when the call says `replace` (else `keyExists`, which the webview turns into `ConfirmDialog`'s "Replace your key?"), and if the certificate can't be put in place the old key comes back (`keep_files`). The signature names the certificate's holder (its common name) as /Name, never the block's name.
- Errors are typed, never matched by their text: `keys::OpenError` and `signing::Refusal` (`Restricted`, `Certified`, `NoTimestamp`, `TimestampRefused`, `TimestampUnusable`, whose text is the user's sentence). They're logged by context and kind only, never their text, which crypto crates may fill with what they got; the user gets fixed sentences (`SigningError`: `wrongPassphrase`, `noCertificate`, `keyExists`, `failed`). Passphrases are `Zeroizing<String>`.
- The crypto crates are optimized in debug builds (the dev profile in `Cargo.toml`), or opening a key takes minutes; the tests make keys with few rounds (`create_certificate_with`).
- Webview: `src/signing/ipc.ts` (every call; `signingMessage(error, fallback)` with a fallback per action, `signingKind` for the log), `src/signing/certificate.ts` (`signingCertificate`, read once; made, imported, exported, removed after `confirmRemoval`'s question in `ConfirmDialog.vue`, which offers Back up key… first; failures through `reportSigningFailure`), `CertificateDialog.vue` (request `certificateDialog`), `CertificateRows.vue` in Settings ▸ Signing, and the Sign dialog's choice of a digital signature with the passphrase.
- Making a key or checking a passphrase takes seconds: the Certificate dialog says so ("Creating…", a note in a live region) and the Sign dialog ("Checking…"), and neither can be cancelled meanwhile (Cancel and Esc wait), since the certificate or the PDF would still come. Removing the signature or initials asks nothing: they're made again in a moment.

## Export signed PDF

`exportSigned` (`export.signed_pdf`, `Mod-Alt-Shift-p`): no block, a notification; no signature yet, the signature dialog first; then `SignDialog.vue` (request `signDialog`, closed by `closeRequests` before a tab switch: which block (`targetsOf`/`chosenOf`, `src/signing/targets.ts`), the place, digital or a picture only and the passphrase, the Word warning for imported documents; a certificate made from it switches it to digital), then `runExport` (`exportAs.ts`, the save dialog first, " signed" before the extension of the file captured when the command ran) on the editor's state when the dialog closes, the block still at its place or else the one of its number. For a digital signature, its `finish` signs the exported PDF (`signExport`), the field over the block's box, which the export's engine gives (`signatureBox`, `PdfJob.signedPos`); no box or a failure writes nothing.
