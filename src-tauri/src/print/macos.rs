//! PDFKit's print panel for the print PDF: the panel opens app-modal, as
//! the system's print dialog, with the copies Blank's dialog chose. It must
//! run on the main thread, which it holds while it is open.

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_app_kit::{NSPaperOrientation, NSPrintCopies, NSPrintInfo, NSPrintMustCollate};
use objc2_foundation::{NSCopying, NSData, NSNumber, NSSize, NSString};
use objc2_pdf_kit::{PDFDocument, PDFPrintScalingMode};

use super::{Meta, PrintError, Sent};

pub async fn send(app: &tauri::AppHandle, pdf: Vec<u8>, meta: Meta) -> Result<Sent, PrintError> {
    let (answer, answered) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = answer.send(run(&pdf, &meta));
    })
    .map_err(PrintError::failed)?;
    answered
        .await
        .unwrap_or_else(|_| Err(PrintError::failed("the print panel didn't answer")))
}

/// shows the print panel for `pdf` and prints it, on the main thread
fn run(pdf: &[u8], meta: &Meta) -> Result<Sent, PrintError> {
    let main = MainThreadMarker::new()
        .ok_or_else(|| PrintError::failed("the print panel must open on the main thread"))?;
    let data = NSData::with_bytes(pdf);
    let document = unsafe { PDFDocument::initWithData(PDFDocument::alloc(), &data) }
        .ok_or_else(|| PrintError::failed("the PDF can't be read"))?;
    // the app's print settings stay as they are
    let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
    let preset = &meta.preset;
    // Blank's paper, so a sheet at its actual size isn't cut off on the
    // printer's own: named upright, then turned to the sheets, which turns
    // the size with it
    let paper = preset.paper;
    let (width, height) = paper.upright();
    info.setPaperSize(NSSize::new(width, height));
    info.setOrientation(if paper.is_landscape() {
        NSPaperOrientation::Landscape
    } else {
        NSPaperOrientation::Portrait
    });
    let settings = unsafe { info.dictionary() };
    let copies = NSNumber::numberWithUnsignedInt(preset.copies);
    let collate = NSNumber::numberWithBool(preset.collate);
    let copies: &AnyObject = &copies;
    let collate: &AnyObject = &collate;
    unsafe {
        settings.insert(NSPrintCopies, copies);
        settings.insert(NSPrintMustCollate, collate);
    }
    let scaling = if preset.fit {
        PDFPrintScalingMode::PageScaleToFit
    } else {
        PDFPrintScalingMode::PageScaleNone
    };
    let operation = unsafe {
        document.printOperationForPrintInfo_scalingMode_autoRotate(
            Some(&info),
            scaling,
            false,
            main,
        )
    }
    .ok_or_else(|| PrintError::failed("the PDF can't be printed"))?;
    operation.setJobTitle(Some(&NSString::from_str(&meta.title)));
    operation.setShowsPrintPanel(true);
    if !operation.runOperation() {
        return Ok(Sent::Cancelled);
    }
    let printer = operation.printInfo().printer().name().to_string();
    Ok(Sent::Sent {
        printer: (!printer.is_empty()).then_some(printer),
    })
}
