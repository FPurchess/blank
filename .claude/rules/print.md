---
paths:
  - "src/print/**"
  - "src/editor/commands/print.ts"
  - "src/ui/PrintDialog.vue"
  - "src/ui/PrintPreview.vue"
  - "src/ui/NumberStepper.vue"
  - "src/ui/DisclosureButton.vue"
  - "src/scss/_print.scss"
  - "src/engine/pdf.ts"
  - "src/engine/pdfJob.ts"
  - "src-tauri/src/print/**"
  - "src-tauri/layout/src/pdf.rs"
---

# Printing

Mod-P (`file.print`, also in a tab's menu) opens Blank's print dialog. Blank's dialog handles what its engine controls (the pages, pages per sheet, scale, and the copies as a preset); the system's print dialog, which opens next, handles the printer, two-sided printing, color and the driver's options. There is no printer list in Blank, and the paper is the document's page setup. `window.print()` would print the hidden editor, not the engine's pages, so Blank prints a PDF its engine writes.

## The flow

1. `openPrint` (`src/editor/commands/print.ts`) finishes the layout (`pageEngine.finish()`, so a long document's pages are all there), and opens `printDialog` (`src/state/dialogs.ts`) with the page count, the cursor's page (`caretPage`), the page size and the paper in words (`printPaper`). Without the engine (`engineless()`, "failed" too, since the preview needs the page engine) it says `PRINT_UNAVAILABLE` (the print messages are all in `printModel.ts`); the tab menu's item is disabled then.
2. `PrintDialog.vue` chooses; its words and rules are in `src/print/printModel.ts` (`parsePages`, `chosenPages`, `summary`, `sheetLabel`, `effectiveLayout`: a PDF file is 1 per sheet at actual size whatever is remembered). `printSettings` (`src/state/print.ts`, restored in `bootStorage`) remembers the destination, pages per sheet, scale and whether More settings is open; copies and pages start over.
3. Print runs `printDocument` (`src/print/job.ts`): `preparePrint` (Linux shows the system's dialog first and returns its paper, sheet ranges and scale), `printSheets` with that paper, `applySystemChoices`, `printPDF` (`src/engine/pdf.ts`), then `sendPrint`. "PDF file" runs `exportFile` (`src/editor/commands/exportAs.ts`) with the chosen `pages` instead: the normal tagged PDF/A of those pages.
4. Cancelling says nothing, and while a print is on its way to the system (`printingNow`), Print waits for it (`STILL_PRINTING`). `sent` announces "Sent N pages to …"; Windows (`shown`) says nothing, since its dialog tells nothing back. A `PrintError` (`src/print/ipc.ts`) opens the print dialog again on PDF file with the reason (`reopen`, only while the same tab shows, else a notification); `uncertain` (the job may have printed) only notifies, with `MAY_NOT_HAVE_PRINTED`. Every failure goes to the log first (`logError`, `logWarning` for `uncertain`; see `logging.md`), with what the system said. On Linux, only a missing portal or interface is `noService` (`portal_error`); any other error fails, since its dialog showed. The portal's open ranges ("3-", or "3--1") run to the last sheet (`parse_ranges`).

## One geometry

`printSheets` (`src/print/sheets.ts`) is the only place that decides where pages fall on sheets: 1 per sheet at actual size or fitted, 2 per sheet side by side on a sheet turned across the pages (landscape pages above each other), 4 in two rows, `NUP_GUTTER` around and between. The engine writes the print PDF from its `PrintSheet`s (`src/engine/types.ts`, `PrintSheet` in `pdf.rs`) and `PrintPreview.vue` places its canvases by the same ones, so the preview shows what prints by construction (`PrintPreview.test.ts`, `prints_two_pages_per_sheet`).

## The engine

- `Engine::printed_parts` (`display.rs`) is what a page prints: body and bands without `Part::Hint`. Filter by part, never by role: `Role::Hint` also draws image alt text and unknown blocks' labels, which print.
- `pdf.rs` writes three ways over one retry loop (`write_output`): `write_with` (all pages), `write_pages` (some, tagged, PDF/A; the outline and table of contents links map to the pages written, and items with nothing drawn leave the structure, `tag_tree`) and `write_print` (sheets, untagged: no PDF/A, structure, bookmarks or links). `Drawing::draw` is the one place that draws an `Op` (with `drawable`, which says whether it can) that both the document's PDF and the print PDF draw with: a new op (a path, an SVG) gets one arm there, and the print path follows. The preview paints `printDisplay` with `paintDisplay`, like the pages, so a new kind in the display list needs no print code either. The print PDF is written by `pdf.ts`'s one `write`, so fonts an export loads (e.g. for math) reach printing too.
- wasm: `pdf(…, pages)`, `printPdf(sheetsJson, title)` and `printDisplay(page)`, which the preview paints with the painter's `colors: PAPER_COLORS` and `background`, the PDF's colors (`colors.test.ts` checks them against `roleColor`).
- The print PDF goes through `PdfJob` too, so after a trap the worker writes it.

## Handing it to the system (`src-tauri/src/print/`)

- `print_prepare` and `print_send`; the PDF is `print_send`'s raw body, its title and preset the header `x-print`, percent-encoded JSON (headers carry Latin-1 only).
- **Linux** (`linux.rs`): the print portal through zbus itself, on a thread of its own with `async_io::block_on` (the window's raw handles aren't `Send`); ashpd only names the window (`WindowIdentifier`, whose Wayland side exports the surface through xdg-foreign); keep the portal calls on zbus and don't move them back to ashpd. Of the dialog's answer only the token, the paper, the ranges and the scale are read (`setup_of`): the desktop's settings hold many more values in GTK's own forms, and ashpd's typed settings failed on some (GTK's lower-case "pdf" output format), which made printing fail with a ZBus error after Print. PreparePrint starts on Blank's paper (named as GTK reads it, `paper_name`: a PWG name, or `custom_blank_<w>x<h>mm`), copies and collation with `number-up` 1; the answer is raced against the portal leaving the bus, and a request path that isn't the one asked for fails, so a print never waits forever; Print gets the descriptor of a file in the cache dir, deleted right after opening. Parented to the window by its X11 id or its Wayland surface (xdg-foreign). No portal: `noService`. An error after Print is `uncertain` (KDE reports one after a successful `lpr`). The portal never names the printer. The Snap reaches it through the gnome extension's `desktop` plug.
- **macOS** (`macos.rs`): PDFKit's `printOperationForPrintInfo_scalingMode_autoRotate` on a copy of the shared print info, with the copies, collation, and the sheets' paper and orientation, run app-modal with `runOperation` on the main thread. No file.
- **Windows** (`windows.rs`): a hidden window (label `print-n`, so the capabilities of `main` don't apply) loads the PDF through the asset protocol, waits `SETTLE` after the page loaded, and calls `ICoreWebView2_16::ShowPrintUI`; a runtime without it is `unsupported`. `close_after_dialog` closes the hidden windows that were open before Blank's window had the focus again, a minute after that (WebView2 goes on spooling after its dialog closed), with a 10-minute limit; their files go with them. Copies can't be preset, which the dialog's note says. Neither can the paper, so "Fit to paper" is the dialog's own scaling there (the docs say so).
- `sweep_stale` deletes print PDFs a Blank left behind when it ended too soon.

## Tests

- E2E (`e2e/specs/print.e2e.ts`) stops at the hand-off: a test sets `window.blankPrintCapture`, and a debug build (`__TEST_HOOKS__`) puts the print PDF there instead of calling the system.
- Checked by hand, since CI can't: GNOME and KDE (the uncertain path, and "Print to File"), X11 and Wayland parenting, the Snap, a landscape document and 2 per sheet (that CUPS doesn't turn the sheets again), a page range typed in the system's dialog; macOS's panel, copies, the paper and 2-up orientation; on Windows the viewer without chrome in the dialog, `SETTLE`, that a long document prints whole before the hidden window closes, and WebView2Feedback #5499.
