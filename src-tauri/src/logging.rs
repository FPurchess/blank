//! Blank's log: errors and warnings of the app and its webview, in a file of
//! the system's log folder (`app_log_dir`), which stays on this computer.
//! See .claude/rules/logging.md for what goes in it and what never does.

use std::panic::PanicHookInfo;

use log::LevelFilter;
use tauri::App;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// how large `blank.log` grows before it becomes an old file
const MAX_FILE_SIZE: u128 = 1_000_000;
/// how many old files are kept besides `blank.log`
const OLD_FILES: usize = 2;

/// starts the log: the plugin that writes it (and takes the webview's lines),
/// the panic hook, and a line that says which Blank runs where. A log that
/// can't be written never keeps Blank from starting: it goes to stderr then.
pub fn start(app: &mut App) {
    let file = Target::new(TargetKind::LogDir {
        // fixed, not the product name, which the docs would follow
        file_name: Some("blank".into()),
    });
    // stderr only for `tauri dev`: a release build may have none, and a
    // failing write there would make the logger panic
    let mut targets = vec![file];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stderr));
    }
    let split = builder(targets).split(app.handle()).or_else(|error| {
        eprintln!("Blank can't write its log, so it writes to stderr: {error}");
        builder([Target::new(TargetKind::Stderr)]).split(app.handle())
    });
    let attached = split
        .map_err(|error| error.to_string())
        .and_then(|(plugin, level, logger)| {
            app.handle()
                .plugin(plugin)
                .map_err(|error| error.to_string())?;
            tauri_plugin_log::attach_logger(level, logger).map_err(|error| error.to_string())
        });
    if let Err(error) = attached {
        eprintln!("Blank can't keep its log: {error}");
    }
    hook_panics();
    log::info!("{}", start_line(&app.package_info().version.to_string()));
}

/// the log's plugin, writing to `targets`: what others' crates say only
/// when it went wrong, Blank's own start line and the webview's lines from
/// info on
fn builder(targets: impl IntoIterator<Item = Target>) -> tauri_plugin_log::Builder {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets(targets)
        .max_file_size(MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(OLD_FILES))
        .level(LevelFilter::Warn)
        .level_for("blank_lib", LevelFilter::Info)
        .level_for("webview", LevelFilter::Info)
        // an error for every local image that isn't there, which the
        // webview reports itself, once
        .level_for("tauri::protocol::asset", LevelFilter::Off)
}

/// which Blank runs where, for the log's first line of each start
fn start_line(version: &str) -> String {
    let webview = tauri::webview_version().unwrap_or_else(|_| "unknown".into());
    format!(
        "Blank {version} started on {} {}, webview {webview}",
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
}

/// logs every panic with its thread, where it happened and, when it is a
/// fixed text, its message, before the default hook prints it and the
/// thread unwinds. A backtrace would need the release builds' debug info,
/// which they don't keep.
fn hook_panics() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("{}", panic_line(info));
        previous(info);
    }));
}

/// what the log says of a panic
fn panic_line(info: &PanicHookInfo) -> String {
    describe_panic(
        std::thread::current().name(),
        info.location()
            .map(|location| (location.file(), location.line())),
        info.payload(),
    )
}

/// a panic in words: its thread, where it happened, and its message when
/// it is a fixed text (`panic!("…")` without arguments). A formatted one is
/// withheld: Rust's own, of slicing a string or unwrapping an error, quote
/// the string or the error, which may hold the document's text.
fn describe_panic(
    thread: Option<&str>,
    location: Option<(&str, u32)>,
    payload: &(dyn std::any::Any + Send),
) -> String {
    let message = match payload.downcast_ref::<&str>() {
        Some(message) => message.to_string(),
        None if payload.is::<String>() => "(its message is withheld)".into(),
        None => "(no message)".into(),
    };
    let at = location
        .map(|(file, line)| format!(" at {file}:{line}"))
        .unwrap_or_default();
    format!(
        "panicked in thread {}{at}: {message}",
        thread.unwrap_or("unnamed")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_which_blank_runs_where() {
        let line = start_line("3.1.0");
        assert!(line.starts_with("Blank 3.1.0 started on "), "{line}");
        assert!(line.contains(std::env::consts::OS), "{line}");
    }

    #[test]
    fn says_where_a_panic_happened() {
        assert_eq!(
            describe_panic(Some("fonts"), Some(("src/fonts.rs", 42)), &"poisoned"),
            "panicked in thread fonts at src/fonts.rs:42: poisoned"
        );
        // a formatted message may quote the document
        let formatted = String::from("byte index 3 is not a char boundary of `Dear Anna`");
        assert_eq!(
            describe_panic(None, None, &formatted),
            "panicked in thread unnamed: (its message is withheld)"
        );
        assert_eq!(
            describe_panic(None, None, &7),
            "panicked in thread unnamed: (no message)"
        );
    }
}
