//! The app menu on macOS: Tauri's default one without "Close Window", whose
//! Cmd+W would close the window, so the key closes the tab instead (see
//! `tab.close` in src/config.ts). A menu left empty goes too, and so does a
//! separator left at a menu's end.

use tauri::menu::{Menu, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

/// without_close_window returns the default menu without its "Close Window"
/// items
pub fn without_close_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let close = PredefinedMenuItem::close_window(app, None)?.text()?;
    let separator = PredefinedMenuItem::separator(app)?.text()?;
    for item in menu.items()? {
        let MenuItemKind::Submenu(submenu) = &item else {
            continue;
        };
        remove_items(submenu, &close)?;
        drop_trailing(submenu, &separator)?;
        if submenu.items()?.is_empty() {
            menu.remove(&item)?;
        }
    }
    Ok(menu)
}

/// remove_items removes the predefined items of `submenu` named `text`
fn remove_items<R: Runtime>(submenu: &Submenu<R>, text: &str) -> tauri::Result<()> {
    for item in submenu.items()? {
        if let MenuItemKind::Predefined(predefined) = &item {
            if predefined.text()? == text {
                submenu.remove(&item)?;
            }
        }
    }
    Ok(())
}

/// drop_trailing removes the separators at the end of `submenu`
fn drop_trailing<R: Runtime>(submenu: &Submenu<R>, separator: &str) -> tauri::Result<()> {
    while let Some(MenuItemKind::Predefined(last)) = submenu.items()?.last() {
        if last.text()? != separator {
            break;
        }
        submenu.remove(last)?;
    }
    Ok(())
}
