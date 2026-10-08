//! The client against the fake helper (src/bin/fake-pdf-helper.rs): answers,
//! cancels, timeouts, crashes, hangs, and when it starts a helper again.

use std::sync::Arc;
use std::time::{Duration, Instant};

use blank_pdf_ipc::client::{HelperConfig, PdfError, Supervisor, Timeouts};
use blank_pdf_ipc::protocol::{ErrorKind, Op, PageInfo};

fn config(args: &[&str]) -> HelperConfig {
    HelperConfig {
        program: env!("CARGO_BIN_EXE_fake-pdf-helper").into(),
        args: args.iter().map(|arg| arg.to_string()).collect(),
        quiet: true,
        timeouts: Timeouts {
            render: Duration::from_millis(300),
            cancel: Duration::from_millis(300),
            ..Timeouts::default()
        },
    }
}

/// a supervisor of a fake PDF whose pages draw as `pages` say
fn supervisor(pages: &[&str]) -> Supervisor {
    let pdf: Arc<[u8]> = serde_json::to_vec(&serde_json::json!({ "pages": pages }))
        .unwrap()
        .into();
    Supervisor::new(config(&[]), Box::new(move || Ok(pdf.clone())))
}

fn render(supervisor: &Supervisor, page: usize) -> Result<Vec<u8>, PdfError> {
    supervisor
        .request(Op::Render { page, scale: 1.0 }, Some(page as u64))
        .map(|(_, body)| body)
}

#[test]
fn opens_and_draws() {
    let pdf = supervisor(&["ok", "ok"]);
    assert_eq!(pdf.open().unwrap().pages, 2);
    let pages: Vec<PageInfo> = pdf.ask(Op::Pages { from: 0, to: 9 }).unwrap();
    assert_eq!(pages.len(), 2);
    let (info, pixels) = pdf
        .request(
            Op::Render {
                page: 1,
                scale: 2.0,
            },
            None,
        )
        .unwrap();
    assert_eq!(
        (info["width"].as_u64(), info["height"].as_u64()),
        (Some(20), Some(40))
    );
    assert_eq!(pixels.len(), 20 * 40 * 4);
    assert_eq!(&pixels[..4], [40, 100, 200, 255]);
    assert_eq!(
        pdf.request(
            Op::Render {
                page: 5,
                scale: 1.0
            },
            None
        )
        .unwrap_err(),
        PdfError::Engine(ErrorKind::BadRequest)
    );
}

#[test]
fn cancels_what_takes_too_long() {
    let pdf = supervisor(&["slow", "ok"]);
    assert_eq!(render(&pdf, 0).unwrap_err(), PdfError::TimedOut);
    // the helper stopped as asked: not a failure, and it answers on
    assert!(render(&pdf, 1).is_ok());
    assert!(!pdf.failed());
}

#[test]
fn cancels_a_render_on_request() {
    let pdf = Arc::new(supervisor(&["slow"]));
    pdf.open().unwrap();
    let rendering = pdf.clone();
    let started = Instant::now();
    let thread = std::thread::spawn(move || {
        rendering.request(
            Op::Render {
                page: 0,
                scale: 1.0,
            },
            Some(7),
        )
    });
    std::thread::sleep(Duration::from_millis(100));
    pdf.cancel(7);
    let answer = thread.join().unwrap();
    assert_eq!(answer.unwrap_err(), PdfError::Engine(ErrorKind::Cancelled));
    assert!(
        started.elapsed() < Duration::from_millis(300),
        "before the timeout"
    );
}

#[test]
fn kills_a_hang_and_starts_again_once() {
    let pdf = supervisor(&["stuck", "ok"]);
    assert_eq!(render(&pdf, 0).unwrap_err(), PdfError::Hung);
    // the next request starts a new helper, which opens the PDF again
    assert!(render(&pdf, 1).is_ok());
    assert!(!pdf.failed());
}

#[test]
fn gives_up_after_the_second_failure() {
    let pdf = supervisor(&["crash", "stuck", "ok"]);
    assert_eq!(render(&pdf, 0).unwrap_err(), PdfError::Crashed);
    assert!(render(&pdf, 2).is_ok());
    assert_eq!(render(&pdf, 1).unwrap_err(), PdfError::Hung);
    assert!(pdf.failed());
    let started = Instant::now();
    assert_eq!(render(&pdf, 2).unwrap_err(), PdfError::Failed);
    assert_eq!(pdf.open().unwrap_err(), PdfError::Failed);
    assert!(
        started.elapsed() < Duration::from_millis(100),
        "no helper started"
    );
}

#[test]
fn an_idle_stop_isnt_a_failure() {
    let pdf = supervisor(&["crash", "ok"]);
    assert_eq!(render(&pdf, 0).unwrap_err(), PdfError::Crashed);
    assert!(render(&pdf, 1).is_ok());
    assert!(pdf.idle_since().is_some());
    pdf.stop();
    assert!(pdf.idle_since().is_none());
    assert!(render(&pdf, 1).is_ok());
    assert!(!pdf.failed());
}

#[test]
fn reads_the_pdf_again_for_a_new_helper() {
    let reads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counted = reads.clone();
    let pdf = Supervisor::new(
        config(&[]),
        Box::new(move || {
            counted.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(br#"{"pages": ["ok"]}"#.to_vec().into())
        }),
    );
    assert!(render(&pdf, 0).is_ok());
    assert!(render(&pdf, 0).is_ok());
    pdf.stop();
    assert!(render(&pdf, 0).is_ok());
    assert_eq!(reads.load(std::sync::atomic::Ordering::SeqCst), 2);
    let gone = Supervisor::new(
        config(&[]),
        Box::new(|| Err(std::io::ErrorKind::NotFound.into())),
    );
    assert_eq!(gone.open().unwrap_err(), PdfError::Source);
}

#[test]
fn refuses_a_helper_of_another_protocol() {
    let pdf = Supervisor::new(
        config(&["--protocol", "99"]),
        Box::new(|| Ok(br#"{"pages": []}"#.to_vec().into())),
    );
    assert_eq!(pdf.open().unwrap_err(), PdfError::Start);
    let missing = Supervisor::new(
        HelperConfig {
            program: "/no/such/helper".into(),
            ..config(&[])
        },
        Box::new(|| Ok(br#"{"pages": []}"#.to_vec().into())),
    );
    assert_eq!(missing.open().unwrap_err(), PdfError::Start);
}

#[test]
fn the_helper_exits_when_its_stdin_closes() {
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_fake-pdf-helper"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()
        .unwrap();
    drop(child.stdin.take());
    let started = Instant::now();
    while child.try_wait().unwrap().is_none() {
        assert!(started.elapsed() < Duration::from_secs(5), "still running");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(target_os = "linux")]
#[test]
fn limits_the_helpers_address_space() {
    let pdf = supervisor(&["reserve"]);
    assert_eq!(
        render(&pdf, 0).unwrap_err(),
        PdfError::Engine(ErrorKind::TooComplex)
    );
}
