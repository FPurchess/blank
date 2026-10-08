---
paths:
  - "src/pdf/**"
  - "src/ui/Pdf*.vue"
  - "src/ui/pdf*.ts"
  - "src/ui/Signature*.vue"
  - "src/ui/signature*.ts"
  - "src/ui/SignaturesStatus.vue"
  - "src/ui/settings/TrustedRows.vue"
  - "src/state/pdf.ts"
  - "src/signing/trusted.ts"
  - "src-tauri/pdf/**"
  - "src-tauri/system-fonts/**"
  - "src-tauri/src/pdf_view/**"
  - "src-tauri/src/signing/trust.rs"
  - "scripts/build-pdf-helper.ts"
  - "scripts/build-pdf-fixtures.ts"
  - "scripts/check-mupdf-notices.ts"
  - "scripts/notices/mupdf.toml"
---

# PDF tabs

Blank opens PDFs in tabs of their own, shows their pages as MuPDF draws them, and checks their signatures. It never changes a PDF in a tab (stamps, form fills and signing received PDFs come with PR 3b of the e-signing plan).

## The helper (`src-tauri/pdf`)

- **One helper process per PDF tab:** `blank-pdf` (crate `blank-pdf`, `src-tauri/pdf/helper`), a Tauri sidecar (`bundle.externalBin`), started by the app with `std::process` (no shell plugin). A PDF that crashes or hangs MuPDF takes down only its tab.
- **MuPDF 1.28.5** is the git submodule `src-tauri/pdf/mupdf-sys/mupdf`, pinned to Artifex's tag `1.28.5` (8ad45e92f0935d3d87f1db3f873086472a5e1b24), with its own third-party submodules. `src-tauri/pdf/mupdf-sys` is mupdf-sys 0.8.0's build glue (build.rs, make.rs, msbuild.rs, docs.rs, src/lib.rs, wrapper/), unchanged, which `[patch.crates-io]` puts in place of the crates.io crate, so it builds the submodule. Default features off, with the URW base 14 fonts. A `.ignore` there keeps cargo-about from scanning MuPDF's sources.
  - **Bumping MuPDF:** move the submodule to the new tag (`git -C src-tauri/pdf/mupdf-sys/mupdf fetch --depth 1 origin tag X && git checkout X`, then `git submodule update --init --recursive` in it), build, `bun scripts/check-mupdf-notices.ts`, `make notices`, and the tests.
  - **AGPL:** MuPDF is AGPL-3.0, like Blank. The helper's corresponding source is Artifex's tag plus our glue and shim in this repository (`src-tauri/pdf`); the FAQ says so.
- **The shim** (`helper/shim/blank_mupdf.c`) is the only code that calls MuPDF: every entry point is inside `fz_try`, so an exception is a status, never an abort. It has its own `fz_context` with a counting allocator (the memory cap: past `--memory-limit-mb`, 1536 MB, an allocation fails and the request answers `tooComplex`), a cookie to cancel a render, our font loader, and writes the form's fields and signatures as JSON (`blank_form_json`). Rust calls it through `helper/src/mupdf.rs` only, never mupdf-sys's bindings.
- **Fonts:** a font a PDF names but doesn't embed comes from the system through `blank-system-fonts` (`src-tauri/system-fonts`, the lookup the app's `fallback_fonts` uses too): a family by name, or the CJK font of an Adobe ordering by script and language. Only fonts a PDF may embed (`embeddable`).
- **The protocol** (`src-tauri/pdf/ipc`, crate `blank-pdf-ipc`, no MuPDF, no Tauri): frames `"BPF1" | header len u32 LE | body len u64 LE | JSON header | body` (`frame.rs`) over the helper's stdin/stdout; version 1 (`protocol.rs`): the helper's first frame is a hello with `protocol` and `ops`; ops `open` (body: the PDF), `pages`, `render` (answer body: RGBA, opaque), `fields`, `signatures`, `cancel`, `ping`. A breaking change raises `PROTOCOL` and the magic; a new op is optional within v1 (`unknownOp`). Positions are display points: from the top left of the crop box after `/Rotate`, UserUnit applied. `engine.rs` is the `PdfEngine`/`PdfDoc` traits MuPDF implements (a PDFium one would fit behind the same traits), `serve.rs` the helper's loop (a reader thread that takes `cancel` at once, the engine on the main thread), `client.rs` the app's side.
- **The helper's stdout carries frames only:** at start it dups fd 1 to a private fd for the frames and points fd 1 at stderr (`main.rs`). Its stderr is null in release builds (MuPDF's warnings may quote the PDF), inherited in debug builds.
- **Limits** (`client.rs`, `limits.rs`): the counting allocator first; then Linux's `RLIMIT_AS` of 4 GB and `PR_SET_PDEATHSIG`; on macOS a thread that kills a helper whose footprint passes 2.5 GB; on Windows a job object (2.5 GB, killed with Blank) and no console window. Timeouts: start 10 s, open 20 s, render and the rest 15 s; then `cancel`, and 1 s later a kill (a hang). stdin's end makes the helper exit.
- **Restart policy** (`Supervisor`): a crash or a hang is a failure. After the first, the next request starts a new helper, which opens the PDF again (the bytes the supervisor holds, or the file read again and checked against its SHA-256); the request that failed isn't asked again. After the second, `Failed`: the tab shows "Blank can't show this PDF any more", and **Open again** makes a new supervisor. A helper unused for 2 minutes, or past 4 running, least recently used first, is stopped, which isn't a failure.

## The app's side (`src-tauri/src/pdf_view`)

- `PdfTabs` keeps each tab's supervisor, file and SHA-256; `pdf_open` reads the file, starts the helper and returns the pages (`Opened`); `pdf_render` returns the pixels with the width and height as two u32 LE at the end (raw RGBA through `tauri::ipc::Response`, no image protocol); `pdf_cancel`, `pdf_close`; `pdf_verify` reads the file again, checks its SHA-256, and checks its signatures (below).
- Failures reach the webview as a kind (`PdfError::kind`) and the log as `PDF: <what>: <kind>`; the path of a PDF opened is logged at info. Never what a PDF holds.
- The helper is next to the app (`current_exe().parent()/blank-pdf[.exe]`), where Tauri puts `externalBin` in every package; in debug builds `BLANK_PDF_HELPER` may point elsewhere.

## Building and packaging

- `scripts/build-pdf-helper.ts` (`make pdf-helper`, `bun run pdf-helper`) builds the helper optimized for `TAURI_ENV_TARGET_TRIPLE` (or the host), with `MACOSX_DEPLOYMENT_TARGET=12.0`, and copies it to `src-tauri/binaries/blank-pdf-<triple>[.exe]` (git-ignored). `beforeBuildCommand`, `beforeDevCommand` and `test:rust` run it: tauri-build fails any build of the app crate without it. The first build compiles MuPDF, a few minutes; the dev profile builds mupdf-sys at opt-level 3 too.
- The `.deb` and `.rpm` have `usr/bin/blank-pdf`, and the snap repackages the `.deb`, so it's `$SNAP/usr/bin/blank-pdf`. `test-on-pr.yml` checks the packages, the glibc floor of both binaries, that the helper runs, and its macOS minos.
- Notices: `scripts/notices/mupdf.toml` lists MuPDF, the URW fonts and the libraries of `thirdparty/` the build compiles, with their licence files in the submodule, which `build-notices.ts` quotes; `check-mupdf-notices.ts` (the `pdf` job) fails when the build compiled a library the list hasn't, or the other way round.
- Blank is registered as an alternate PDF viewer (`fileAssociations` role Viewer, rank Alternate; `application/pdf` in `linux/blank.desktop`), never the default.

## The webview

- **Tabs** (`src/editor/tabs.ts`, see `tabs.md`): `Tab.kind: "pdf"`. A PDF tab's `TabDocument` holds its `pdf` (`PdfTabDocument`, `src/pdf/document.ts`: the path, what opening found, the problem that shows instead of the pages, the pages that failed, the checked signatures) and an empty placeholder state (`src/pdf/placeholder.ts`), whose plugin drops every change of the document and hands the focus the editor gets on to the PDF's pages. The shown tab's PDF is `shownPdf` (`src/state/pdf.ts`); `path` and `importedFrom` are null in a PDF tab, so nothing that saves or exports markdown sees its path. Storage keeps no document of a PDF tab; it reads the PDF again when it shows. `reopenPdf` is Open again and Find it…, `forgetSignatureChecks` has the signatures checked again.
- **Commands** (`src/pdf/commands.ts`): `commandFor` and the keys run every command through `forPdf`; in a PDF tab the commands of the text can't run (`editor.can` is false, so the toolbar shows them disabled) and their keys announce why (`pdfRefusal`). The window's, the tabs' and the app's commands run as anywhere.
- **The view** (`src/ui/PdfView.vue`, `PdfPage.vue`, `pdfViewModel.ts`): in place of `#page-view` (`body.pdf-tab`), `#pdf-view` places the pages with `sheetLayout` (`src/engine/frames.ts`, which the markdown pages' "pages" view uses too: one scale for the widest page, each centred), mounts those near the view, and asks for those without a bitmap through `RenderQueue` (`src/pdf/renderQueue.ts`: one at a time, those in view first, dropped or cancelled once they leave). A page is drawn at the next eighth above the frame's scale × the device pixel ratio, at most 16 MP (`renderScale`, `MAX_PAGE_PIXELS`, matching the helper's `MAX_PIXELS`); while it's drawn, the last bitmap shows stretched. Bitmaps go into `pdfBitmaps` (`src/ui/pageBitmaps.ts`), an LRU of its own (128 MB), so a PDF never evicts the markdown pages' bitmaps; a closed tab's go. It holds the focus (`pdfViewFocused` in `uiTakesFocus`), scrolls with the keys, and publishes `pdfPageInView` for "Page N of M". The status bar shows the page, the signatures and the paper of the first page (`pdfPaper`); the word count, language, spelling, view and focus mode items hide.
- **Zoom:** PDF tabs show at Fit only. When main-menu's zoom lands (`pageZoom`, `sheetScale` in `frames.ts` on `design/main-menu`), `sheetLayout` takes the zoom the same way `frameLayout` does, through `sheetScale("pages", widest, width, zoom)`; nothing else changes.
- **Print:** there's no print on this branch; when print-menu's hand-off lands, a PDF tab hands it the PDF's bytes, never Blank's layout options.

## Signatures (`src-tauri/src/signing/trust.rs`, `src/ui/Signature*.vue`)

- `verify.rs` checks each signature (see `signing.md`); `Coverage` says how much of the file it covers. A timestamp token that can't be read leaves `timestamp_unreadable` set and isn't a failing check; one that doesn't hold is.
- `trust.rs`: `classify` → `own` (the user's `certificate.cer`), `trusted` (`signing/trusted/<FINGERPRINT>.cer`, written by `signing_trust` after the user confirmed the fingerprint, removed by `signing_untrust`), `issuedBy` (not self-signed: Blank checks neither certificate authorities nor revocation), `unknown`; `status` → `valid` (whole file, or only validation data later), `signedAgainLater`, `changedAfterSigning`, `invalid`; `checked` makes the `CheckedSignature` the webview shows (the time from the timestamp, else `/M`, in ISO 8601).
- The webview: `signaturesModel.ts` says it in words: own and trusted are "Valid", the others only "Intact · issued by …" or "Intact · signer unknown"; the status bar's item (`SignaturesStatus.vue`, command `view.signatures`, no key) sums them up ("Not signed", "Signed", "Signed by 2", "Signed, signer unknown", "Changed after signing", "Signature invalid"); `SignaturesPopover.vue` (request `signaturesPopover`) lists them, `SignatureDetailsDialog.vue` (request `signatureDetails`) shows one, with "Blank doesn't check certificate authorities or revocation." only in its note, and **Trust this certificate…** asks with the fingerprint (`confirmTrust`, `src/signing/trusted.ts`). Settings ▸ Signing ▸ Trusted certificates is `TrustedRows.vue`.
