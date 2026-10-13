//! `blank-pdf`: draws a PDF's pages and reads its form for Blank, one helper
//! per PDF tab, so a PDF that crashes or hangs MuPDF takes down only its tab.
//! The app starts it (src-tauri/src/pdf_view) and speaks the protocol of
//! blank-pdf-ipc on its stdin and stdout.

use std::fs::File;
use std::io;
use std::process::ExitCode;
use std::time::Duration;

use blank_pdf::mupdf::Mupdf;
use blank_pdf_ipc::limits;
use blank_pdf_ipc::serve::serve;

/// the most MuPDF may allocate, unless `--memory-limit-mb` says otherwise
const MEMORY_LIMIT_MB: usize = 1536;
/// what MuPDF keeps of decoded fonts and images for later pages
const STORE_LIMIT: usize = 256 << 20;

/// the frames' own copy of stdout; stdout itself then points at stderr, so
/// a stray print of a C library can't corrupt the frames
fn frames_output() -> io::Result<File> {
    unsafe {
        let frames = libc::dup(1);
        if frames < 0 || libc::dup2(2, 1) < 0 {
            return Err(io::Error::last_os_error());
        }
        #[cfg(unix)]
        {
            use std::os::fd::FromRawFd;
            Ok(File::from_raw_fd(frames))
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::FromRawHandle;
            Ok(File::from_raw_handle(libc::get_osfhandle(frames) as _))
        }
    }
}

fn main() -> ExitCode {
    let mut memory_limit = MEMORY_LIMIT_MB;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" => {
                println!("blank-pdf, MuPDF {}", blank_pdf::mupdf::version());
                return ExitCode::SUCCESS;
            }
            "--memory-limit-mb" => match args.next().and_then(|value| value.parse().ok()) {
                Some(value) => memory_limit = value,
                None => return ExitCode::FAILURE,
            },
            _ => return ExitCode::FAILURE,
        }
    }
    limits::limit_helper();
    let (Ok(output), Some(engine)) = (frames_output(), Mupdf::new(memory_limit << 20, STORE_LIMIT))
    else {
        return ExitCode::FAILURE;
    };
    // stdin closed: Blank is gone. What runs was cancelled; exit even if
    // MuPDF doesn't stop
    let exit = || {
        std::thread::sleep(Duration::from_secs(1));
        std::process::exit(0);
    };
    match serve(&engine, io::stdin(), output, exit) {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => ExitCode::FAILURE,
    }
}
