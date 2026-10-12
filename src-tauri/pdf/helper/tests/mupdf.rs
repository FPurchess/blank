//! MuPDF through the shim, on the fixtures of scripts/build-pdf-fixtures.ts.

use std::sync::Arc;

use blank_pdf::mupdf::{Mupdf, MupdfDoc};
use blank_pdf_ipc::engine::{CancelFlag, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{ErrorKind, FieldKind, Rect};

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

fn near(rect: Rect, expected: Rect) -> bool {
    rect.iter().zip(expected).all(|(a, b)| (a - b).abs() < 0.5)
}

/// whether the pixel at `x`, `y` of a page drawn at scale 1 is dark
fn dark(engine: &Mupdf, name: &str, page: usize, points: &[(u32, u32)]) -> Vec<bool> {
    let mut doc = open(engine, name);
    let bitmap = doc.render(page, 1.0, &CancelFlag::default()).unwrap();
    assert_eq!(
        bitmap.rgba.len(),
        (bitmap.width * bitmap.height * 4) as usize
    );
    points
        .iter()
        .map(|&(x, y)| {
            let at = ((y * bitmap.width + x) * 4) as usize;
            assert_eq!(bitmap.rgba[at + 3], 255, "opaque");
            bitmap.rgba[at..at + 3].iter().all(|&channel| channel < 100)
        })
        .collect()
}

#[test]
fn reads_the_pages_in_display_points() {
    let engine = engine();
    let mut form = open(&engine, "form.pdf");
    assert_eq!(form.info().pages, 1);
    let page = form.page(0).unwrap();
    assert_eq!((page.width, page.height, page.rotation), (595.0, 842.0, 0));

    let mut rotated = open(&engine, "rotated.pdf");
    let turned = rotated.page(0).unwrap();
    // the crop box (495 × 742), turned
    assert_eq!(
        (turned.width, turned.height, turned.rotation),
        (742.0, 495.0, 90)
    );
    let a5 = rotated.page(1).unwrap();
    assert_eq!((a5.width, a5.height, a5.rotation), (420.0, 595.0, 0));
    assert_eq!(rotated.page(2).unwrap_err().kind, ErrorKind::BadRequest);
}

#[test]
fn draws_a_page_where_its_content_is() {
    let engine = engine();
    // the box under the field, at [50, 50, 30, 100] once turned and cropped
    assert_eq!(
        dark(
            &engine,
            "rotated.pdf",
            0,
            &[(65, 100), (65, 40), (300, 300)]
        ),
        [true, false, false]
    );
    let mut doc = open(&engine, "rotated.pdf");
    let bitmap = doc.render(0, 2.0, &CancelFlag::default()).unwrap();
    assert_eq!((bitmap.width, bitmap.height), (1484, 990));
}

#[test]
fn stops_a_cancelled_render() {
    let engine = engine();
    let mut doc = open(&engine, "form.pdf");
    let cancel = CancelFlag::default();
    cancel.cancel();
    assert_eq!(
        doc.render(0, 1.0, &cancel).unwrap_err().kind,
        ErrorKind::Cancelled
    );
    assert!(doc.render(0, 1.0, &CancelFlag::default()).is_ok());
}

#[test]
fn reads_the_form() {
    let engine = engine();
    let fields = open(&engine, "form.pdf").fields().unwrap();
    let names: Vec<&str> = fields.iter().map(|field| field.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "name",
            "agree",
            "color",
            "signature",
            "id",
            "address.street",
            "size",
            "fruit"
        ]
    );
    let field = |name: &str| fields.iter().find(|field| field.name == name).unwrap();

    let name = field("name");
    assert_eq!(name.kind, FieldKind::Text);
    assert_eq!(name.label.as_deref(), Some("Your name"));
    assert_eq!(name.flags.max_len, Some(40));
    assert_eq!(name.widgets.len(), 1);
    assert_eq!(name.widgets[0].page, 0);
    // [100 700 300 720] in PDF space, from the top of an A4 page
    assert!(
        near(name.widgets[0].rect, [100.0, 122.0, 200.0, 20.0]),
        "{:?}",
        name.widgets[0].rect
    );

    let agree = field("agree");
    assert_eq!(agree.kind, FieldKind::Checkbox);
    assert_eq!(agree.value, "Off");
    assert_eq!(agree.widgets[0].on_value.as_deref(), Some("Yes"));

    let color = field("color");
    assert_eq!(color.kind, FieldKind::Combo);
    assert_eq!(color.options, ["Red", "Green", "Blue"]);
    assert_eq!(color.value, "Green");

    let size = field("size");
    assert_eq!(size.kind, FieldKind::Radio);
    assert_eq!(size.value, "Off");
    let states: Vec<_> = size
        .widgets
        .iter()
        .map(|widget| widget.on_value.as_deref())
        .collect();
    assert_eq!(states, [Some("S"), Some("L")]);

    let fruit = field("fruit");
    assert_eq!(fruit.kind, FieldKind::List);
    assert_eq!(fruit.options, ["Apple", "Pear"]);
    assert_eq!(fruit.value, "");

    let signature = field("signature");
    assert_eq!(signature.kind, FieldKind::Signature);
    assert!(!signature.signed);

    let id = field("id");
    assert!(id.flags.read_only);
    assert_eq!(id.value, "A-17");
    assert_eq!(
        field("address.street").kind,
        FieldKind::Text,
        "inherits /FT"
    );
}

#[test]
fn places_widgets_on_turned_pages() {
    let engine = engine();
    let fields = open(&engine, "rotated.pdf").fields().unwrap();
    assert_eq!(fields.len(), 1);
    assert!(
        near(fields[0].widgets[0].rect, [50.0, 50.0, 30.0, 100.0]),
        "{:?}",
        fields[0].widgets[0].rect
    );
}

#[test]
fn reads_a_signed_signature_field() {
    let engine = engine();
    let fields = open(&engine, "signature.pdf").fields().unwrap();
    assert_eq!(fields.len(), 1);
    let signature = &fields[0];
    assert_eq!(signature.name, "Signature1");
    assert_eq!(signature.kind, FieldKind::Signature);
    assert!(signature.signed);
    assert_eq!(signature.widgets[0].page, 0);
    assert!(near(signature.widgets[0].rect, [72.0, 720.0, 200.0, 50.0]));
}

#[test]
fn tells_damaged_repaired_and_locked_files_apart() {
    let engine = engine();
    let failed = |bytes: &[u8], password| {
        engine
            .open(bytes.to_vec().into(), password)
            .err()
            .map(|error| error.kind)
    };
    assert_eq!(failed(b"not a PDF at all", None), Some(ErrorKind::Damaged));
    assert_eq!(
        failed(&fixture("password.pdf"), None),
        Some(ErrorKind::NeedsPassword)
    );
    assert_eq!(
        failed(&fixture("password.pdf"), Some("wrong")),
        Some(ErrorKind::NeedsPassword)
    );
    let unlocked = engine
        .open(fixture("password.pdf"), Some("secret"))
        .unwrap();
    assert!(unlocked.info().encrypted);
    let repaired = open(&engine, "repaired.pdf");
    assert!(repaired.info().repaired);
    assert!(!open(&engine, "form.pdf").info().repaired);
}

#[test]
fn fails_a_page_past_its_memory_instead_of_crashing() {
    // the least memory (in steps of 64 KB) that opens the form doesn't draw it
    let (_engine, mut doc) = (4..64)
        .find_map(|step| {
            let engine = Mupdf::new(step << 16, 0)?;
            let doc = engine.open(fixture("form.pdf"), None).ok()?;
            Some((engine, doc))
        })
        .unwrap();
    assert_eq!(
        doc.render(0, 1.0, &CancelFlag::default()).unwrap_err().kind,
        ErrorKind::TooComplex
    );
}

#[test]
fn draws_chinese_in_a_system_font() {
    let has =
        blank_system_fonts::script_face(&Default::default(), "Hani", "zh-Hans", &['中']).is_some();
    if !has {
        assert!(std::env::var_os("CI").is_none(), "CI needs fonts-noto-cjk");
        eprintln!("skipped: no Chinese font on this system");
        return;
    }
    let engine = engine();
    let mut doc = open(&engine, "cjk.pdf");
    let bitmap = doc.render(0, 1.0, &CancelFlag::default()).unwrap();
    // 中文 at 40 pt from (20, 30): ink in the text's box, none above it
    let ink = |y0: u32, y1: u32| {
        (y0..y1)
            .flat_map(|y| (20..100).map(move |x| (x, y)))
            .filter(|&(x, y)| {
                let at = ((y * bitmap.width + x) * 4) as usize;
                bitmap.rgba[at] < 128
            })
            .count()
    };
    assert!(ink(35, 70) > 50, "the characters show");
    assert_eq!(ink(0, 15), 0);
}
