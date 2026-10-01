pub mod fonts;
pub mod primary;
pub mod spellcheck;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // fetches remote images for the exports, which the webview can't because of CORS
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        // links are opened by the editor (src/editor/plugins/openLink.ts), so skip the
        // plugin's injected script, which also opens links on Shift+Click
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(spellcheck::SpellState::default())
        .manage(fonts::FontState::default())
        // finds the system's fonts while the app starts, so the first
        // document with e.g. Chinese doesn't wait for it
        .setup(|app| {
            let fonts = app.state::<fonts::FontState>().collection.clone();
            std::thread::spawn(move || fonts::warm(&fonts));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spellcheck::spellcheck_status,
            spellcheck::spellcheck_install,
            spellcheck::spellcheck_load,
            spellcheck::spellcheck_unload,
            spellcheck::spellcheck_check,
            spellcheck::spellcheck_suggest,
            spellcheck::spellcheck_add,
            spellcheck::spellcheck_remove,
            fonts::fallback_fonts,
            primary::read_primary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
