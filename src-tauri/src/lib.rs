pub mod spellcheck;

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
        .invoke_handler(tauri::generate_handler![
            spellcheck::spellcheck_status,
            spellcheck::spellcheck_install,
            spellcheck::spellcheck_load,
            spellcheck::spellcheck_unload,
            spellcheck::spellcheck_check,
            spellcheck::spellcheck_suggest,
            spellcheck::spellcheck_add,
            spellcheck::spellcheck_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
