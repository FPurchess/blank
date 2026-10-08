---
paths:
  - "src/signing/**"
  - "src/editor/commands/signing.ts"
  - "src/ui/Sign*.vue"
  - "src/ui/sign*Model.ts"
  - "src/ui/settings/Signing*"
  - "src/ui/settings/signingModel.ts"
  - "src/markdown/blocks/signature.ts"
  - "src/importers/docx/signatures.ts"
  - "src-tauri/layout/src/items/signature.rs"
---

# Signing

Blank signs what the user writes by exporting a signed PDF; a markdown file never holds a signature. The plan and its later parts (certificates, PAdES, signing received PDFs) are in the e-signing plan; this is what is built.

## The user's signature and initials

- Made in `SignatureDialog.vue` (request `signatureDialog`, opened by `openSignatureDialog` in `src/editor/commands/signing.ts`): Draw (`SignaturePad.vue`, strokes in the pad's own units, `src/signing/pad.ts`), Type (one of `SIGNATURE_FONTS`) or Image (`chooseImageFile`, then `removeBackground`).
- Every kind becomes the same thing: a transparent PNG of the ink, trimmed (`renderMark`, `src/signing/render.ts`; the pixels through `src/images/codec.ts`, the only decoder, and the pure `src/signing/ink.ts`). The pages, the PDF and Word show it as any image, so the layout engine needs no signature fonts.
- Kept as one JSON file each, `signing/signature.json` and `signing/initials.json` in the app config dir (`src/signing/profile.ts`): how it was made, so the dialog opens it as it was, and the PNG as a data URL. Read once, when first needed (`loadMarks`, `src/signing/marks.ts`), published in `savedMarks`. Where the user signed last is `signingPlace`, persisted in localforage like the theme.
- The fonts are the upstream TTFs in `fonts/`, as they are. Only the webview loads them (`src/signing/fonts.ts`, `FontFace` from the TTF's URL), when the dialog opens: no woff2 copies, so nothing is converted. Dancing Script has a Reserved Font Name, so its file must never change, like Plex; Pinyon Script, Ms Madi and Caveat have none.

## Signature blocks

- `ATOMS.signature` (`src/markdown/blocks/atoms.ts`): `<!-- blank:signature@1 role="…" name="…" place="…" date="signing|none|YYYY-MM-DD" width="NN%" -->`, defaults left out. One signer per block; a contract for two has two blocks. Its words (the lines under the line, its label) come from `src/markdown/blocks/signature.ts` for the pages, the editor's DOM and Word alike.
- The engine item `signature` (`items/signature.rs`): `SIGNATURE_ROOM` above a line `share` of the text's width, the image standing on it once signed, else the hint on the screen only (`Part::Hint`), then the lines as extras. Word mirrors `SIGNATURE_ROOM` and `SIGNATURE_SHARE` in `signature.ts`.
- A signed export fills one block: `ExportContext.signed` (pos, the PNG, who/where/when) goes to `flatten`/`flattenBlocks` (`SignedBlock`) through `PageEngine.sync`'s `signed` and the PDF worker's job, and the PNG into the export's images.
- Settings: `SignaturePopover.vue` (request `signaturePopover`), opened by `editSignature` in `editBlock`'s chain, like the table of contents' settings. To move onto the shared block popover and `blockCaps.width` once they land.
- Word: a content control tagged `SIGNATURE_TAG` holding the marker line as hidden text; the import (`signatures.ts`) turns it, and Word's own signature lines (`o:signatureline`), into marker paragraphs of `ATOM_STYLE`, which `cleanup.ts` reads with `readAtom` like a table of contents.

## Certificates and digital signatures (native, `src-tauri/src/signing/`)

- Ported from the spike (`spike/signer` on `spike/signing`, with its SPIKE.md): `keys` (a P-256 key and a self-signed certificate made with rcgen, for document signing, in a PKCS#12 file of 600,000 PBKDF2 rounds; any .p12 read, NSS's BER ones through a shim), `cms` (CAdES-BES SignedData over the byte ranges, ESS signing-certificate-v2, no signing-time; a timestamp token as an unsigned attribute), `tsa` (RFC 3161 over reqwest, only the signature value's SHA-256 sent), `pdf` (lopdf's incremental update with our guards: the old trailer cleaned, reconstructed xrefs, encrypted files and DocMDP P=1 refused; a /Sig field and widget with an empty appearance, since the block is in the page content and Blank draws no frame), `verify` (every signature, against USF and wrapping attacks), `commands` (what the webview asks for).
- The key and certificate are `key.p12` and `certificate.cer` in the app config's `signing` folder. The key never goes to the webview: the passphrase comes once per signing (`signing_check_passphrase` before anything is exported, then `signing_sign_pdf` with the PDF as the raw body and the options in the `blank-signing` header), and a signed PDF is checked with `verify` before it's returned.
- Errors are logged by context and kind only (`kind_of`), never their text, which crypto crates may fill with what they got; the user gets fixed sentences (`SigningError`: `wrongPassphrase`, `noCertificate`, `failed`).
- The crypto crates are optimized in debug builds (the dev profile in `Cargo.toml`), or opening a key takes minutes; the tests make keys with few rounds (`create_certificate_with`).
- Webview: `src/signing/ipc.ts` (every call), `src/signing/certificate.ts` (`signingCertificate`, read once; made, imported, exported, removed), `CertificateDialog.vue` (request `certificateDialog`), `CertificateRows.vue` in Settings ▸ Signing, and the Sign dialog's choice of a digital signature with the passphrase.

## Export signed PDF

`exportSigned` (`export.signed_pdf`): no block, a notification; no signature yet, the signature dialog first; then `SignDialog.vue` (request `signDialog`: which block, the place, digital or a picture only and the passphrase, the Word warning for imported documents), then `runExport` (`exportAs.ts`, the save dialog first, " signed" before the extension). For a digital signature, its `finish` signs the exported PDF (`signExport`), the field over the block's box, which the export's engine gives (`signatureBox`, `PdfJob.signedPos`); a failure writes nothing.
