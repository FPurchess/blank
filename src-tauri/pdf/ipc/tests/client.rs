//! The client against the fake helper (src/bin/fake-pdf-helper.rs): answers,
//! cancels, timeouts, crashes, hangs, and when it starts a helper again.

use std::sync::Arc;
use std::time::{Duration, Instant};

use blank_pdf_ipc::client::{HelperConfig, PdfError, Refused, Supervisor, Timeouts};
use blank_pdf_ipc::protocol::{ErrorKind, Field, Fill, FillValue, Op, PageInfo, PageText};

fn config(args: &[&str]) -> HelperConfig {
    HelperConfig {
        program: env!("CARGO_BIN_EXE_fake-pdf-helper").into(),
        args: args.iter().map(|arg| arg.to_string()).collect(),
        quiet: true,
        timeouts: Timeouts {
            render: Duration::from_millis(300),
            // room for a cancelled render to answer on a busy machine, which
            // only the tests of a hang wait out
            cancel: Duration::from_secs(2),
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
fn drops_a_render_cancelled_before_it_was_sent() {
    // e.g. while it waited for the helper to start again, or for the
    // render before it
    let pdf = supervisor(&["ok", "ok"]);
    pdf.cancel(1);
    assert_eq!(
        render(&pdf, 1).unwrap_err(),
        PdfError::Engine(ErrorKind::Cancelled)
    );
    // only that once, and other renders aren't touched
    assert!(render(&pdf, 0).is_ok());
    assert!(render(&pdf, 1).is_ok());
    assert!(!pdf.failed());
}

#[test]
fn ignores_a_cancel_that_comes_after_its_render() {
    let pdf = supervisor(&["ok", "ok"]);
    assert!(render(&pdf, 1).is_ok());
    // its answer was on its way back already
    pdf.cancel(1);
    assert!(render(&pdf, 0).is_ok());
    assert!(render(&pdf, 1).is_ok());
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

#[test]
fn a_helper_outlives_the_thread_that_started_it() {
    // tokio's blocking threads retire when idle: a helper must not die with
    // the thread that spawned it (PR_SET_PDEATHSIG would kill it)
    let pdf = Arc::new(supervisor(&["ok"]));
    let opening = pdf.clone();
    std::thread::spawn(move || opening.open().unwrap())
        .join()
        .unwrap();
    std::thread::sleep(Duration::from_millis(200));
    assert!(render(&pdf, 0).is_ok());
    assert!(!pdf.failed());
}

#[test]
fn asks_for_many_pages_in_batches() {
    let pages = vec!["ok"; 20_000];
    let pdf = supervisor(&pages);
    assert_eq!(pdf.open().unwrap().pages, 20_000);
    // one answer for all of them would outgrow a frame's header
    assert_eq!(
        pdf.ask::<Vec<PageInfo>>(Op::Pages {
            from: 0,
            to: 20_000
        })
        .unwrap_err(),
        PdfError::Engine(ErrorKind::TooComplex)
    );
    assert_eq!(pdf.pages(20_000).unwrap().len(), 20_000);
    assert!(!pdf.failed());
}

#[test]
fn refuses_pixels_that_dont_match_their_size() {
    let pdf = supervisor(&["short", "huge", "ok"]);
    assert_eq!(
        render(&pdf, 0).unwrap_err(),
        PdfError::Engine(ErrorKind::Engine)
    );
    assert_eq!(
        render(&pdf, 1).unwrap_err(),
        PdfError::Engine(ErrorKind::TooComplex)
    );
    assert!(render(&pdf, 2).is_ok());
}

#[test]
fn a_helper_that_talks_nonsense_is_a_crash_and_is_killed() {
    let pdf = Supervisor::new(
        config(&["--garbage"]),
        Box::new(|| Ok(br#"{"pages": ["ok"]}"#.to_vec().into())),
    );
    let started = Instant::now();
    assert_eq!(pdf.open().unwrap_err(), PdfError::Crashed);
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "doesn't wait for the live helper to exit"
    );
}

#[test]
fn doesnt_wait_for_a_request_to_say_whether_it_is_idle() {
    let pdf = Arc::new(supervisor(&["slow", "ok"]));
    pdf.open().unwrap();
    let rendering = pdf.clone();
    let thread = std::thread::spawn(move || render(&rendering, 0));
    std::thread::sleep(Duration::from_millis(50));
    let started = Instant::now();
    assert!(pdf.idle_since().is_none(), "in use");
    pdf.stop();
    assert!(started.elapsed() < Duration::from_millis(50));
    assert_eq!(thread.join().unwrap().unwrap_err(), PdfError::TimedOut);
    assert!(pdf.idle_since().is_some(), "not stopped while in use");
}

#[test]
fn refuses_a_pdf_bigger_than_a_frame() {
    let pdf = Supervisor::new(
        config(&[]),
        Box::new(|| Ok(vec![b' '; (blank_pdf_ipc::frame::MAX_BODY + 1) as usize].into())),
    );
    assert_eq!(
        pdf.open().unwrap_err(),
        PdfError::Engine(ErrorKind::TooComplex)
    );
    assert!(!pdf.failed());
}

fn fill(field: &str, value: FillValue) -> Fill {
    Fill {
        field: field.into(),
        value,
    }
}

#[test]
fn keeps_the_fills_for_a_new_helper() {
    let pdf = supervisor(&["ok", "crash"]);
    let fills = vec![
        fill("name", FillValue::Text("Ada".into())),
        fill("agree", FillValue::Checked(true)),
    ];
    assert_eq!(pdf.set_fills(fills.clone()).unwrap(), [0, 1]);
    assert!(
        pdf.set_fills(fills.clone()).unwrap().is_empty(),
        "nothing changed"
    );
    // a refusal names the field whose fill failed
    assert_eq!(
        pdf.set_fills(vec![
            fill("agree", FillValue::Checked(false)),
            fill("name", FillValue::Text("中".into()))
        ])
        .unwrap_err(),
        Refused {
            error: PdfError::Engine(ErrorKind::MissingGlyphs),
            field: Some("name".into())
        }
    );
    assert_eq!(
        pdf.set_fills(vec![fill("agree", FillValue::Text("Yes".into()))])
            .unwrap_err(),
        Refused {
            error: PdfError::Engine(ErrorKind::BadRequest),
            field: Some("agree".into())
        }
    );
    assert_eq!(pdf.fills(), fills, "a refused set keeps the last");
    assert_eq!(
        pdf.set_fills(vec![fill("name", FillValue::Text("Ada".into()))])
            .unwrap(),
        [1],
        "only the checkbox changed"
    );
    assert_eq!(pdf.set_fills(fills.clone()).unwrap(), [1]);

    assert_eq!(render(&pdf, 1).unwrap_err(), PdfError::Crashed);
    // the new helper has them again
    let fields: Vec<Field> = pdf.ask(Op::Fields).unwrap();
    let values: Vec<&str> = fields.iter().map(|field| field.value.as_str()).collect();
    assert_eq!(values, ["Ada", "Yes"]);
    let saved = pdf.save().unwrap();
    let opened = serde_json::to_vec(&serde_json::json!({ "pages": ["ok", "crash"] })).unwrap();
    assert!(saved.starts_with(&opened) && saved.len() > opened.len());

    assert_eq!(pdf.set_fills(vec![]).unwrap(), [0, 1], "both changed back");
    assert_eq!(pdf.save().unwrap(), opened);
}

#[test]
fn reads_a_pages_text() {
    let pdf = supervisor(&["ok", "ok"]);
    let text: PageText = pdf.ask(Op::Text { page: 1 }).unwrap();
    let words: Vec<&str> = text.words.iter().map(|word| word.text.as_str()).collect();
    assert_eq!(words, ["page", "1"]);
    assert_eq!(text.rules, [[1.0, 4.0, 8.0, 0.5]]);
    assert_eq!(
        pdf.ask::<PageText>(Op::Text { page: 2 }).unwrap_err(),
        PdfError::Engine(ErrorKind::BadRequest)
    );
}

#[test]
fn takes_a_saved_pdf_bigger_than_a_pages_pixels() {
    // past MAX_PIXELS × 4, the most of any other answer: save's own limit
    // must hold for its answer, not the next one
    let pad = "x".repeat(70 << 20);
    let pdf: Arc<[u8]> = serde_json::to_vec(&serde_json::json!({ "pages": ["ok"], "pad": pad }))
        .unwrap()
        .into();
    let opened = pdf.clone();
    let supervisor = Supervisor::new(config(&[]), Box::new(move || Ok(pdf.clone())));
    supervisor
        .set_fills(vec![fill("name", FillValue::Text("Ada".into()))])
        .unwrap();
    let saved = supervisor.save().unwrap();
    assert!(saved.starts_with(&opened) && saved.len() > opened.len());
    assert_eq!(supervisor.save().unwrap(), saved, "and again");
    assert!(!supervisor.failed());
    // a render after it is held to a page's pixels again
    assert!(render(&supervisor, 0).is_ok());
}
