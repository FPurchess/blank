use lopdf::{dictionary, Document, Object, Stream};

use super::*;
use crate::signing::verify::verify_pdf;

/// a PDF of one A4 page with a line of text, as lopdf writes it
fn pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages = doc.new_object_id();
    let font = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let content = doc.add_object(Stream::new(
        dictionary! {},
        b"BT /F1 12 Tf 72 770 Td (Signed below) Tj ET".to_vec(),
    ));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages, "Contents" => content,
        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => font } },
    });
    doc.objects.insert(
        pages,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![page.into()], "Count" => 1,
        }),
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages });
    doc.trailer.set("Root", catalog);
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).unwrap();
    bytes
}

fn options(rect: Option<[f64; 4]>) -> SignOptions {
    SignOptions {
        page: 1,
        rect,
        name: Some("Ada Lovelace".into()),
        location: Some("Zürich".into()),
        reason: None,
        timestamp_server: None,
    }
}

// a key made once, with few rounds of PBKDF2, which opens fast
fn key() -> &'static [u8] {
    static KEY: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    KEY.get_or_init(|| {
        keys::create_certificate_with(
            "Ada Lovelace",
            Some("ada@example.org"),
            "correct horse",
            1000,
        )
        .unwrap()
    })
}

#[test]
fn makes_a_certificate_for_signing_documents() {
    let identity = keys::load_p12(key(), "correct horse").unwrap();
    let shown = info(&identity.cert).unwrap();
    assert_eq!(shown.name, "Ada Lovelace");
    assert!(shown.self_signed);
    assert_eq!(shown.fingerprint.len(), 64);
}

#[test]
fn signs_a_pdf_after_its_bytes_and_the_signature_checks_out() {
    let original = pdf();
    let signed = sign(
        key(),
        "correct horse",
        &original,
        &options(Some([300., 700., 200., 60.])),
    )
    .unwrap();
    // an incremental update: the original bytes stay as they were
    assert!(signed.starts_with(&original));
    let reports = verify_pdf(&signed).unwrap();
    assert_eq!(reports.len(), 1);
    assert!(reports[0].valid(), "{:?}", reports[0].checks);
    assert_eq!(reports[0].sub_filter, "ETSI.CAdES.detached");
    assert!(reports[0]
        .signer
        .as_ref()
        .is_some_and(|signer| signer.subject.contains("Ada Lovelace")));
}

#[test]
fn signs_invisibly_and_twice() {
    let once = sign(key(), "correct horse", &pdf(), &options(None)).unwrap();
    let twice = sign(key(), "correct horse", &once, &options(None)).unwrap();
    let reports = verify_pdf(&twice).unwrap();
    assert_eq!(reports.len(), 2);
    // the first one still checks out
    assert!(reports.iter().all(|report| report.valid()));
}

#[test]
fn finds_a_change_after_signing() {
    let mut signed = sign(key(), "correct horse", &pdf(), &options(None)).unwrap();
    // a byte of the page's text changed
    let at = signed.windows(6).position(|w| w == b"Signed").unwrap();
    signed[at] = b'X';
    assert!(!verify_pdf(&signed).unwrap()[0].valid());
}

#[test]
fn says_when_the_passphrase_is_wrong() {
    assert!(matches!(
        sign(key(), "wrong", &pdf(), &options(None)),
        Err(SigningError::WrongPassphrase)
    ));
}

#[test]
fn refuses_what_isnt_a_pdf_without_quoting_it() {
    let Err(SigningError::Failed(message)) =
        sign(key(), "correct horse", b"%PDF-1.7 junk", &options(None))
    else {
        panic!("signed what isn't a PDF");
    };
    assert_eq!(message, "Blank couldn't sign the PDF");
}

#[test]
fn decodes_the_header_the_webview_encodes() {
    assert_eq!(
        percent_decode("%7B%22a%22%3A%22Z%C3%BCrich%22%7D").as_deref(),
        Some("{\"a\":\"Zürich\"}")
    );
    assert_eq!(percent_decode("%Z1"), None);
}
