//! What the webview asks of a PDF tab (src/pdf/ipc.ts). Failures reach it as
//! a kind (`PdfError::kind`, or "unreadable" for a file that can't be read)
//! and the log as the same kind with what was asked: never the PDF's text.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

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
        log::warn!("PDF: read {}: {}", path.display(), error.kind());
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
    log::info!("PDF opened: {}", path.display());
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
                PdfError::Engine(blank_pdf_ipc::protocol::ErrorKind::Cancelled) => {
                    error.kind().to_string()
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
            log::warn!("PDF: read to check its signatures: {}", error.kind());
            SigningError::Failed("Blank can't read this PDF again".into())
        })?;
        checked_signatures(&app, &bytes)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't check the signatures of this PDF".into()))?
}
