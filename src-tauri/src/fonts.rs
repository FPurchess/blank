//! The system's fonts for what Blank's own fonts lack (the lookup itself is
//! the crate blank-system-fonts, which the PDF helper shares): the layout
//! engine (src/engine/fallback.ts) asks for the characters it couldn't show.

use blank_system_fonts::{lookup, FallbackFont, Fonts};
use tauri::State;

pub use blank_system_fonts::warm;

#[derive(Default)]
pub struct FontState {
    pub collection: Fonts,
}

/// the system's fonts for the scripts of `text`, looked up on a thread of
/// its own: the first lookup finds all of the system's fonts, which would
/// freeze the window on the main thread
#[tauri::command]
pub async fn fallback_fonts(
    state: State<'_, FontState>,
    text: String,
    language: String,
) -> Result<Vec<FallbackFont>, String> {
    let fonts = state.collection.clone();
    tauri::async_runtime::spawn_blocking(move || lookup(&fonts, &text, &language))
        .await
        .map_err(|error| error.to_string())
}
