pub mod cli;
pub mod fonts;
#[cfg(target_os = "macos")]
mod menu;
pub mod open;
pub mod primary;
pub mod session;
pub mod spellcheck;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // `blank --version` and `blank --help` print and exit, without a window
    if let Some(text) = cli::answer(
        std::env::args().skip(1),
        &context.package_info().version.to_string(),
    ) {
        println!("{text}");
        return;
    }
    let mut builder = tauri::Builder::default();
    // Cmd+W closes the tab, not the window (see menu.rs)
    #[cfg(target_os = "macos")]
    {
        builder = builder.menu(menu::without_close_window);
    }
    // every file opened while Blank runs goes to it, as a tab (see open.rs);
    // first, so a second Blank hands its files over before it starts anything
    if open::single_instance(open::has_session_bus) {
        builder = builder.plugin(
            tauri_plugin_single_instance::Builder::new()
                .dbus_id(open::dbus_id())
                .callback(open::forwarded)
                .build(),
        );
    }
    builder
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
        .manage(open::OpenQueue::default())
        .manage(session::SessionLock::default())
        .setup(|app| {
            // finds the system's fonts while the app starts, so the first
            // document with e.g. Chinese doesn't wait for it
            let fonts = app.state::<fonts::FontState>().collection.clone();
            std::thread::spawn(move || fonts::warm(&fonts));
            // the files Blank was started with, for the webview
            open::queue_own_args(app.handle());
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
            open::take_open_paths,
            open::canonical_path,
            session::session_lock,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // the files Finder opens with Blank, while it starts or runs
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                open::deliver(_app, paths);
                open::focus_window(_app);
            }
        });
}
