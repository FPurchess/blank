//! Answers `--version` and `--help` on the command line before the window
//! opens. The other arguments, the files to open, are read with the CLI
//! plugin (`plugins.cli` in tauri.conf.json) in open.rs.

/// what Blank prints for `args` (without the program's name) instead of
/// opening its window, if anything
pub fn answer<I, S>(mut args: I, version: &str) -> Option<String>
where
    I: Iterator<Item = S>,
    S: AsRef<str>,
{
    match args.next()?.as_ref() {
        "--version" | "-V" => Some(format!("Blank {version}")),
        "--help" | "-h" => Some(format!(
            "Blank {version}: a markdown editor made for writing\n\n\
             Usage: blank [file …]\n\n\
             Arguments:\n  [file …]  the markdown files (or Word documents) to open, as tabs in the running window\n\n\
             Options:\n  -h, --help     show this help\n  -V, --version  show Blank's version"
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::answer;

    #[test]
    fn prints_the_version() {
        assert_eq!(
            answer(["--version"].into_iter(), "3.0.0-rc1").as_deref(),
            Some("Blank 3.0.0-rc1")
        );
        assert_eq!(
            answer(["-V"].into_iter(), "3.0.0").as_deref(),
            Some("Blank 3.0.0")
        );
    }

    #[test]
    fn prints_the_help() {
        let help = answer(["--help"].into_iter(), "3.0.0").unwrap();
        assert!(help.contains("Usage: blank [file …]"));
        assert!(help.contains("--version"));
        assert_eq!(answer(["-h"].into_iter(), "3.0.0"), Some(help));
    }

    #[test]
    fn opens_the_window_otherwise() {
        assert_eq!(answer(std::iter::empty::<&str>(), "3.0.0"), None);
        assert_eq!(answer(["notes.md"].into_iter(), "3.0.0"), None);
        assert_eq!(answer(["a.md", "b.md"].into_iter(), "3.0.0"), None);
        // only the first argument counts
        assert_eq!(answer(["notes.md", "--version"].into_iter(), "3.0.0"), None);
    }
}
