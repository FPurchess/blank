use lopdf::{dictionary, Document, Object, ObjectId, Stream};

use super::*;
use crate::signing::verify::verify_pdf;

const PASSPHRASE: &str = "correct horse";

/// a PDF of `pages` A4 pages with a line of text each, as lopdf writes it;
/// `modern` writes object streams and a cross-reference stream
fn pdf_of(pages: usize, modern: bool) -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let parent = doc.new_object_id();
    let font = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let kids: Vec<Object> = (0..pages)
        .map(|_| {
            let content = doc.add_object(Stream::new(
                dictionary! {},
                b"BT /F1 12 Tf 72 770 Td (Signed below) Tj ET".to_vec(),
            ));
            doc.add_object(dictionary! {
                "Type" => "Page", "Parent" => parent, "Contents" => content,
                "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => font } },
            })
            .into()
        })
        .collect();
    doc.objects.insert(
        parent,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => kids, "Count" => pages as i64,
        }),
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => parent });
    doc.trailer.set("Root", catalog);
    let mut bytes = Vec::new();
    if modern {
        doc.save_modern(&mut bytes).unwrap();
    } else {
        doc.save_to(&mut bytes).unwrap();
    }
    bytes
}

fn pdf() -> Vec<u8> {
    pdf_of(1, false)
}

/// what Blank's layout engine writes, see fixtures/README.md
const BLANK_PDF: &[u8] = include_bytes!("../fixtures/blank.pdf");
/// an RSA key from OpenSSL, see fixtures/README.md
const RSA_KEY: &[u8] = include_bytes!("../fixtures/rsa.p12");

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
        keys::create_certificate_with("Ada Lovelace", Some("ada@example.org"), PASSPHRASE, 1000)
            .unwrap()
            .0
    })
}

/// signs `pdf` and checks that it was appended and checks out
fn signed(key: &[u8], pdf: &[u8], options: &SignOptions) -> Vec<u8> {
    let signed = sign(key, PASSPHRASE, pdf, options).unwrap();
    // an incremental update: the original bytes stay as they were
    assert!(signed.starts_with(pdf));
    let reports = verify_pdf(&signed).unwrap();
    let last = reports.last().unwrap();
    assert!(last.valid(), "{:?}", last.checks);
    assert!(last.covers_the_whole_file(), "{}", last.coverage);
    signed
}

/// the signature widgets on each page of `pdf`, by page number
fn widgets(pdf: &[u8]) -> Vec<(u32, lopdf::Dictionary)> {
    let doc = Document::load_mem(pdf).unwrap();
    let mut found = vec![];
    for (number, page) in doc.get_pages() {
        let Ok(annots) = doc
            .get_dictionary(page)
            .unwrap()
            .get(b"Annots")
            .and_then(|annots| doc.dereference(annots))
            .and_then(|(_, annots)| annots.as_array())
        else {
            continue;
        };
        for annot in annots {
            let id: ObjectId = annot.as_reference().unwrap();
            let widget = doc.get_dictionary(id).unwrap().clone();
            if widget.get(b"FT").and_then(Object::as_name).ok() == Some(b"Sig") {
                found.push((number, widget));
            }
        }
    }
    found
}

fn numbers(array: &Object) -> Vec<f64> {
    array
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_float().map(f64::from).unwrap())
        .collect()
}

#[test]
fn makes_a_certificate_for_signing_documents() {
    let identity = keys::load_p12(key(), PASSPHRASE).unwrap();
    let shown = CertificateInfo::from_der(&identity.cert).unwrap();
    assert_eq!(shown.name, "Ada Lovelace");
    assert_eq!(shown.issuer, "Ada Lovelace");
    assert!(shown.self_signed);
    assert_eq!(shown.fingerprint.len(), 64);
    // the names the webview reads
    let json = serde_json::to_value(&shown).unwrap();
    for field in [
        "name",
        "issuer",
        "notBefore",
        "notAfter",
        "selfSigned",
        "fingerprint",
    ] {
        assert!(json.get(field).is_some(), "{field}");
    }
}

#[test]
fn signs_a_pdf_after_its_bytes_and_the_signature_checks_out() {
    let signed = signed(key(), &pdf(), &options(Some([300., 700., 200., 60.])));
    let reports = verify_pdf(&signed).unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].sub_filter, "ETSI.CAdES.detached");
    assert!(reports[0]
        .signer
        .as_ref()
        .is_some_and(|signer| signer.name == "Ada Lovelace"));
}

#[test]
fn puts_the_field_over_the_block() {
    let signed = signed(key(), &pdf(), &options(Some([300., 700., 200., 60.])));
    let widgets = widgets(&signed);
    let [(1, widget)] = widgets.as_slice() else {
        panic!("{widgets:?}");
    };
    assert_eq!(
        widget.get(b"Subtype").unwrap().as_name().unwrap(),
        b"Widget"
    );
    // 700 from the top of an 842 pt page, 60 high: from 82 to 142
    assert_eq!(
        numbers(widget.get(b"Rect").unwrap()),
        [300., 82., 500., 142.]
    );
}

#[test]
fn puts_the_field_on_the_page_asked_for() {
    let original = pdf_of(2, false);
    let signed = signed(
        key(),
        &original,
        &SignOptions {
            page: 2,
            ..options(Some([72., 72., 100., 40.]))
        },
    );
    let pages: Vec<u32> = widgets(&signed).iter().map(|(page, _)| *page).collect();
    assert_eq!(pages, [2]);
}

#[test]
fn signs_what_blank_exports() {
    let signed = signed(key(), BLANK_PDF, &options(Some([72., 200., 200., 60.])));
    // A4 as the engine writes it, 841.89 pt high
    let widgets = widgets(&signed);
    let rect = numbers(widgets[0].1.get(b"Rect").unwrap());
    assert!((rect[1] - (841.89 - 260.)).abs() < 0.01, "{rect:?}");
}

#[test]
fn signs_a_pdf_with_a_cross_reference_stream() {
    signed(
        key(),
        &pdf_of(1, true),
        &options(Some([300., 700., 200., 60.])),
    );
}

#[test]
fn signs_with_an_rsa_key() {
    let signed = signed(RSA_KEY, &pdf(), &options(None));
    let reports = verify_pdf(&signed).unwrap();
    assert!(reports[0]
        .signature_algorithm
        .contains("sha256WithRSAEncryption"));
    assert!(reports[0]
        .signer
        .as_ref()
        .is_some_and(|signer| signer.name == "Lovelace, Ada"));
}

#[test]
fn signs_invisibly_and_twice() {
    let once = signed(key(), &pdf(), &options(None));
    let twice = signed(key(), &once, &options(None));
    let reports = verify_pdf(&twice).unwrap();
    assert_eq!(reports.len(), 2);
    // the first one still checks out, and was signed again later
    assert!(reports.iter().all(|report| report.valid()));
    assert!(!reports[0].covers_the_whole_file());
}

#[test]
fn signs_again_with_more_room_when_the_signature_doesnt_fit() {
    let identity = keys::load_p12(key(), PASSPHRASE).unwrap();
    let original = pdf();
    let request = SignRequest {
        identity: &identity,
        page: 1,
        rect: None,
        reason: None,
        location: None,
        name: None,
        tsa: None,
        reserve: 64,
    };
    let signed = sign_pdf(&original, &request).unwrap();
    assert!(signed.starts_with(&original));
    check_signed(&signed).unwrap();
}

#[test]
fn finds_a_change_after_signing() {
    let mut signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    // a byte of the page's text changed
    let at = signed.windows(6).position(|w| w == b"Signed").unwrap();
    signed[at] = b'X';
    assert!(!verify_pdf(&signed).unwrap()[0].valid());
}

#[test]
fn finds_what_was_added_after_signing() {
    let signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    // an update after the signature, which no signature covers
    let doc = Document::load_mem(&signed).unwrap();
    let mut update = lopdf::IncrementalDocument::create_from(signed.clone(), doc);
    update
        .new_document
        .add_object(Object::string_literal("appended"));
    let mut signed = vec![];
    update.save_to(&mut signed).unwrap();
    let reports = verify_pdf(&signed).unwrap();
    // the signature itself still checks out, but not the file
    assert!(reports[0].valid());
    assert!(!reports[0].covers_the_whole_file());
    assert!(reports[0].coverage.starts_with("CHANGED AFTER SIGNING"));
    assert!(check_signed(&signed).is_err());
}

/// validated adds `change` to the signed `pdf` as an unsigned update, and
/// gives the catalog a /DSS holding a certificate, plus what `held` adds to
/// its /Certs
fn validated(
    pdf: &[u8],
    change: impl FnOnce(&mut lopdf::IncrementalDocument),
    held: impl FnOnce(&mut lopdf::IncrementalDocument) -> Vec<Object>,
) -> Vec<u8> {
    let doc = Document::load_mem(pdf).unwrap();
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    let mut update = lopdf::IncrementalDocument::create_from(pdf.to_vec(), doc);
    change(&mut update);
    let cert = update
        .new_document
        .add_object(Stream::new(dictionary! {}, b"a certificate".to_vec()));
    let mut certs: Vec<Object> = vec![cert.into()];
    certs.extend(held(&mut update));
    let dss = update
        .new_document
        .add_object(dictionary! { "Type" => "DSS", "Certs" => certs });
    update.opt_clone_object_to_new_document(root).unwrap();
    update
        .new_document
        .get_dictionary_mut(root)
        .unwrap()
        .set("DSS", dss);
    let mut out = vec![];
    update.save_to(&mut out).unwrap();
    out
}

/// the content stream of the first page
fn first_contents(update: &lopdf::IncrementalDocument) -> ObjectId {
    let doc = update.get_prev_documents();
    let page = *doc.get_pages().get(&1).unwrap();
    doc.get_dictionary(page)
        .unwrap()
        .get(b"Contents")
        .unwrap()
        .as_reference()
        .unwrap()
}

#[test]
fn takes_validation_data_added_after_signing_for_what_it_is() {
    let signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    let modern = sign(key(), PASSPHRASE, &pdf_of(1, true), &options(None)).unwrap();
    // lopdf writes the update's cross-references as a stream, read here by
    // Blank's own reader of them
    for signed in [signed, modern] {
        let out = validated(&signed, |_| {}, |_| vec![]);
        let reports = verify_pdf(&out).unwrap();
        assert!(reports[0].valid());
        assert_eq!(
            reports[0].coverage,
            "covers the whole file but validation data (DSS) added later"
        );
    }
}

#[test]
fn calls_a_page_written_again_beside_validation_data_a_change() {
    let signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    let rewrite = |update: &mut lopdf::IncrementalDocument| {
        let contents = first_contents(update);
        update.new_document.set_object(
            contents,
            Stream::new(
                dictionary! {},
                b"BT /F1 12 Tf 72 770 Td (Changed) Tj ET".to_vec(),
            ),
        );
        contents
    };
    // the page's text written again under its own number
    let plain = validated(
        &signed,
        |update| {
            rewrite(update);
        },
        |_| vec![],
    );
    // and also listed among the certificates of the DSS
    let listed = std::cell::Cell::new(None);
    let held = validated(
        &signed,
        |update| listed.set(Some(rewrite(update))),
        |_| vec![listed.get().unwrap().into()],
    );
    for out in [plain, held] {
        let reports = verify_pdf(&out).unwrap();
        assert!(reports[0].valid());
        assert!(
            reports[0].coverage.starts_with("CHANGED AFTER SIGNING"),
            "{}",
            reports[0].coverage
        );
    }
}

#[test]
fn calls_an_emptied_dictionary_or_an_array_of_numbers_a_change() {
    let signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    let emptied = validated(
        &signed,
        |update| {
            let doc = update.get_prev_documents();
            let page = *doc.get_pages().get(&1).unwrap();
            let resources = Object::Dictionary(dictionary! {});
            let id = update.new_document.add_object(resources);
            update.opt_clone_object_to_new_document(page).unwrap();
            update
                .new_document
                .get_dictionary_mut(page)
                .unwrap()
                .set("Resources", id);
        },
        |_| vec![],
    );
    let numbers = validated(
        &signed,
        |_| {},
        |update| {
            vec![update
                .new_document
                .add_object(vec![Object::Integer(1)])
                .into()]
        },
    );
    for out in [emptied, numbers] {
        let reports = verify_pdf(&out).unwrap();
        assert!(
            reports[0].coverage.starts_with("CHANGED AFTER SIGNING"),
            "{}",
            reports[0].coverage
        );
    }
}

#[test]
fn calls_an_object_freed_after_signing_a_change() {
    let signed = sign(key(), PASSPHRASE, &pdf(), &options(None)).unwrap();
    let mut out = validated(&signed, |_| {}, |_| vec![]);
    // another update, whose cross-reference table marks the page's content
    // stream free
    let doc = Document::load_mem(&out).unwrap();
    let page = *doc.get_pages().get(&1).unwrap();
    let (number, generation) = doc
        .get_dictionary(page)
        .unwrap()
        .get(b"Contents")
        .unwrap()
        .as_reference()
        .unwrap();
    let text = String::from_utf8_lossy(&out).into_owned();
    let prev: usize = text
        .rsplit("startxref")
        .next()
        .unwrap()
        .split_whitespace()
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    let size = doc.trailer.get(b"Size").unwrap().as_i64().unwrap();
    let at = out.len() + 1;
    out.extend_from_slice(
        format!(
            "\nxref\n{number} 1\n0000000000 {:05} f\r\ntrailer\n<< /Size {size} /Root {} {} R /Prev {prev} >>\nstartxref\n{at}\n%%EOF\n",
            generation + 1,
            root.0,
            root.1
        )
        .as_bytes(),
    );
    let reports = verify_pdf(&out).unwrap();
    assert!(
        reports[0].coverage.starts_with("CHANGED AFTER SIGNING"),
        "{}",
        reports[0].coverage
    );
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
        sign(key(), PASSPHRASE, b"%PDF-1.7 junk", &options(None))
    else {
        panic!("signed what isn't a PDF");
    };
    assert_eq!(message, "Blank couldn't sign the PDF");
}

#[test]
fn refuses_a_place_that_isnt_a_rectangle() {
    for rect in [
        [300., 700., 0., 60.],
        [300., 700., 200., -1.],
        [f64::NAN, 700., 200., 60.],
        [300., f64::INFINITY, 200., 60.],
    ] {
        let Err(SigningError::Failed(message)) =
            sign(key(), PASSPHRASE, &pdf(), &options(Some(rect)))
        else {
            panic!("signed in {rect:?}");
        };
        assert_eq!(message, "Blank couldn't sign the PDF");
    }
}

#[test]
fn says_when_a_certified_pdf_allows_no_changes() {
    let mut doc = Document::load_mem(&pdf()).unwrap();
    let docmdp = doc.add_object(dictionary! {
        "Type" => "Sig",
        "Reference" => vec![Object::Dictionary(dictionary! {
            "TransformMethod" => "DocMDP",
            "TransformParams" => dictionary! { "P" => 1 },
        })],
    });
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_dictionary_mut(root)
        .unwrap()
        .set("Perms", dictionary! { "DocMDP" => docmdp });
    let mut certified = vec![];
    doc.save_to(&mut certified).unwrap();
    let Err(SigningError::Failed(message)) = sign(key(), PASSPHRASE, &certified, &options(None))
    else {
        panic!("signed a PDF that allows no changes");
    };
    assert_eq!(message, Refusal::Certified.to_string());
}

#[test]
fn reads_the_header_the_webview_encodes() {
    // encodeURIComponent of {"passphrase":"grüß","options":{"page":2,"rect":null}}
    let value = "%7B%22passphrase%22%3A%22gr%C3%BC%C3%9F%22%2C%22options%22%3A%7B%22page%22%3A2%2C%22rect%22%3Anull%7D%7D";
    let read = header(value).unwrap();
    assert_eq!(read.passphrase.as_str(), "grüß");
    assert_eq!(read.options.page, 2);
    assert!(header("%7B%Z1").is_none());
}

#[test]
fn keeps_the_key_file_for_the_user_alone_and_removes_both() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("signing");
    keep_files(&folder, b"key", b"certificate").unwrap();
    // again, over the files there
    keep_files(&folder, b"new key", b"new certificate").unwrap();
    assert_eq!(std::fs::read(folder.join(KEY)).unwrap(), b"new key");
    assert_eq!(
        std::fs::read(folder.join(CERTIFICATE)).unwrap(),
        b"new certificate"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(folder.join(KEY))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
    let names: Vec<_> = std::fs::read_dir(&folder).unwrap().collect();
    assert_eq!(names.len(), 2, "no partial files left");
    remove_files(&folder).unwrap();
    assert!(!folder.join(KEY).exists() && !folder.join(CERTIFICATE).exists());
    // nothing there to remove is fine
    remove_files(&folder).unwrap();
}
