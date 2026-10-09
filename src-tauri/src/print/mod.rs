//! Printing: the webview writes the print PDF with Blank's engine, with the
//! pages, pages per sheet and scale already applied (src/print/print.ts),
//! and this hands it to the system's print dialog, which knows the
//! printers: the print portal on Linux (linux.rs), which also works in the
//! Snap and Flatpak, PDFKit's print panel on macOS (macos.rs), and
//! WebView2's print dialog on Windows (windows.rs). See
//! .claude/rules/print.md.

use serde::{Deserialize, Serialize};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{close_after_dialog, PrintWindows};

/// a size in points
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

impl Size {
    pub fn is_landscape(&self) -> bool {
        self.width > self.height
    }

    /// the paper upright, as print dialogs name it with its orientation
    /// apart: its shorter side, then its longer one
    pub fn upright(&self) -> (f64, f64) {
        (self.width.min(self.height), self.width.max(self.height))
    }
}

/// what the system's dialog starts with
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub copies: u32,
    /// whether each copy prints whole before the next
    pub collate: bool,
    /// whether the pages are fitted to the paper: macOS's panel does it on
    /// its paper; on Linux Blank does it on the paper the portal answers
    /// with, and on Windows its dialog's own scaling decides
    pub fit: bool,
    /// the sheets' paper, as Blank lays them out
    pub paper: Size,
}

/// what the system's dialog chose before Blank writes the PDF: on Linux,
/// where the print portal asks first; elsewhere it's ready at once
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum PrintSetup {
    Ready {
        /// what the print portal wants back with the PDF
        token: Option<u32>,
        /// the paper the user chose, in points
        paper: Option<Size>,
        /// the sheets to print, from 0, inclusive
        ranges: Option<Vec<(u32, u32)>>,
        /// in percent
        scale: Option<u32>,
    },
    Cancelled,
}

/// how handing the PDF over went
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum Sent {
    /// the system took the job, with the printer's name if it says
    Sent {
        printer: Option<String>,
    },
    /// the system's dialog shows, and Blank learns no more (Windows)
    Shown,
    Cancelled,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// there is no print service to ask (Linux without the print portal)
    NoService,
    /// the system can't show its print dialog for Blank (an old WebView2)
    Unsupported,
    /// the job may have printed all the same
    Uncertain,
    Failed,
}

/// why printing didn't work, for the webview to say
#[derive(Debug, PartialEq, Serialize)]
pub struct PrintError {
    pub kind: ErrorKind,
    pub message: String,
}

impl PrintError {
    pub fn new(kind: ErrorKind, message: impl std::fmt::Display) -> Self {
        PrintError {
            kind,
            message: message.to_string(),
        }
    }

    pub fn failed(message: impl std::fmt::Display) -> Self {
        PrintError::new(ErrorKind::Failed, message)
    }
}

/// what comes with the PDF to `print_send`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub token: Option<u32>,
    pub title: String,
    pub preset: Preset,
}

/// asks the system's print dialog what to print on, on Linux; ready at once
/// elsewhere, where the dialog opens with the PDF
#[tauri::command]
pub async fn print_prepare(
    window: tauri::WebviewWindow,
    title: String,
    preset: Preset,
) -> Result<PrintSetup, PrintError> {
    #[cfg(target_os = "linux")]
    {
        linux::prepare(&window, &title, &preset).await
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, title, preset);
        Ok(PrintSetup::Ready {
            token: None,
            paper: None,
            ranges: None,
            scale: None,
        })
    }
}

/// hands the PDF, the request's raw body, to the system's print dialog,
/// with what the `x-print` header says (see `decode_meta`)
#[tauri::command]
pub async fn print_send(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: tauri::ipc::Request<'_>,
) -> Result<Sent, PrintError> {
    let tauri::ipc::InvokeBody::Raw(pdf) = request.body() else {
        return Err(PrintError::failed("the PDF didn't arrive"));
    };
    let meta = request
        .headers()
        .get("x-print")
        .and_then(|value| value.to_str().ok())
        .and_then(decode_meta)
        .ok_or_else(|| PrintError::failed("what to print didn't arrive"))?;
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        linux::send(&window, pdf, meta).await
    }
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        macos::send(&app, pdf.clone(), meta).await
    }
    #[cfg(target_os = "windows")]
    {
        windows::send(&app, &window, pdf, &meta).await
    }
}

/// what the `x-print` header says: JSON, percent-encoded, since headers carry
/// only Latin-1 and a title may be in any script
fn decode_meta(header: &str) -> Option<Meta> {
    let json = percent_encoding::percent_decode_str(header)
        .decode_utf8()
        .ok()?;
    serde_json::from_str(&json).ok()
}

#[cfg(not(target_os = "macos"))]
pub use temp::{sweep_stale, TempPdf};

/// the print PDF as a file of the app's cache, for what takes a file: the
/// print portal and WebView2. Never next to the document.
#[cfg(not(target_os = "macos"))]
mod temp {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    use tauri::Manager;

    use super::PrintError;

    const PREFIX: &str = "print-";

    /// a print PDF, deleted once dropped
    pub struct TempPdf {
        path: PathBuf,
    }

    impl TempPdf {
        pub fn write(app: &tauri::AppHandle, pdf: &[u8]) -> Result<TempPdf, PrintError> {
            static COUNT: AtomicU32 = AtomicU32::new(0);
            let dir = app.path().app_cache_dir().map_err(PrintError::failed)?;
            std::fs::create_dir_all(&dir).map_err(PrintError::failed)?;
            let count = COUNT.fetch_add(1, Ordering::Relaxed);
            let path = dir.join(format!("{PREFIX}{}-{count}.pdf", std::process::id()));
            std::fs::write(&path, pdf).map_err(PrintError::failed)?;
            Ok(TempPdf { path })
        }

        pub fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempPdf {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
        }
    }

    /// deletes the print PDFs a Blank that ended too soon left behind
    pub fn sweep_stale(app: &tauri::AppHandle) {
        let Ok(dir) = app.path().app_cache_dir() else {
            return;
        };
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(PREFIX) && name.ends_with(".pdf") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_what_comes_with_the_pdf() {
        let json = r#"{"token":7,"title":"Café 北京","preset":{"copies":2,"collate":true,"fit":false,"paper":{"width":841.89,"height":595.28}}}"#;
        let header: String =
            percent_encoding::utf8_percent_encode(json, percent_encoding::NON_ALPHANUMERIC)
                .collect();
        let meta = decode_meta(&header).unwrap();
        assert_eq!(meta.token, Some(7));
        assert_eq!(meta.title, "Café 北京");
        assert_eq!(meta.preset.copies, 2);
        assert!(meta.preset.paper.is_landscape());
        assert!(decode_meta("%7Bnot").is_none());
    }

    #[test]
    fn tells_the_webview_how_it_went() {
        let ready = PrintSetup::Ready {
            token: Some(3),
            paper: None,
            ranges: Some(vec![(0, 1)]),
            scale: None,
        };
        assert_eq!(
            serde_json::to_value(ready).unwrap(),
            serde_json::json!({"outcome": "ready", "token": 3, "paper": null, "ranges": [[0, 1]], "scale": null})
        );
        assert_eq!(
            serde_json::to_value(Sent::Sent { printer: None }).unwrap(),
            serde_json::json!({"outcome": "sent", "printer": null})
        );
        assert_eq!(
            serde_json::to_value(PrintError::new(ErrorKind::NoService, "none")).unwrap(),
            serde_json::json!({"kind": "noService", "message": "none"})
        );
    }
}
