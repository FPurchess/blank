//! The helper as the app runs it: the binary, through the client.

use std::sync::Arc;
use std::time::Instant;

use blank_pdf_ipc::client::{HelperConfig, Supervisor, Timeouts};
use blank_pdf_ipc::protocol::{Op, PageInfo};

#[test]
fn serves_a_pdf_to_the_client() {
    let path = format!("{}/../fixtures/rotated.pdf", env!("CARGO_MANIFEST_DIR"));
    let pdf: Arc<[u8]> = std::fs::read(path).unwrap().into();
    let config = HelperConfig {
        program: env!("CARGO_BIN_EXE_blank-pdf").into(),
        args: vec!["--memory-limit-mb".into(), "256".into()],
        quiet: true,
        timeouts: Timeouts::default(),
    };
    let started = Instant::now();
    let supervisor = Supervisor::new(config, Box::new(move || Ok(pdf.clone())));
    assert_eq!(supervisor.open().unwrap().pages, 2);
    let opened = started.elapsed();
    let pages: Vec<PageInfo> = supervisor.ask(Op::Pages { from: 0, to: 2 }).unwrap();
    assert_eq!((pages[0].width, pages[0].height), (742.0, 495.0));

    let (info, pixels) = supervisor
        .request(
            Op::Render {
                page: 0,
                scale: 1.0,
            },
            None,
        )
        .unwrap();
    let first = started.elapsed();
    assert_eq!(pixels.len(), 742 * 495 * 4);
    assert_eq!(info["width"], 742);

    // what a sharp page at 3× takes, the helper warm
    let mut rounds = vec![];
    for _ in 0..3 {
        let at = Instant::now();
        let (_, pixels) = supervisor
            .request(
                Op::Render {
                    page: 1,
                    scale: 3.0,
                },
                None,
            )
            .unwrap();
        rounds.push(at.elapsed());
        assert_eq!(pixels.len(), 1260 * 1785 * 4);
    }
    rounds.sort();
    eprintln!(
        "helper started and opened in {opened:?}, first page at 1× after {first:?}, A5 at 3× (9 MB) in {:?} (median of 3)",
        rounds[1]
    );
}

#[test]
fn fills_a_form_in_and_saves_it_through_the_client() {
    use blank_pdf_ipc::protocol::{Field, Fill, FillValue, PageText};
    let path = format!("{}/../fixtures/form.pdf", env!("CARGO_MANIFEST_DIR"));
    let pdf: Arc<[u8]> = std::fs::read(path).unwrap().into();
    let config = HelperConfig {
        program: env!("CARGO_BIN_EXE_blank-pdf").into(),
        args: vec!["--memory-limit-mb".into(), "256".into()],
        quiet: true,
        timeouts: Timeouts::default(),
    };
    let original = pdf.clone();
    let supervisor = Supervisor::new(config, Box::new(move || Ok(pdf.clone())));
    let text: PageText = supervisor.ask(Op::Text { page: 0 }).unwrap();
    assert_eq!(text.words[0].text, "Contract");
    let fills = vec![
        Fill {
            field: "name".into(),
            value: FillValue::Text("Ada".into()),
        },
        Fill {
            field: "agree".into(),
            value: FillValue::Checked(true),
        },
    ];
    assert_eq!(supervisor.set_fills(fills).unwrap(), [0]);
    let fields: Vec<Field> = supervisor.ask(Op::Fields).unwrap();
    assert_eq!(fields[0].value, "Ada");
    let saved = supervisor.save().unwrap();
    assert!(saved.starts_with(&original) && saved.len() > original.len());
}
