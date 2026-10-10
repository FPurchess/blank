//! What the webview asks of a PDF tab (src/pdf/ipc.ts). Failures reach it as
//! a kind (`PdfError::kind`, "unreadable" for a file that can't be read, or
//! for a file read again "missing" when it has gone and "changed" when it
//! isn't the one opened) and the log as the same kind with what was asked:
//! never the PDF's text. The path of a PDF opened is logged at info.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use crate::print::{self, Meta, PrintError, PrintSetup, Sent};
use blank_pdf_ipc::client::{PdfError, Supervisor};
use blank_pdf_ipc::frame::MAX_BODY;
use blank_pdf_ipc::protocol::{ErrorKind, Op, PageInfo};
use serde::Serialize;
use tauri::{AppHandle, State};

use super::{helper_config, read_checked, sha256, source, PdfTab, PdfTabs};
use crate::signing::commands::{checked_signatures, SigningError};
use crate::signing::trust::CheckedSignature;

/// what opening a PDF found
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    /// the file's SHA-256, which tells whether it changed since
    pub sha256: String,
    pub pages: Vec<PageInfo>,
    pub repaired: bool,
    pub encrypted: bool,
}

/// the kind of a failure, logged with `context`
fn failed(context: &'static str) -> impl Fn(PdfError) -> String {
    move |error| {
        log::warn!("PDF: {context}: {}", error.kind());
        error.kind().to_string()
    }
}

/// why a PDF tab's file can't be read again: "missing" when it isn't where
/// it was, "changed" when it is but holds another PDF, "unreadable" else
fn file_problem(path: &Path) -> &'static str {
    match std::fs::metadata(path) {
        Ok(_) => "changed",
        Err(error) if error.kind() == io::ErrorKind::NotFound => "missing",
        Err(_) => "unreadable",
    }
}

/// what reading a PDF tab's file again found, by `read_checked`'s error
fn read_problem(error: &io::Error) -> &'static str {
    match error.kind() {
        io::ErrorKind::InvalidData => "changed",
        io::ErrorKind::NotFound => "missing",
        _ => "unreadable",
    }
}

/// runs `work` on a thread of its own: the helper's answers are waited for
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or_else(|_| Err("failed".into()))
}

/// opens the PDF at `path` in tab `tab`, with a helper of its own
#[tauri::command]
pub async fn pdf_open(
    tabs: State<'_, PdfTabs>,
    tab: String,
    path: PathBuf,
) -> Result<Opened, String> {
    log::info!("PDF: opening {}", path.display());
    let read = path.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        // more than a helper may be given: not worth reading
        if std::fs::metadata(&read)?.len() > MAX_BODY {
            return Ok(None);
        }
        std::fs::read(read).map(Some)
    })
    .await
    .map_err(|_| "failed".to_string())?
    .map_err(|error| {
        log::warn!("PDF: read: {}", error.kind());
        "unreadable".to_string()
    })?
    .ok_or_else(|| failed("open")(PdfError::Engine(ErrorKind::TooComplex)))?;
    let sha = sha256(&bytes);
    let config = helper_config().map_err(|_| "start".to_string())?;
    let supervisor = Arc::new(Supervisor::new(
        config,
        source(path.clone(), sha.clone(), bytes.into()),
    ));
    // in the tabs while it opens, so that closing the tab meanwhile is seen
    let pdf = Arc::new(PdfTab {
        supervisor: supervisor.clone(),
        path: path.clone(),
        sha256: sha.clone(),
    });
    tabs.insert(tab.clone(), pdf.clone());
    let opening = supervisor.clone();
    let opened = blocking(move || {
        let info = opening.open().map_err(failed("open"))?;
        let pages = opening.pages(info.pages).map_err(failed("pages"))?;
        Ok((info, pages))
    })
    .await;
    let (info, pages) = match opened {
        Ok(opened) => opened,
        Err(error) => {
            tabs.remove_if(&tab, &pdf);
            return Err(error);
        }
    };
    if !tabs.holds(&tab, &pdf) {
        // closed while it opened: its helper goes with the last reference
        supervisor.stop();
        return Err("closed".into());
    }
    tabs.stop_idle(Some(&tab), Instant::now());
    Ok(Opened {
        sha256: sha,
        pages,
        repaired: info.repaired,
        encrypted: info.encrypted,
    })
}

/// draws a page of tab `tab` at `scale`: its pixels, RGBA, then its width
/// and height as two u32 LE; `ticket` lets `pdf_cancel` stop it
#[tauri::command]
pub async fn pdf_render(
    tabs: State<'_, PdfTabs>,
    tab: String,
    page: usize,
    scale: f32,
    ticket: u64,
) -> Result<tauri::ipc::Response, String> {
    let pdf = tabs.get(&tab).ok_or("closed")?;
    tabs.stop_idle(Some(&tab), Instant::now());
    let (info, mut pixels) = blocking(move || {
        pdf.supervisor
            .request(Op::Render { page, scale }, Some(ticket))
            .map_err(|error| match error {
                // not worth a line in the log: the webview asked for it
                PdfError::Engine(ErrorKind::Cancelled) => error.kind().to_string(),
                // a helper that stopped, idle, found the file gone or changed
                PdfError::Source => {
                    let problem = file_problem(&pdf.path);
                    log::warn!("PDF: render: {problem}");
                    problem.to_string()
                }
                error => failed("render")(error),
            })
    })
    .await?;
    for size in ["width", "height"] {
        let value = info[size].as_u64().unwrap_or(0) as u32;
        pixels.extend_from_slice(&value.to_le_bytes());
    }
    Ok(tauri::ipc::Response::new(pixels))
}

/// stops the render of `ticket` in tab `tab`, if it runs
#[tauri::command]
pub fn pdf_cancel(tabs: State<'_, PdfTabs>, tab: String, ticket: u64) {
    if let Some(pdf) = tabs.get(&tab) {
        pdf.supervisor.cancel(ticket);
    }
}

/// stops tab `tab`'s helper and forgets its PDF
#[tauri::command]
pub fn pdf_close(tabs: State<'_, PdfTabs>, tab: String) {
    tabs.remove(&tab);
}

/// checks the signatures of tab `tab`'s PDF, read again; the file must still
/// be the one the tab opened
#[tauri::command]
pub async fn pdf_verify(
    app: AppHandle,
    tabs: State<'_, PdfTabs>,
    tab: String,
) -> Result<Vec<CheckedSignature>, SigningError> {
    let pdf = tabs
        .get(&tab)
        .ok_or_else(|| SigningError::Failed("This PDF isn't open any more".into()))?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = read_checked(&pdf.path, &pdf.sha256).map_err(|error| {
            let problem = read_problem(&error);
            log::warn!("PDF: read to check its signatures: {problem}");
            SigningError::Failed(
                match problem {
                    "changed" => "This PDF changed after Blank opened it. Open it again to check its signatures",
                    "missing" => "This PDF was moved or deleted after Blank opened it",
                    _ => "Blank can't read this PDF again",
                }
                .into(),
            )
        })?;
        checked_signatures(&app, &bytes)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't check the signatures of this PDF".into()))?
}

/// how printing a PDF tab's file went
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum PdfPrinted {
    /// the system took it, or shows its dialog (see `Sent`)
    Sent {
        printer: Option<String>,
    },
    Shown,
    Cancelled,
    /// the system's dialog (Linux) chose some pages or a scale, which Blank
    /// can't apply to a PDF it didn't write: nothing printed
    Whole,
}

/// prints tab `tab`'s file as it is, through the system's print dialog,
/// while it is the PDF the tab opened. Read here, so a large PDF never
/// travels through the webview; a file that has gone or changed fails with
/// the kind "missing" or "changed"
#[tauri::command]
pub async fn pdf_print(
    app: AppHandle,
    window: tauri::WebviewWindow,
    tabs: State<'_, PdfTabs>,
    tab: String,
    meta: Meta,
) -> Result<PdfPrinted, PrintError> {
    let pdf = tabs
        .get(&tab)
        .ok_or_else(|| PrintError::new(print::ErrorKind::NotOpen, "the PDF isn't open"))?;
    let bytes = tauri::async_runtime::spawn_blocking(move || read_checked(&pdf.path, &pdf.sha256))
        .await
        .map_err(PrintError::failed)?
        .map_err(|error| {
            let problem = read_problem(&error);
            log::warn!("PDF: read to print it: {problem}");
            match problem {
                "changed" => PrintError::new(print::ErrorKind::Changed, problem),
                "missing" => PrintError::new(print::ErrorKind::Missing, problem),
                _ => PrintError::failed(error.kind()),
            }
        })?;
    let token = match print::prepare(&window, &meta.title, &meta.preset).await? {
        PrintSetup::Cancelled => return Ok(PdfPrinted::Cancelled),
        PrintSetup::Ready {
            ranges: Some(_), ..
        }
        | PrintSetup::Ready { scale: Some(_), .. } => return Ok(PdfPrinted::Whole),
        PrintSetup::Ready { token, .. } => token,
    };
    let meta = Meta { token, ..meta };
    Ok(match print::send(&app, &window, &bytes, meta).await? {
        Sent::Sent { printer } => PdfPrinted::Sent { printer },
        Sent::Shown => PdfPrinted::Shown,
        Sent::Cancelled => PdfPrinted::Cancelled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_a_file_that_went_from_one_that_changed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.pdf");
        std::fs::write(&path, b"%PDF-1.7 two").unwrap();
        assert_eq!(file_problem(&path), "changed");
        let error = read_checked(&path, &sha256(b"%PDF-1.7 one")).unwrap_err();
        assert_eq!(read_problem(&error), "changed");
        std::fs::remove_file(&path).unwrap();
        assert_eq!(file_problem(&path), "missing");
        let error = read_checked(&path, "").unwrap_err();
        assert_eq!(read_problem(&error), "missing");
    }
}
