use lopdf::{dictionary, Document, Object, ObjectId, Stream};

use blank_pdf_ipc::protocol::FillValue;

use super::*;
use crate::signing::verify::{verify_pdf, Coverage};

pub(super) const PASSPHRASE: &str = "correct horse";

/// a PDF of `pages` A4 pages with a line of text each, as lopdf writes it;
/// `modern` writes object streams and a cross-reference stream
pub(super) fn pdf_of(pages: usize, modern: bool) -> Vec<u8> {
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

pub(super) fn pdf() -> Vec<u8> {
    pdf_of(1, false)
}

/// what Blank's layout engine writes, see fixtures/README.md
const BLANK_PDF: &[u8] = include_bytes!("../fixtures/blank.pdf");
/// an RSA key from OpenSSL, see fixtures/README.md
pub(super) const RSA_KEY: &[u8] = include_bytes!("../fixtures/rsa.p12");

/// a plan that signs in a new field at `rect` on page 1, or invisibly
pub(super) fn options(rect: Option<[f64; 4]>) -> Plan {
    Plan {
        stamps: vec![],
        signature: match rect {
            Some(rect) => SignaturePlan::New {
                page: 1,
                rect,
                stamp: None,
            },
            None => SignaturePlan::Invisible,
        },
        others: vec![],
        location: Some("Zürich".into()),
        reason: None,
        timestamp_server: None,
    }
}

/// sign_as signs `pdf` as the export flow sends it: the PDF the body's
/// part 0, the stamps' PDFs `stamps` after it
pub(super) fn sign_as(
    p12: &[u8],
    passphrase: &str,
    pdf: &[u8],
    plan: &Plan,
    stamps: &[&[u8]],
) -> Answer<Vec<u8>> {
    let parts: Vec<&[u8]> = std::iter::once(pdf).chain(stamps.iter().copied()).collect();
    sign(Some(Key { p12, passphrase }), pdf, &parts, plan, &[])
}

// a key made once, with few rounds of PBKDF2, which opens fast
pub(super) fn key() -> &'static [u8] {
    static KEY: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    KEY.get_or_init(|| {
        keys::create_certificate_with("Ada Lovelace", Some("ada@example.org"), PASSPHRASE, 1000)
            .unwrap()
            .0
    })
}

/// signs `pdf` and checks that it was appended and checks out
pub(super) fn signed(key: &[u8], pdf: &[u8], options: &Plan) -> Vec<u8> {
    let signed = sign_as(key, PASSPHRASE, pdf, options, &[]).unwrap();
    // an incremental update: the original bytes stay as they were
    assert!(signed.starts_with(pdf));
    let reports = verify_pdf(&signed).unwrap();
    let last = reports.last().unwrap();
    assert!(last.valid(), "{:?}", last.checks);
    assert!(last.covers_the_whole_file(), "{:?}", last.coverage);
    signed
}

/// the signature widgets on each page of `pdf`, by page number
pub(super) fn widgets(pdf: &[u8]) -> Vec<(u32, lopdf::Dictionary)> {
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

pub(super) fn numbers(array: &Object) -> Vec<f64> {
    array
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_float().map(f64::from).unwrap())
        .collect()
}

/// the name the signature of `widget` gives as who signed it
fn signer_named(pdf: &[u8], widget: &lopdf::Dictionary) -> Vec<u8> {
    let doc = Document::load_mem(pdf).unwrap();
    let signature = widget.get(b"V").unwrap().as_reference().unwrap();
    let signature = doc.get_dictionary(signature).unwrap();
    signature.get(b"Name").unwrap().as_str().unwrap().to_vec()
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
    // signed in the name of the certificate's holder
    assert_eq!(signer_named(&signed, widget), b"Ada Lovelace");
}

#[test]
fn puts_the_field_on_the_page_asked_for() {
    let original = pdf_of(2, false);
    let signed = signed(
        key(),
        &original,
        &Plan {
            signature: SignaturePlan::New {
                page: 2,
                rect: [72., 72., 100., 40.],
                stamp: None,
            },
            ..options(None)
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
    assert_eq!(
        signer_named(&signed, &widgets(&signed)[0].1),
        b"Lovelace, Ada"
    );
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
    let signer = Signer {
        identity: &identity,
        reason: None,
        location: None,
        name: None,
        tsa: None,
        reserve: 64,
    };
    let plan = UpdatePlan {
        stamps: vec![],
        signature: Spot::Invisible,
        others: vec![],
        filled: vec![],
    };
    let doc = load_for_update(&original).unwrap();
    let signed = update_pdf(&original, doc, &plan, Some(&signer)).unwrap();
    assert!(signed.starts_with(&original));
    check_signed(&signed, false, &[]).unwrap();
}

#[test]
fn finds_a_change_after_signing() {
    let mut signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
    // a byte of the page's text changed
    let at = signed.windows(6).position(|w| w == b"Signed").unwrap();
    signed[at] = b'X';
    assert!(!verify_pdf(&signed).unwrap()[0].valid());
}

#[test]
fn finds_what_was_added_after_signing() {
    let signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
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
    assert_eq!(
        reports[0].coverage,
        crate::signing::verify::Coverage::ChangedAfterSigning
    );
    assert!(check_signed(&signed, false, &[]).is_err());
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
    let signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
    let modern = sign_as(key(), PASSPHRASE, &pdf_of(1, true), &options(None), &[]).unwrap();
    // lopdf writes the update's cross-references as a stream, read here by
    // Blank's own reader of them
    for signed in [signed, modern] {
        let out = validated(&signed, |_| {}, |_| vec![]);
        let reports = verify_pdf(&out).unwrap();
        assert!(reports[0].valid());
        assert_eq!(reports[0].coverage, Coverage::ValidationData);
    }
}

#[test]
fn calls_a_page_written_again_beside_validation_data_a_change() {
    let signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
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
        assert_eq!(reports[0].coverage, Coverage::ChangedAfterSigning);
    }
}

#[test]
fn calls_a_page_its_own_dss_lists_written_again_a_change() {
    // a PDF prepared before signing, whose DSS lists the page's content
    // stream among its certificates
    let mut doc = Document::load_mem(&pdf()).unwrap();
    let page = *doc.get_pages().get(&1).unwrap();
    let contents = doc
        .get_dictionary(page)
        .unwrap()
        .get(b"Contents")
        .unwrap()
        .as_reference()
        .unwrap();
    let dss = doc.add_object(dictionary! { "Certs" => vec![contents.into()] });
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_dictionary_mut(root).unwrap().set("DSS", dss);
    let mut prepared = vec![];
    doc.save_to(&mut prepared).unwrap();
    let signed = sign_as(key(), PASSPHRASE, &prepared, &options(None), &[]).unwrap();
    let out = validated(
        &signed,
        |update| {
            update.new_document.set_object(
                contents,
                Stream::new(
                    dictionary! {},
                    b"BT /F1 12 Tf 72 770 Td (Changed) Tj ET".to_vec(),
                ),
            );
        },
        |_| vec![],
    );
    let reports = verify_pdf(&out).unwrap();
    assert!(reports[0].valid());
    assert_eq!(reports[0].coverage, Coverage::ChangedAfterSigning);
}

#[test]
fn calls_the_info_its_own_dss_lists_written_again_a_change() {
    // a PDF prepared before signing, whose DSS lists its /Info
    let mut doc = Document::load_mem(&pdf()).unwrap();
    let info = doc.add_object(dictionary! { "Title" => Object::string_literal("Offer") });
    doc.trailer.set("Info", info);
    let dss = doc.add_object(dictionary! { "Certs" => vec![info.into()] });
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_dictionary_mut(root).unwrap().set("DSS", dss);
    let mut prepared = vec![];
    doc.save_to(&mut prepared).unwrap();
    let signed = sign_as(key(), PASSPHRASE, &prepared, &options(None), &[]).unwrap();
    let out = validated(
        &signed,
        |update| {
            update.new_document.set_object(
                info,
                dictionary! { "Title" => Object::string_literal("Another offer") },
            );
        },
        |_| vec![],
    );
    let reports = verify_pdf(&out).unwrap();
    assert_eq!(reports[0].coverage, Coverage::ChangedAfterSigning);
}

#[test]
fn calls_an_emptied_dictionary_or_an_array_of_numbers_a_change() {
    let signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
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
        assert_eq!(reports[0].coverage, Coverage::ChangedAfterSigning);
    }
}

/// with_contents_freed adds an update to `pdf` whose cross-reference table
/// marks the first page's content stream free
fn with_contents_freed(mut pdf: Vec<u8>) -> Vec<u8> {
    let doc = Document::load_mem(&pdf).unwrap();
    let page = *doc.get_pages().get(&1).unwrap();
    let (number, generation) = doc
        .get_dictionary(page)
        .unwrap()
        .get(b"Contents")
        .unwrap()
        .as_reference()
        .unwrap();
    let text = String::from_utf8_lossy(&pdf).into_owned();
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
    let at = pdf.len() + 1;
    pdf.extend_from_slice(
        format!(
            "\nxref\n{number} 1\n0000000000 {:05} f\r\ntrailer\n<< /Size {size} /Root {} {} R /Prev {prev} >>\nstartxref\n{at}\n%%EOF\n",
            generation + 1,
            root.0,
            root.1
        )
        .as_bytes(),
    );
    pdf
}

#[test]
fn calls_an_object_freed_after_signing_a_change() {
    let signed = sign_as(key(), PASSPHRASE, &pdf(), &options(None), &[]).unwrap();
    let out = with_contents_freed(validated(&signed, |_| {}, |_| vec![]));
    let reports = verify_pdf(&out).unwrap();
    assert_eq!(reports[0].coverage, Coverage::ChangedAfterSigning);
}

#[test]
fn says_when_the_passphrase_is_wrong() {
    assert!(matches!(
        sign_as(key(), "wrong", &pdf(), &options(None), &[]),
        Err(SigningError::WrongPassphrase)
    ));
}

#[test]
fn refuses_what_isnt_a_pdf_without_quoting_it() {
    let Err(SigningError::Failed(message)) =
        sign_as(key(), PASSPHRASE, b"%PDF-1.7 junk", &options(None), &[])
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
            sign_as(key(), PASSPHRASE, &pdf(), &options(Some(rect)), &[])
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
    let Err(SigningError::Failed(message)) =
        sign_as(key(), PASSPHRASE, &certified, &options(None), &[])
    else {
        panic!("signed a PDF that allows no changes");
    };
    assert_eq!(message, Refusal::Certified.to_string());
}

#[test]
fn reads_the_header_the_webview_encodes() {
    let json = r#"{"passphrase":"grüß","source":{"kind":"tab","tab":"t1","path":"/tmp/a.pdf","sha256":"ab","fills":[{"field":"Name","value":"Ada"},{"field":"Agree","value":true}]},"plan":{"stamps":[{"part":0,"page":1,"rect":[1,2,3,4],"repeat":true}],"signature":{"kind":"existing","field":"Signature1","stamp":1},"others":[{"page":2,"rect":[5,6,7,8],"name":"Ben Sample"}],"name":null,"location":"Zürich","reason":null,"timestampServer":null}}"#;
    let value: String =
        percent_encoding::utf8_percent_encode(json, percent_encoding::NON_ALPHANUMERIC).to_string();
    let read = header(&value).unwrap();
    assert_eq!(read.passphrase.as_deref().map(String::as_str), Some("grüß"));
    let Source::Tab { fills, sha256, .. } = &read.source else {
        panic!("not a tab");
    };
    assert_eq!(sha256, "ab");
    assert!(matches!(&fills[1].value, FillValue::Checked(true)));
    assert!(read.plan.stamps[0].repeat);
    assert!(matches!(
        read.plan.signature,
        SignaturePlan::Existing { stamp: Some(1), .. }
    ));
    assert_eq!(read.plan.others[0].name, "Ben Sample");
    // without a passphrase: the stamps alone
    let json =
        r#"{"passphrase":null,"source":{"kind":"body"},"plan":{"signature":{"kind":"invisible"}}}"#;
    let value: String =
        percent_encoding::utf8_percent_encode(json, percent_encoding::NON_ALPHANUMERIC).to_string();
    let read = header(&value).unwrap();
    assert!(read.passphrase.is_none());
    assert!(matches!(read.source, Source::Body));
    assert!(header("%7B%Z1").is_none());
}

#[test]
fn keeps_the_key_file_for_the_user_alone_and_removes_both() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("signing");
    assert!(keep_files(&folder, b"key", b"certificate", false).unwrap());
    // a key there is kept unless it's to be replaced
    assert!(!keep_files(&folder, b"new key", b"new certificate", false).unwrap());
    assert_eq!(std::fs::read(folder.join(KEY)).unwrap(), b"key");
    assert_eq!(
        std::fs::read(folder.join(CERTIFICATE)).unwrap(),
        b"certificate"
    );
    assert!(keep_files(&folder, b"new key", b"new certificate", true).unwrap());
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
    assert_eq!(names.len(), 2, "no partial or old files left");
    remove_files(&folder).unwrap();
    assert!(!folder.join(KEY).exists() && !folder.join(CERTIFICATE).exists());
    // nothing there to remove is fine
    remove_files(&folder).unwrap();
}

#[test]
fn keeps_the_old_pair_when_the_new_certificate_cant_be_put_in_place() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("signing");
    assert!(keep_files(&folder, b"key", b"certificate", false).unwrap());
    let fails_on_the_certificate = |from: &Path, to: &Path| {
        if to.ends_with(CERTIFICATE) {
            Err(std::io::ErrorKind::PermissionDenied.into())
        } else {
            std::fs::rename(from, to)
        }
    };
    let error = keep_files_with(
        &folder,
        b"new key",
        b"new certificate",
        true,
        fails_on_the_certificate,
    )
    .unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
    assert_eq!(std::fs::read(folder.join(KEY)).unwrap(), b"key");
    assert_eq!(
        std::fs::read(folder.join(CERTIFICATE)).unwrap(),
        b"certificate"
    );
    let mut names: Vec<_> = std::fs::read_dir(&folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    names.sort();
    assert_eq!(names, [CERTIFICATE, KEY], "no partial or old files left");
    // with no key before, the new one goes again
    remove_files(&folder).unwrap();
    keep_files_with(
        &folder,
        b"new key",
        b"new certificate",
        false,
        fails_on_the_certificate,
    )
    .unwrap_err();
    assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 0);
}

#[test]
fn refuses_a_signature_without_the_timestamp_asked_for() {
    let signed = signed(key(), &pdf(), &options(None));
    assert!(check_signed(&signed, false, &[]).is_ok());
    let Err(SigningError::Timestamp(message)) = check_signed(&signed, true, &[]) else {
        panic!("a signature without its timestamp passed");
    };
    assert_eq!(message, Refusal::TimestampUnusable.to_string());
}

#[test]
fn says_which_signature_signed_the_changes_after_an_earlier_one() {
    let first = signed(key(), &pdf(), &options(None));
    // a change that isn't a signature: the page gains a key
    let doc = Document::load_mem(&first).unwrap();
    let page = *doc.get_pages().values().next().unwrap();
    let mut update = lopdf::IncrementalDocument::create_from(first.clone(), doc);
    update.opt_clone_object_to_new_document(page).unwrap();
    update
        .new_document
        .get_dictionary_mut(page)
        .unwrap()
        .set("Rotate", 90);
    let mut changed = vec![];
    update.save_to(&mut changed).unwrap();
    let twice = signed(RSA_KEY, &changed, &options(None));
    let reports = verify_pdf(&twice).unwrap();
    let rsa_name = reports[1].signer.as_ref().unwrap().name.clone();
    let shown = trust::checked_all(reports, None, &Default::default());
    assert_eq!(shown[0].status, trust::Status::SignedAgainLater);
    assert_eq!(shown[0].later_signer.as_deref(), Some(rsa_name.as_str()));
    assert_eq!(shown[1].status, trust::Status::Valid);
    assert_eq!(shown[1].later_signer, None);
}

#[test]
fn keeps_a_signature_valid_that_later_revisions_only_signed_again() {
    let first = signed(key(), &pdf(), &options(Some([72., 72., 200., 50.])));
    // a second signer in a field of its own, then a third invisibly
    let twice = signed(RSA_KEY, &first, &options(Some([300., 72., 200., 50.])));
    let thrice = signed(key(), &twice, &options(None));
    let reports = verify_pdf(&thrice).unwrap();
    assert_eq!(
        reports.iter().map(|r| r.coverage).collect::<Vec<_>>(),
        [
            crate::signing::verify::Coverage::SignedOnlyAgain,
            crate::signing::verify::Coverage::SignedOnlyAgain,
            crate::signing::verify::Coverage::WholeFile,
        ]
    );
    let rsa_name = reports[1].signer.as_ref().unwrap().name.clone();
    let shown = trust::checked_all(reports, None, &Default::default());
    assert!(shown.iter().all(|s| s.status == trust::Status::Valid));
    // who signed next is still said
    assert_eq!(shown[0].later_signer.as_deref(), Some(rsa_name.as_str()));
    assert_eq!(shown[2].later_signer, None);
}

#[test]
fn calls_a_page_content_rewritten_before_a_later_signature_a_change() {
    let first = signed(key(), &pdf(), &options(None));
    // the page's content stream rewritten in place, under its own number
    let doc = Document::load_mem(&first).unwrap();
    let page = *doc.get_pages().values().next().unwrap();
    let contents = doc
        .get_dictionary(page)
        .unwrap()
        .get(b"Contents")
        .unwrap()
        .as_reference()
        .unwrap();
    let mut update = lopdf::IncrementalDocument::create_from(first.clone(), doc);
    update.new_document.objects.insert(
        contents,
        Object::Stream(Stream::new(
            dictionary! {},
            b"BT /F1 12 Tf 72 700 Td (Changed) Tj ET".to_vec(),
        )),
    );
    let mut changed = vec![];
    update.save_to(&mut changed).unwrap();
    let twice = signed(RSA_KEY, &changed, &options(None));
    assert_eq!(
        verify_pdf(&twice).unwrap()[0].coverage,
        Coverage::SignedAgainLater
    );
}

#[test]
fn calls_a_page_content_freed_before_a_later_signature_a_change() {
    let first = signed(key(), &pdf(), &options(None));
    let twice = signed(RSA_KEY, &with_contents_freed(first), &options(None));
    assert_eq!(
        verify_pdf(&twice).unwrap()[0].coverage,
        Coverage::SignedAgainLater
    );
}

#[test]
fn calls_a_note_added_before_a_later_signature_a_change() {
    let first = signed(key(), &pdf(), &options(None));
    // a new annotation that isn't a signature's, on the page
    let doc = Document::load_mem(&first).unwrap();
    let page = *doc.get_pages().values().next().unwrap();
    let mut update = lopdf::IncrementalDocument::create_from(first.clone(), doc);
    let note = update.new_document.add_object(dictionary! {
        "Type" => "Annot", "Subtype" => "Text",
        "Rect" => vec![0.into(), 0.into(), 10.into(), 10.into()],
    });
    update.opt_clone_object_to_new_document(page).unwrap();
    update
        .new_document
        .get_dictionary_mut(page)
        .unwrap()
        .set("Annots", vec![Object::Reference(note)]);
    let mut noted = vec![];
    update.save_to(&mut noted).unwrap();
    let twice = signed(RSA_KEY, &noted, &options(None));
    let reports = verify_pdf(&twice).unwrap();
    assert_eq!(
        reports[0].coverage,
        crate::signing::verify::Coverage::SignedAgainLater
    );
}
