//! The app menu on macOS: Tauri's default one without "Close Window", whose
//! Cmd+W would close the window, so the key closes the tab instead (see
//! `tab.close` in src/config.ts).

use tauri::menu::{Menu, MenuItemKind, PredefinedMenuItem};
use tauri::{AppHandle, Runtime};

/// without_close_window returns the default menu without its "Close Window"
/// items
pub fn without_close_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let close = PredefinedMenuItem::close_window(app, None)?.text()?;
    for item in menu.items()? {
        let MenuItemKind::Submenu(submenu) = item else {
            continue;
        };
        for inner in submenu.items()? {
            if let MenuItemKind::Predefined(predefined) = &inner {
                if predefined.text()? == close {
                    submenu.remove(&inner)?;
                }
            }
        }
    }
    Ok(menu)
}
