//! The primary selection of X11 and Wayland: the text selected last, which a
//! middle click pastes. The webview already makes the editor's selection
//! the primary selection, but its page can't read it, so the page view asks
//! here when the pages are middle-clicked (src/editor/pagePointer.ts).
//! macOS and Windows have none.

/// how long the app that owns the primary selection may take to hand it over
#[cfg(target_os = "linux")]
const TIMEOUT: std::time::Duration = std::time::Duration::from_millis(500);

/// the text of the primary selection, None without one, on another system,
/// or when its owner doesn't answer in time
#[tauri::command]
pub async fn read_primary(app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let (send, receive) = std::sync::mpsc::channel();
        // GTK's clipboard lives on the main thread; waiting for the owner
        // runs a nested main loop there, so the window goes on meanwhile
        app.run_on_main_thread(move || {
            let primary = gtk::Clipboard::get(&gtk::gdk::SELECTION_PRIMARY);
            let _ = send.send(primary.wait_for_text().map(|text| text.to_string()));
        })
        .ok()?;
        receive.recv_timeout(TIMEOUT).ok().flatten()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        None
    }
}
