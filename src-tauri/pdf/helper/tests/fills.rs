//! A page's text, and filling the form in, on the fixtures of
//! scripts/build-pdf-fixtures.ts, checked with poppler and qpdf where they
//! are installed (CI has them: there a missing tool fails the test).

use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::Arc;

use blank_pdf::mupdf::{Mupdf, MupdfDoc};
use blank_pdf_ipc::engine::{CancelFlag, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{ErrorKind, Field, Fill, FillValue, Rect};

fn fixture(name: &str) -> Arc<[u8]> {
    let path = format!("{}/../fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(path).unwrap().into()
}

fn engine() -> Mupdf {
    Mupdf::new(256 << 20, 32 << 20).unwrap()
}

fn open(engine: &Mupdf, name: &str) -> MupdfDoc {
    engine.open(fixture(name), None).unwrap()
}

/// whether `tool` runs; without it a test is skipped, except on CI
fn has(tool: &str) -> bool {
    let found = Command::new(tool)
        .arg("-v")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok();
    if !found {
        assert!(std::env::var_os("CI").is_none(), "CI needs {tool}");
        eprintln!("skipped: no {tool}");
    }
    found
}

/// runs `tool` with `args` and the PDF `pdf` as a file, then `-` (stdout)
fn run(tool: &str, args: &[&str], pdf: &[u8]) -> (bool, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("in.pdf");
    std::fs::File::create(&path)
        .unwrap()
        .write_all(pdf)
        .unwrap();
    let output = Command::new(tool)
        .args(args)
        .arg(&path)
        .args(if tool == "qpdf" { vec![] } else { vec!["-"] })
        .output()
        .unwrap();
    (
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
    )
}

/// pdftotext's words on `page` (from 0) with their boxes, `[x, y, w, h]`
fn poppler_words(pdf: &[u8], page: usize) -> Vec<(String, Rect)> {
    let first = (page + 1).to_string();
    let (ok, html) = run("pdftotext", &["-bbox", "-f", &first, "-l", &first], pdf);
    assert!(ok);
    html.lines()
        .filter_map(|line| {
            let line = line.trim().strip_prefix("<word ")?;
            let number = |name: &str| -> f32 {
                let at = line.find(&format!("{name}=\"")).unwrap() + name.len() + 2;
                line[at..].split('"').next().unwrap().parse().unwrap()
            };
            let text = line.split('>').nth(1)?.split('<').next()?.to_string();
            let (x0, y0) = (number("xMin"), number("yMin"));
            Some((text, [x0, y0, number("xMax") - x0, number("yMax") - y0]))
        })
        .collect()
}

/// whether the edges of `rect` are each within `within` of `expected`'s
fn near(rect: Rect, expected: Rect, within: f32) -> bool {
    let edges = |[x, y, w, h]: Rect| [x, y, x + w, y + h];
    edges(rect)
        .iter()
        .zip(edges(expected))
        .all(|(a, b)| (a - b).abs() <= within)
}

#[test]
fn reads_the_words_and_lines_of_a_page() {
    let engine = engine();
    let text = open(&engine, "form.pdf").text(0).unwrap();
    let words: Vec<&str> = text.words.iter().map(|word| word.text.as_str()).collect();
    // the page's own text, not the values of its fields
    assert_eq!(
        words,
        [
            "Contract",
            "Unterschrift",
            "Ort,",
            "Datum:",
            "______________"
        ]
    );
    // the line over "Unterschrift": 100 490 to 300 490, 0.5 pt wide; the
    // underscores are a word, not a line
    assert_eq!(text.rules.len(), 1, "{:?}", text.rules);
    assert!(
        near(text.rules[0], [100.0, 351.75, 200.0, 0.5], 1.0),
        "{:?}",
        text.rules[0]
    );

    if !has("pdftotext") {
        return;
    }
    for word in &text.words {
        let poppler = poppler_words(&fixture("form.pdf"), 0);
        let (_, expected) = poppler.iter().find(|(text, _)| *text == word.text).unwrap();
        assert!(
            near(word.rect, *expected, 1.0),
            "{}: {:?}, pdftotext {:?}",
            word.text,
            word.rect,
            expected
        );
    }
}

#[test]
fn reads_the_words_of_turned_and_cropped_pages() {
    let engine = engine();
    let mut doc = open(&engine, "rotated.pdf");
    let turned = doc.text(0).unwrap();
    assert_eq!(turned.words.len(), 1);
    assert_eq!(turned.words[0].text, "Turned");
    // the filled box is no line: 30 pt high
    assert!(turned.rules.is_empty());
    let a5 = doc.text(1).unwrap();
    assert_eq!(a5.words[0].text, "A5");
    assert_eq!(doc.text(2).unwrap_err().kind, ErrorKind::BadRequest);

    if !has("pdftotext") {
        return;
    }
    // pdftotext turns the page, but from the media box: the crop box is
    // 50 pt in on both sides
    let (_, [x, y, w, h]) = poppler_words(&fixture("rotated.pdf"), 0).remove(0);
    let expected = [x - 50.0, y - 50.0, w, h];
    assert!(
        near(turned.words[0].rect, expected, 1.0),
        "{:?}, pdftotext {expected:?}",
        turned.words[0].rect
    );
    let (_, expected) = poppler_words(&fixture("rotated.pdf"), 1).remove(0);
    assert!(near(a5.words[0].rect, expected, 1.0));
}

fn fill(field: &str, value: &str) -> Fill {
    Fill {
        field: field.into(),
        value: FillValue::Text(value.into()),
    }
}

fn check(field: &str, checked: bool) -> Fill {
    Fill {
        field: field.into(),
        value: FillValue::Checked(checked),
    }
}

fn values(fields: &[Field]) -> Vec<(&str, &str)> {
    fields
        .iter()
        .map(|field| (field.name.as_str(), field.value.as_str()))
        .collect()
}

fn the_fills() -> Vec<Fill> {
    vec![
        fill("name", "Ada Müller"),
        check("agree", true),
        fill("color", "Blue"),
        fill("address.street", "Main Street 1"),
        fill("size", "L"),
        fill("fruit", "Pear"),
    ]
}

const FILLED: [(&str, &str); 8] = [
    ("name", "Ada Müller"),
    ("agree", "Yes"),
    ("color", "Blue"),
    ("signature", ""),
    ("id", "A-17"),
    ("address.street", "Main Street 1"),
    ("size", "L"),
    ("fruit", "Pear"),
];

/// whether the middle of a widget of `rect` is dark on a page drawn at scale 1
fn inked(doc: &mut MupdfDoc, rect: Rect) -> bool {
    let bitmap = doc.render(0, 1.0, &CancelFlag::default()).unwrap();
    let (x, y) = (
        (rect[0] + rect[2] / 2.0) as u32,
        (rect[1] + rect[3] / 2.0) as u32,
    );
    let at = ((y * bitmap.width + x) * 4) as usize;
    bitmap.rgba[at] < 100
}

#[test]
fn fills_the_form_in_and_draws_it_so() {
    let engine = engine();
    let mut doc = open(&engine, "form.pdf");
    let fields = doc.fields().unwrap();
    let widget = |name: &str, at: usize| {
        fields
            .iter()
            .find(|field| field.name == name)
            .unwrap()
            .widgets[at]
            .clone()
    };
    let (agree, large) = (widget("agree", 0), widget("size", 1));
    assert_eq!(widget("size", 0).on_value.as_deref(), Some("S"));
    assert_eq!(large.on_value.as_deref(), Some("L"));
    assert!(!inked(&mut doc, agree.rect));

    assert_eq!(doc.set_fills(&the_fills()).unwrap(), [0]);
    assert_eq!(values(&doc.fields().unwrap()), FILLED);
    assert!(inked(&mut doc, agree.rect), "the checkbox shows its check");
    assert!(inked(&mut doc, large.rect), "and the radio button L");
    assert!(!inked(&mut doc, widget("size", 0).rect));

    // the same set again changes nothing; another undoes the rest
    assert!(doc.set_fills(&the_fills()).unwrap().is_empty());
    doc.set_fills(&[fill("size", "S"), check("agree", false)])
        .unwrap();
    let fields = doc.fields().unwrap();
    let values = values(&fields);
    assert_eq!(values[0], ("name", ""), "an earlier fill isn't kept");
    assert_eq!(values[1], ("agree", "Off"));
    assert_eq!(values[6], ("size", "S"));
    assert!(!inked(&mut doc, agree.rect));
}

#[test]
fn saves_the_fills_as_an_update_of_the_pdf() {
    let engine = engine();
    let original = fixture("form.pdf");
    let mut doc = open(&engine, "form.pdf");
    assert_eq!(doc.save_incremental().unwrap(), &original[..], "no fills");
    doc.set_fills(&the_fills()).unwrap();
    let saved = doc.save_incremental().unwrap();
    assert!(saved.starts_with(&original) && saved.len() > original.len());
    assert_eq!(doc.save_incremental().unwrap(), saved, "the same again");

    // read back, by MuPDF
    let mut reopened = engine.open(saved.clone().into(), None).unwrap();
    assert!(!reopened.info().repaired);
    assert_eq!(values(&reopened.fields().unwrap()), FILLED);

    if has("qpdf") {
        let (ok, _) = run("qpdf", &["--check"], &saved);
        assert!(ok, "qpdf --check");
    }
    if has("pdftotext") {
        let (ok, text) = run("pdftotext", &[], &saved);
        assert!(ok);
        for value in ["Ada Müller", "Main Street 1", "Blue"] {
            assert!(text.contains(value), "{value} in {text}");
        }
    }
}

#[test]
fn saves_a_fill_on_a_turned_page() {
    let engine = engine();
    let original = fixture("rotated.pdf");
    let mut doc = open(&engine, "rotated.pdf");
    assert_eq!(doc.set_fills(&[fill("stamp", "Signed")]).unwrap(), [0]);
    let saved = doc.save_incremental().unwrap();
    assert!(saved.starts_with(&original));
    if has("pdftotext") {
        let (_, text) = run("pdftotext", &["-f", "1", "-l", "1"], &saved);
        assert!(text.contains("Signed"), "{text}");
    }
}

#[test]
fn refuses_what_a_field_cant_take() {
    let engine = engine();
    let mut doc = open(&engine, "form.pdf");
    doc.set_fills(&[fill("name", "Ada")]).unwrap();
    let refused = |doc: &mut MupdfDoc, fills: &[Fill]| doc.set_fills(fills).unwrap_err().kind;
    // Helvetica in Windows-1252: no Chinese, no Polish Ł
    for value in ["中文", "Łukasz", "Ada \u{1F600}"] {
        assert_eq!(
            refused(&mut doc, &[fill("name", value)]),
            ErrorKind::MissingGlyphs,
            "{value}"
        );
    }
    for fills in [
        vec![fill("id", "B-2")],             // read-only
        vec![fill("nobody", "x")],           // no such field
        vec![fill("address", "x")],          // not a field to fill in
        vec![fill("addr", "x")],             // a part of a name
        vec![fill("signature", "x")],        // signed elsewhere
        vec![fill("name", &"x".repeat(41))], // its /MaxLen is 40
        vec![fill("name", "two\nlines")],    // one line only
        vec![fill("agree", "Yes")],          // a checkbox takes true or false
        vec![check("name", true)],
        vec![fill("size", "XL")],   // not one of its buttons
        vec![fill("fruit", "Fig")], // not one of its options
        vec![fill("color", "Teal")],
    ] {
        assert_eq!(
            refused(&mut doc, &fills),
            ErrorKind::BadRequest,
            "{fills:?}"
        );
    }
    // the last set that held stays
    assert_eq!(values(&doc.fields().unwrap())[0], ("name", "Ada"));
    // a radio button group can be emptied, a choice too
    doc.set_fills(&[fill("size", "Off"), fill("color", "")])
        .unwrap();
}

#[test]
fn refuses_to_save_a_repaired_or_encrypted_pdf() {
    let engine = engine();
    let mut repaired = open(&engine, "repaired.pdf");
    repaired.set_fills(&[fill("name", "Ada")]).unwrap();
    assert_eq!(
        repaired.save_incremental().unwrap_err().kind,
        ErrorKind::Repaired
    );
    let mut locked = engine
        .open(fixture("password.pdf"), Some("secret"))
        .unwrap();
    locked.set_fills(&[fill("name", "Ada")]).unwrap();
    assert_eq!(values(&locked.fields().unwrap())[0], ("name", "Ada"));
    assert_eq!(
        locked.save_incremental().unwrap_err().kind,
        ErrorKind::Encrypted
    );
}

#[test]
fn shows_and_fills_choices_by_their_display_texts() {
    let engine = engine();
    let mut doc = open(&engine, "choices.pdf");
    let shown = |doc: &mut MupdfDoc| {
        doc.fields()
            .unwrap()
            .into_iter()
            .map(|field| (field.name, field.value, field.options))
            .collect::<Vec<_>>()
    };
    let fields = shown(&mut doc);
    assert_eq!(
        fields[0],
        (
            "country".into(),
            "Germany".into(),
            vec!["Germany".into(), "Łódź".into(), "Omega".into()]
        ),
        "the display text of the option /V exports"
    );
    assert_eq!(
        (fields[1].1.as_str(), &fields[1].2[..]),
        ("Dog", &["Cat".to_string(), "Dog".to_string()][..])
    );

    // by its display text; MuPDF draws a combo box's export value, which
    // Helvetica shows for Łódź ("pl") and not for Omega (Ω)
    doc.set_fills(&[fill("country", "Łódź"), fill("pets", "Cat")])
        .unwrap();
    let fields = shown(&mut doc);
    assert_eq!(
        (fields[0].1.as_str(), fields[1].1.as_str()),
        ("Łódź", "Cat")
    );
    let refused = |doc: &mut MupdfDoc, fills: &[Fill]| doc.set_fills(fills).unwrap_err();
    let omega = refused(&mut doc, &[fill("pets", "Dog"), fill("country", "Omega")]);
    assert_eq!(omega.kind, ErrorKind::MissingGlyphs);
    assert_eq!(omega.fill, Some(1), "the fill that failed");
    // a list box shows all its options, β among them, whichever is chosen
    let letters = refused(&mut doc, &[fill("letters", "Alpha")]);
    assert_eq!(
        (letters.kind, letters.fill),
        (ErrorKind::MissingGlyphs, Some(0))
    );

    // saved, the exported values
    doc.set_fills(&[fill("country", "Łódź"), fill("pets", "Cat")])
        .unwrap();
    let saved = doc.save_incremental().unwrap();
    let text = String::from_utf8_lossy(&saved);
    let update = &text[fixture("choices.pdf").len()..];
    assert!(
        update.contains("/V(pl)") || update.contains("/V (pl)"),
        "{update}"
    );
    assert!(
        update.contains("/V(c)") || update.contains("/V (c)"),
        "{update}"
    );
}

#[test]
fn fills_a_tab_in_as_a_space() {
    let engine = engine();
    let mut doc = open(&engine, "form.pdf");
    doc.set_fills(&[fill("name", "Ada\tMüller")]).unwrap();
    assert_eq!(values(&doc.fields().unwrap())[0], ("name", "Ada Müller"));
}
