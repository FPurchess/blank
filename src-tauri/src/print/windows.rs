//! WebView2's print dialog for the print PDF: a hidden window shows the PDF
//! in WebView2's own viewer, and ShowPrintUI opens Windows' print dialog
//! for it. Not ShellExecute's "print", which depends on the default PDF app.
//! ShowPrintUI tells nothing of what the user does, so the hidden window
//! closes once Blank's window has the focus again after the dialog (see
//! `close_after_dialog`), and the copies can't be preset.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
};
use windows::core::Interface;

use super::{ErrorKind, Meta, PrintError, Sent, TempPdf};

/// how long the PDF viewer may take after the page loaded, before it can
/// print: its load event comes before the viewer is ready. Checked by hand.
const SETTLE: Duration = Duration::from_millis(600);
/// how long the PDF may take to load at all
const LOAD_TIMEOUT: Duration = Duration::from_secs(20);
/// how long after Blank's window has the focus again a hidden window closes:
/// WebView2 goes on spooling a long document after its dialog closed, and a
/// hidden window costs little. And how long it must have been open for that,
/// so the focus Blank had before the dialog showed doesn't count.
const CLOSE_DELAY: Duration = Duration::from_secs(60);
const SHOWN_FOR: Duration = Duration::from_secs(1);
/// when a hidden window closes at the latest
const LONGEST: Duration = Duration::from_secs(10 * 60);

/// a hidden window that shows a print PDF, and the file it shows
struct Hidden {
    label: String,
    _pdf: TempPdf,
    shown: Instant,
}

/// the hidden windows of print dialogs that may still be open
#[derive(Default)]
pub struct PrintWindows(Mutex<Vec<Hidden>>);

impl PrintWindows {
    /// closes the hidden windows `which` picks, which deletes their PDFs. A
    /// PDF the webview still holds open stays, and `sweep_stale` deletes it
    /// on the next start.
    fn close(&self, app: &AppHandle, which: impl Fn(&Hidden) -> bool) {
        let mut windows = self.0.lock().unwrap_or_else(|error| error.into_inner());
        windows.retain(|hidden| {
            if !which(hidden) {
                return true;
            }
            if let Some(window) = app.get_webview_window(&hidden.label) {
                let _ = window.destroy();
            }
            false
        });
    }
}

/// closes the hidden windows a moment after Blank's window has the focus
/// again, which it gets once the print dialog closes
pub fn close_after_dialog(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let app = app.clone();
    main.on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::Focused(true)) {
            return;
        }
        // only the windows that were open well before the focus came back:
        // one shown since then belongs to a dialog that is still open
        let focused = Instant::now();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(CLOSE_DELAY).await;
            app.state::<PrintWindows>().close(&app, |hidden| {
                focused
                    .checked_duration_since(hidden.shown)
                    .is_some_and(|open| open > SHOWN_FOR)
            });
        });
    });
}

/// the PDF's address for the asset protocol, which serves the app's files
/// to its webviews (see `convertFileSrc` in @tauri-apps/api)
fn asset_url(pdf: &TempPdf) -> Result<tauri::Url, PrintError> {
    let path = pdf.path().to_string_lossy();
    let encoded = percent_encoding::utf8_percent_encode(&path, percent_encoding::NON_ALPHANUMERIC);
    format!("http://asset.localhost/{encoded}")
        .parse()
        .map_err(PrintError::failed)
}

/// opens Windows' print dialog for the PDF the hidden window shows
async fn show_print_ui(window: &WebviewWindow) -> Result<(), PrintError> {
    let (answer, answered) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let shown = unsafe { webview.controller().CoreWebView2() }
                .map_err(PrintError::failed)
                .and_then(|core| {
                    // an older WebView2 runtime has no print dialog
                    core.cast::<ICoreWebView2_16>()
                        .map_err(|error| PrintError::new(ErrorKind::Unsupported, error))
                })
                .and_then(|core| {
                    unsafe { core.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM) }
                        .map_err(PrintError::failed)
                });
            let _ = answer.send(shown);
        })
        .map_err(PrintError::failed)?;
    answered
        .await
        .unwrap_or_else(|_| Err(PrintError::failed("the print dialog didn't open")))
}

pub async fn send(
    app: &AppHandle,
    window: &WebviewWindow,
    pdf: &[u8],
    meta: &Meta,
) -> Result<Sent, PrintError> {
    static COUNT: AtomicU32 = AtomicU32::new(0);
    let pdf = TempPdf::write(app, pdf)?;
    let label = format!("print-{}", COUNT.fetch_add(1, Ordering::Relaxed));
    let (answer, answered) = tokio::sync::oneshot::channel();
    let answer = Arc::new(Mutex::new(Some(answer)));
    // the label isn't "main", so the window gets none of the app's
    // permissions (src-tauri/capabilities)
    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(asset_url(&pdf)?))
        .title(&meta.title)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .parent(window)
        .map_err(PrintError::failed)?
        .on_page_load(move |hidden, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let Some(answer) = answer.lock().ok().and_then(|mut answer| answer.take()) else {
                return;
            };
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(SETTLE).await;
                let _ = answer.send(show_print_ui(&hidden).await);
            });
        })
        .build()
        .map_err(PrintError::failed)?;
    let windows = app.state::<PrintWindows>();
    windows
        .0
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .push(Hidden {
            label: label.clone(),
            _pdf: pdf,
            shown: Instant::now(),
        });
    // at the latest, the window goes after a while
    let later = app.clone();
    let closing = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(LONGEST).await;
        later
            .state::<PrintWindows>()
            .close(&later, |hidden| hidden.label == closing);
    });
    let shown = match tokio::time::timeout(LOAD_TIMEOUT, answered).await {
        Ok(Ok(shown)) => shown,
        _ => Err(PrintError::failed("the PDF didn't load")),
    };
    if shown.is_err() {
        windows.close(app, |hidden| hidden.label == label);
    }
    shown.map(|()| Sent::Shown)
}
