//! signing PDFs Blank didn't write, and stamping them: stamps in the pages'
//! content, signature fields the PDF has, empty fields for others, and the
//! rules of what may be added. The fixtures are the PDF tab's
//! (`src-tauri/pdf/fixtures`, see `scripts/build-pdf-fixtures.ts`); the
//! stamps are one-page PDFs made here with lopdf, as Blank's engine would
//! make them: marked content, a structure parent, an indirect font.

use std::path::Path;
use std::process::Command;

use lopdf::{dictionary, Document, Object, ObjectId, Stream};

use super::tests::{key, options, pdf, sign_as, signed, widgets, PASSPHRASE, RSA_KEY};
use super::*;

const ROTATED: &[u8] = include_bytes!("../../../pdf/fixtures/rotated.pdf");
const FORM: &[u8] = include_bytes!("../../../pdf/fixtures/form.pdf");
const PASSWORD: &[u8] = include_bytes!("../../../pdf/fixtures/password.pdf");

/// a stamp's one-page PDF of `w` × `h` points with `text` in it, its
/// marked content tagged with an /MCID, its font an object that refers to
/// itself
fn stamp_pdf(w: f64, h: f64, text: &str) -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages = doc.new_object_id();
    let font = doc.new_object_id();
    doc.objects.insert(
        font,
        Object::Dictionary(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
            // a cycle the copy must end
            "Itself" => font,
        }),
    );
    let content = doc.add_object(Stream::new(
        dictionary! {},
        format!("/P <</MCID 0>> BDC BT /F1 10 Tf 4 6 Td ({text}) Tj ET EMC").into_bytes(),
    ));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages, "Contents" => content,
        "MediaBox" => vec![0.into(), 0.into(), (w as f32).into(), (h as f32).into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => font } },
        "StructParents" => 0,
    });
    doc.objects.insert(
        pages,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![page.into()], "Count" => 1,
        }),
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages });
    doc.trailer.set("Root", catalog);
    let mut bytes = vec![];
    doc.save_to(&mut bytes).unwrap();
    bytes
}

/// a plan with `stamps`, signed `signature`, nothing else
fn plan(stamps: Vec<StampPlan>, signature: SignaturePlan) -> Plan {
    Plan {
        stamps,
        signature,
        ..options(None)
    }
}

fn stamp_at(part: usize, page: u32, rect: [f64; 4], repeat: bool) -> StampPlan {
    StampPlan {
        part,
        page,
        rect,
        repeat,
    }
}

/// stamped adds `plan` to `pdf` without a signature, the stamps' PDFs
/// `stamps` from part 1 on
fn stamped(pdf: &[u8], plan: &Plan, stamps: &[&[u8]]) -> Answer<Vec<u8>> {
    let parts: Vec<&[u8]> = std::iter::once(pdf).chain(stamps.iter().copied()).collect();
    sign(None, pdf, &parts, plan)
}

/// has tells whether `tool` of poppler-utils or qpdf runs; CI never skips
fn has(tool: &str) -> bool {
    let found = Command::new(tool).arg("--version").output().is_ok();
    if !found && std::env::var_os("CI").is_some() {
        panic!("{tool} is missing: CI doesn't skip the check");
    }
    found
}

/// written writes `bytes` to a file of `dir`
fn written(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    path
}

/// a word pdftotext found: its page from 1, xMin, yMin, xMax, yMax
type Word = (usize, f64, f64, f64, f64, String);

/// words runs `pdftotext -bbox` on `pdf`, in the pages' crop boxes, the
/// pages as shown
fn words(pdf: &Path) -> Vec<Word> {
    let html = pdf.with_extension("html");
    assert!(Command::new("pdftotext")
        .arg("-bbox")
        .arg("-cropbox")
        .arg(pdf)
        .arg(&html)
        .status()
        .unwrap()
        .success());
    let html = std::fs::read_to_string(html).unwrap();
    let mut found = vec![];
    let mut page = 0;
    for line in html.lines().map(str::trim) {
        if line.starts_with("<page") {
            page += 1;
        }
        let Some(rest) = line.strip_prefix("<word ") else {
            continue;
        };
        let number = |key: &str| -> f64 {
            let at = rest.find(&format!("{key}=\"")).unwrap() + key.len() + 2;
            rest[at..].split('"').next().unwrap().parse().unwrap()
        };
        let text = rest.split('>').nth(1).unwrap().split('<').next().unwrap();
        found.push((
            page,
            number("xMin"),
            number("yMin"),
            number("xMax"),
            number("yMax"),
            text.to_string(),
        ));
    }
    found
}

/// pdfsig_valid tells how many signatures of `pdf` pdfsig calls valid, and
/// how many it found
fn pdfsig_valid(dir: &Path, pdf: &Path) -> (usize, usize) {
    let nss = dir.join("nss");
    std::fs::create_dir_all(&nss).unwrap();
    let out = Command::new("pdfsig")
        .arg("-nssdir")
        .arg(&nss)
        .arg(pdf)
        .output()
        .unwrap();
    let text = String::from_utf8_lossy(&out.stdout);
    let found = text.matches("Signature Field Name").count();
    let valid = text
        .matches("Signature Validation: Signature is Valid")
        .count();
    (valid, found)
}

/// the page objects of `pdf`, by number
fn pages(doc: &Document) -> Vec<ObjectId> {
    doc.get_pages().values().copied().collect()
}

/// the object `id` of `doc`, followed if it's a reference
fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).unwrap().1
}

/// the XObjects of a page's direct /Resources
fn page_xobjects(doc: &Document, page: ObjectId) -> lopdf::Dictionary {
    let page = doc.get_dictionary(page).unwrap();
    let resources = deref(doc, page.get(b"Resources").unwrap())
        .as_dict()
        .unwrap();
    deref(doc, resources.get(b"XObject").unwrap())
        .as_dict()
        .unwrap()
        .clone()
}

#[test]
fn puts_a_stamp_where_it_was_placed_on_a_turned_page() {
    let stamp = stamp_pdf(120., 30., "Stamped");
    let rect = [200., 150., 120., 30.];
    let out = stamped(
        ROTATED,
        &plan(vec![stamp_at(1, 1, rect, false)], SignaturePlan::Invisible),
        &[&stamp],
    )
    .unwrap();
    assert!(out.starts_with(ROTATED));
    if !has("pdftotext") {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    // where the word is on the stamp itself, and so where it must land
    let alone = words(&written(dir.path(), "stamp.pdf", &stamp));
    let (_, sx, sy, sx1, sy1, _) = alone.iter().find(|w| w.5 == "Stamped").unwrap().clone();
    let found = words(&written(dir.path(), "stamped.pdf", &out));
    let (page, x, y, x1, y1, _) = found.iter().find(|w| w.5 == "Stamped").unwrap().clone();
    assert_eq!(page, 1);
    // upright, as wide and high as on the stamp
    assert!(((x1 - x) - (sx1 - sx)).abs() <= 1. && ((y1 - y) - (sy1 - sy)).abs() <= 1.);
    assert!((x - (rect[0] + sx)).abs() <= 1., "{x} vs {}", rect[0] + sx);
    assert!((y - (rect[1] + sy)).abs() <= 1., "{y} vs {}", rect[1] + sy);
    // the page's own text still has its font, which the page inherits
    assert!(
        found.iter().any(|w| w.0 == 1 && w.5 == "Turned"),
        "{found:?}"
    );
}

#[test]
fn keeps_the_resources_a_page_inherits() {
    let stamp = stamp_pdf(120., 30., "Stamped");
    let out = stamped(
        ROTATED,
        &plan(
            vec![stamp_at(1, 1, [20., 20., 120., 30.], false)],
            SignaturePlan::Invisible,
        ),
        &[&stamp],
    )
    .unwrap();
    let doc = Document::load_mem(&out).unwrap();
    let page = pages(&doc)[0];
    let resources = deref(
        &doc,
        doc.get_dictionary(page).unwrap().get(b"Resources").unwrap(),
    )
    .as_dict()
    .unwrap();
    // a copy of what /Pages gave it, with the stamp
    assert!(deref(&doc, resources.get(b"Font").unwrap())
        .as_dict()
        .unwrap()
        .has(b"F1"));
    assert!(page_xobjects(&doc, page).has(b"BlankStamp0"));
    // the shared resources weren't touched
    let parent = doc
        .get_dictionary(page)
        .unwrap()
        .get(b"Parent")
        .unwrap()
        .as_reference()
        .unwrap();
    let shared = doc
        .get_dictionary(parent)
        .unwrap()
        .get(b"Resources")
        .unwrap()
        .as_dict()
        .unwrap();
    assert!(!shared.has(b"XObject"));
}

#[test]
fn makes_the_stamps_marked_content_artifacts() {
    let stamp = stamp_pdf(120., 30., "Stamped");
    let out = stamped(
        ROTATED,
        &plan(
            vec![stamp_at(1, 1, [20., 20., 120., 30.], false)],
            SignaturePlan::Invisible,
        ),
        &[&stamp],
    )
    .unwrap();
    let doc = Document::load_mem(&out).unwrap();
    let id = page_xobjects(&doc, pages(&doc)[0])
        .get(b"BlankStamp0")
        .unwrap()
        .as_reference()
        .unwrap();
    let form = doc.get_object(id).unwrap().as_stream().unwrap();
    let bbox: Vec<f32> = form
        .dict
        .get(b"BBox")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_float().unwrap())
        .collect();
    assert_eq!(bbox, [0., 0., 120., 30.]);
    assert!(!form.dict.has(b"StructParents"));
    let content = form.get_plain_content().unwrap();
    let content = String::from_utf8_lossy(&content);
    assert!(!content.contains("MCID"), "{content}");
    assert!(content.contains("/Artifact BMC"), "{content}");
    // the font that refers to itself came along once
    let resources = form.dict.get(b"Resources").unwrap().as_dict().unwrap();
    let fonts = resources.get(b"Font").unwrap().as_dict().unwrap();
    let font_id = fonts.get(b"F1").unwrap().as_reference().unwrap();
    let font = doc.get_dictionary(font_id).unwrap();
    assert_eq!(
        font.get(b"Itself").unwrap().as_reference().unwrap(),
        font_id
    );
}

#[test]
fn puts_a_repeated_stamp_on_every_page_inside_it() {
    let stamp = stamp_pdf(56., 28., "Initials");
    // bottom right of the first page as shown (842 × 495), outside the A5
    // page (420 × 595)
    let rect = [750., 430., 56., 28.];
    let out = stamped(
        ROTATED,
        &plan(vec![stamp_at(1, 1, rect, true)], SignaturePlan::Invisible),
        &[&stamp],
    )
    .unwrap();
    let doc = Document::load_mem(&out).unwrap();
    let ids: Vec<Object> = pages(&doc)
        .into_iter()
        .map(|page| {
            page_xobjects(&doc, page)
                .get(b"BlankStamp0")
                .unwrap()
                .clone()
        })
        .collect();
    // one XObject, drawn on both pages
    assert_eq!(ids.len(), 2);
    assert_eq!(ids[0], ids[1]);
    if !has("pdftotext") {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let found = words(&written(dir.path(), "initials.pdf", &out));
    let on: Vec<&Word> = found.iter().filter(|w| w.5 == "Initials").collect();
    assert_eq!(on.iter().map(|w| w.0).collect::<Vec<_>>(), [1, 2]);
    // inside the smaller page
    let second = on[1];
    assert!(second.3 <= 420. && second.4 <= 595., "{second:?}");
}

#[test]
fn adds_stamps_without_a_signature() {
    let stamp = stamp_pdf(120., 30., "Stamped");
    let original = pdf();
    let out = stamped(
        &original,
        &plan(
            vec![stamp_at(1, 1, [72., 72., 120., 30.], false)],
            SignaturePlan::Invisible,
        ),
        &[&stamp],
    )
    .unwrap();
    assert!(out.starts_with(&original));
    assert!(verify_pdf(&out).unwrap().is_empty());
    assert!(widgets(&out).is_empty());
    if has("qpdf") {
        let dir = tempfile::tempdir().unwrap();
        let path = written(dir.path(), "stamped.pdf", &out);
        let status = Command::new("qpdf")
            .arg("--check")
            .arg(&path)
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{}",
            String::from_utf8_lossy(&status.stdout)
        );
    }
}

#[test]
fn signs_a_signature_field_the_pdf_has() {
    let stamp = stamp_pdf(200., 50., "Signed");
    let plan = plan(
        vec![],
        SignaturePlan::Existing {
            field: "signature".into(),
            stamp: Some(1),
        },
    );
    let out = sign_as(key(), PASSPHRASE, FORM, &plan, &[&stamp]).unwrap();
    assert!(out.starts_with(FORM));
    let reports = verify_pdf(&out).unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].field, "signature");
    assert!(reports[0].valid() && reports[0].covers_the_whole_file());
    // no new field: the one it had, with the stamp as its appearance
    let found = widgets(&out);
    assert_eq!(found.len(), 1, "{found:?}");
    let doc = Document::load_mem(&out).unwrap();
    let widget = &found[0].1;
    assert_eq!(widget.get(b"T").unwrap().as_str().unwrap(), b"signature");
    let ap = deref(&doc, widget.get(b"AP").unwrap()).as_dict().unwrap();
    let normal = deref(&doc, ap.get(b"N").unwrap()).as_stream().unwrap();
    let shows = normal
        .dict
        .get(b"Resources")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"XObject")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"BlankStamp")
        .unwrap()
        .as_reference()
        .unwrap();
    let form = doc.get_object(shows).unwrap().as_stream().unwrap();
    assert_eq!(
        form.dict.get(b"Subtype").unwrap().as_name().unwrap(),
        b"Form"
    );
    assert_eq!(widget.get(b"F").unwrap().as_i64().unwrap(), 4);
    if has("pdfsig") {
        let dir = tempfile::tempdir().unwrap();
        let path = written(dir.path(), "signed.pdf", &out);
        assert_eq!(pdfsig_valid(dir.path(), &path), (1, 1));
    }
}

#[test]
fn refuses_a_field_that_is_signed_or_isnt_there() {
    let once = sign_as(
        key(),
        PASSPHRASE,
        FORM,
        &plan(
            vec![],
            SignaturePlan::Existing {
                field: "signature".into(),
                stamp: None,
            },
        ),
        &[],
    )
    .unwrap();
    for (pdf, field, refusal) in [
        (&once, "signature", Refusal::FieldSigned),
        (&FORM.to_vec(), "Name", Refusal::NoSuchField),
        (&FORM.to_vec(), "nothing", Refusal::NoSuchField),
    ] {
        let plan = plan(
            vec![],
            SignaturePlan::Existing {
                field: field.into(),
                stamp: None,
            },
        );
        let Err(SigningError::Failed(message)) = sign_as(key(), PASSPHRASE, pdf, &plan, &[]) else {
            panic!("signed {field}");
        };
        assert_eq!(message, refusal.to_string());
    }
}

#[test]
fn adds_empty_named_fields_for_the_others_who_sign() {
    let others = |plan: Plan| Plan {
        others: vec![
            OtherPlan {
                page: 1,
                rect: [72., 600., 200., 60.],
                name: "Ben Sample".into(),
            },
            OtherPlan {
                page: 1,
                rect: [320., 600., 200., 60.],
                name: "Ben Sample".into(),
            },
            OtherPlan {
                page: 1,
                rect: [72., 700., 200., 60.],
                name: "Dr. Zoë Ng".into(),
            },
        ],
        ..plan
    };
    let original = pdf();
    let signed_out = signed(
        key(),
        &original,
        &others(options(Some([300., 100., 200., 60.]))),
    );
    let stamped_out = stamped(&original, &others(options(None)), &[]).unwrap();
    for (out, signatures) in [(signed_out, 1), (stamped_out, 0)] {
        assert_eq!(verify_pdf(&out).unwrap().len(), signatures);
        let doc = Document::load_mem(&out).unwrap();
        let names: Vec<(String, bool)> = widgets(&out)
            .into_iter()
            .map(|(_, w)| {
                (
                    lopdf::decode_text_string(w.get(b"T").unwrap()).unwrap(),
                    w.has(b"V"),
                )
            })
            .collect();
        let empty: Vec<&str> = names
            .iter()
            .filter(|(_, v)| !v)
            .map(|(n, _)| n.as_str())
            .collect();
        assert_eq!(
            empty,
            [
                "Signature of Ben Sample",
                "Signature of Ben Sample 2",
                "Signature of Dr Zoë Ng"
            ]
        );
        assert_eq!(names.len(), 3 + signatures);
        // in the form, so PDF apps offer them to sign
        let form = deref(&doc, doc.catalog().unwrap().get(b"AcroForm").unwrap())
            .as_dict()
            .unwrap();
        let fields = deref(&doc, form.get(b"Fields").unwrap())
            .as_array()
            .unwrap();
        assert_eq!(fields.len(), 3 + signatures);
    }
}

#[test]
fn draws_the_signature_on_an_unsigned_pdf_and_in_the_widget_on_a_signed_one() {
    let stamp = stamp_pdf(200., 50., "Signed");
    let new = |page| SignaturePlan::New {
        page,
        rect: [72., 72., 200., 50.],
        stamp: Some(1),
    };
    // unsigned: in the page content, the widget's appearance empty
    let original = pdf();
    let once = sign_as(
        key(),
        PASSPHRASE,
        &original,
        &plan(vec![], new(1)),
        &[&stamp],
    )
    .unwrap();
    let doc = Document::load_mem(&once).unwrap();
    assert!(page_xobjects(&doc, pages(&doc)[0]).has(b"BlankStamp0"));
    // signed: in the widget, the pages as they were
    let twice = sign_as(RSA_KEY, PASSPHRASE, &once, &plan(vec![], new(1)), &[&stamp]).unwrap();
    assert!(twice.starts_with(&once));
    let reports = verify_pdf(&twice).unwrap();
    assert_eq!(reports.len(), 2);
    assert!(reports.iter().all(|r| r.valid()));
    let doc_twice = Document::load_mem(&twice).unwrap();
    let page = pages(&doc_twice)[0];
    assert_eq!(
        doc_twice
            .get_dictionary(page)
            .unwrap()
            .get(b"Contents")
            .unwrap(),
        doc.get_dictionary(page).unwrap().get(b"Contents").unwrap()
    );
    let last = widgets(&twice).pop().unwrap().1;
    let ap = deref(&doc_twice, last.get(b"AP").unwrap())
        .as_dict()
        .unwrap();
    let normal = deref(&doc_twice, ap.get(b"N").unwrap())
        .as_stream()
        .unwrap();
    assert!(normal.dict.has(b"Resources"));
    if has("pdfsig") {
        let dir = tempfile::tempdir().unwrap();
        let path = written(dir.path(), "twice.pdf", &twice);
        // the earlier signature still valid
        assert_eq!(pdfsig_valid(dir.path(), &path), (2, 2));
    }
}

/// certified certifies `pdf` with DocMDP permission `p` (the dictionary
/// alone, as the tests of verify do: Blank doesn't certify)
fn certified(pdf: &[u8], p: i64) -> Vec<u8> {
    let mut doc = Document::load_mem(pdf).unwrap();
    let docmdp = doc.add_object(dictionary! {
        "Type" => "Sig",
        "Reference" => vec![Object::Dictionary(dictionary! {
            "TransformMethod" => "DocMDP",
            "TransformParams" => dictionary! { "P" => p },
        })],
    });
    let root = doc.trailer.get(b"Root").unwrap().as_reference().unwrap();
    doc.get_dictionary_mut(root)
        .unwrap()
        .set("Perms", dictionary! { "DocMDP" => docmdp });
    let mut out = vec![];
    doc.save_to(&mut out).unwrap();
    out
}

#[test]
fn refuses_what_the_pdf_doesnt_allow() {
    let stamp = stamp_pdf(120., 30., "Stamped");
    let content = plan(
        vec![stamp_at(1, 1, [72., 72., 120., 30.], false)],
        SignaturePlan::Invisible,
    );
    let earlier = signed(RSA_KEY, &pdf(), &options(None));
    let fails = |result: Answer<Vec<u8>>, refusal: Refusal| {
        let Err(SigningError::Failed(message)) = result else {
            panic!("not refused: {refusal:?}");
        };
        assert_eq!(message, refusal.to_string());
    };
    // P=1: nothing at all, a signature or stamps
    let p1 = certified(&pdf(), 1);
    fails(
        sign_as(key(), PASSPHRASE, &p1, &options(None), &[]),
        Refusal::Certified,
    );
    fails(stamped(&p1, &content, &[&stamp]), Refusal::Certified);
    // P=2, and signed: no stamps in the pages, with or without a signature
    let p2 = certified(&pdf(), 2);
    for pdf in [&p2, &earlier] {
        fails(stamped(pdf, &content, &[&stamp]), Refusal::SignedPages);
        fails(
            sign_as(key(), PASSPHRASE, pdf, &content, &[&stamp]),
            Refusal::SignedPages,
        );
    }
    // but a signature on P=2, its stamp as its appearance
    let new = SignaturePlan::New {
        page: 1,
        rect: [72., 72., 120., 30.],
        stamp: Some(1),
    };
    sign_as(key(), PASSPHRASE, &p2, &plan(vec![], new), &[&stamp]).unwrap();
    // encrypted
    fails(stamped(PASSWORD, &content, &[&stamp]), Refusal::Restricted);
    fails(
        sign_as(key(), PASSPHRASE, PASSWORD, &options(None), &[]),
        Refusal::Restricted,
    );
}

#[test]
fn reads_the_rules_of_a_pdf() {
    use crate::signing::pdf::rules::{Lock, Rules};
    let read = |pdf: &[u8]| Rules::read(&Document::load_mem(pdf).unwrap());
    assert_eq!(read(&pdf()), Rules::default());
    assert_eq!(read(&certified(&pdf(), 1)).docmdp, Some(1));
    let earlier = read(&signed(key(), &pdf(), &options(None)));
    assert!(earlier.signed && earlier.docmdp.is_none());
    assert!(!earlier.allows_page_content() && earlier.allows_changes());
    // a FieldMDP lock of a signed field
    let mut doc = Document::load_mem(&signed(key(), &pdf(), &options(None))).unwrap();
    let field = widgets(&doc_bytes(&doc))[0].1.clone();
    let id = doc
        .objects
        .iter()
        .find(|(_, o)| o.as_dict().is_ok_and(|d| *d == field))
        .map(|(id, _)| *id)
        .unwrap();
    doc.get_dictionary_mut(id).unwrap().set(
        "Lock",
        dictionary! { "Action" => "Include", "Fields" => vec![Object::string_literal("Name")] },
    );
    let locked = read(&doc_bytes(&doc));
    assert_eq!(locked.locks, [Lock::Include(vec!["Name".into()])]);
    assert!(locked.locks("Name") && !locked.locks("Other"));
}

#[test]
fn tells_the_tools_what_a_pdf_allows() {
    assert_eq!(pdf_rules(&pdf()), PdfRules::default());
    let p1 = pdf_rules(&certified(&pdf(), 1));
    assert_eq!((p1.docmdp, p1.signed), (Some(1), true));
    let earlier = pdf_rules(&signed(key(), &pdf(), &options(None)));
    assert!(earlier.signed && earlier.docmdp.is_none() && earlier.locked.is_empty());
    let encrypted = pdf_rules(PASSWORD);
    assert!(encrypted.encrypted && !encrypted.damaged);
    let damaged = pdf_rules(b"%PDF-1.7\nnot a PDF");
    assert!(damaged.damaged && !damaged.encrypted);
    // the fields an earlier signature locked, by name
    let mut doc = Document::load_mem(FORM).unwrap();
    let names: Vec<String> = crate::signing::pdf::form_fields(&doc)
        .into_iter()
        .map(|field| field.name)
        .collect();
    let first = names.first().cloned().expect("the form has fields");
    let signed_form = signed(key(), &doc_bytes(&doc), &options(None));
    doc = Document::load_mem(&signed_form).unwrap();
    let sig = crate::signing::pdf::form_fields(&doc)
        .into_iter()
        .find(|field| field.signature && field.dict.get(b"V").is_ok())
        .and_then(|field| field.id)
        .expect("a signed field");
    doc.get_dictionary_mut(sig).unwrap().set(
        "Lock",
        dictionary! { "Action" => "Include", "Fields" => vec![Object::string_literal(first.clone())] },
    );
    assert_eq!(pdf_rules(&doc_bytes(&doc)).locked, [first]);
}

fn doc_bytes(doc: &Document) -> Vec<u8> {
    let mut out = vec![];
    doc.clone().save_to(&mut out).unwrap();
    out
}

#[test]
fn drops_transparency_for_a_pdfa1_target() {
    // a stamp with a transparency group and an image with a soft mask
    let mut doc = Document::load_mem(&stamp_pdf(10., 10., "x")).unwrap();
    let mask = doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 2, "Height" => 1,
        "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8 },
        vec![0, 255],
    ));
    let image = doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 2, "Height" => 1,
        "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8, "SMask" => mask },
        vec![0, 0],
    ));
    let page = pages(&doc)[0];
    let p = doc.get_dictionary_mut(page).unwrap();
    p.set(
        "Group",
        dictionary! { "S" => "Transparency", "CS" => "DeviceRGB" },
    );
    let resources = p.get_mut(b"Resources").unwrap().as_dict_mut().unwrap();
    resources.set("XObject", dictionary! { "Im0" => image });
    resources.set(
        "ExtGState",
        dictionary! { "G0" => dictionary! { "Type" => "ExtGState", "ca" => 0.5 } },
    );
    let stamp = doc_bytes(&doc);

    let import = |pdfa1: bool| {
        let target = pdf();
        let mut incr = lopdf::IncrementalDocument::create_from(
            target.clone(),
            Document::load_mem(&target).unwrap(),
        );
        let form = crate::signing::pdf::xobject::import_stamp(&mut incr, &stamp, pdfa1).unwrap();
        (incr.new_document, form.id)
    };
    let (kept, id) = import(false);
    assert!(kept
        .get_object(id)
        .unwrap()
        .as_stream()
        .unwrap()
        .dict
        .has(b"Group"));
    let (flat, id) = import(true);
    let form = flat.get_object(id).unwrap().as_stream().unwrap();
    assert!(!form.dict.has(b"Group"));
    let resources = form.dict.get(b"Resources").unwrap().as_dict().unwrap();
    let image_id = resources
        .get(b"XObject")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"Im0")
        .unwrap()
        .as_reference()
        .unwrap();
    let image = flat.get_object(image_id).unwrap().as_stream().unwrap();
    assert!(!image.dict.has(b"SMask"));
    // the transparent pixel is white now, the opaque one as it was
    assert_eq!(image.get_plain_content().unwrap(), [255, 0]);
    let state = resources
        .get(b"ExtGState")
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"G0")
        .unwrap()
        .as_dict()
        .unwrap();
    assert_eq!(state.get(b"ca").unwrap().as_float().unwrap(), 1.0);
}

#[test]
fn reads_the_parts_of_a_body() {
    let mut body = 2u32.to_le_bytes().to_vec();
    for part in [&b"%PDF"[..], b"ab"] {
        body.extend((part.len() as u64).to_le_bytes());
        body.extend(part);
    }
    assert_eq!(parts(&body).unwrap(), [&b"%PDF"[..], b"ab"]);
    // short, long, or with bytes after
    assert!(parts(&body[..body.len() - 1]).is_none());
    let mut longer = body.clone();
    longer.push(0);
    assert!(parts(&longer).is_none());
    assert!(parts(&[1, 0]).is_none());
    assert_eq!(parts(&0u32.to_le_bytes()).unwrap(), Vec::<&[u8]>::new());
}

#[test]
fn reads_a_tabs_file_while_it_is_the_one_opened() {
    let dir = tempfile::tempdir().unwrap();
    let path = written(dir.path(), "a.pdf", FORM);
    let sha = crate::pdf_view::sha256(FORM);
    let tabs = PdfTabs::default();
    assert_eq!(filled_bytes(&tabs, "t", &path, &sha, &[]).unwrap(), FORM);
    assert!(matches!(
        filled_bytes(&tabs, "t", &path, "00", &[]),
        Err(SigningError::FileChanged)
    ));
    assert!(matches!(
        filled_bytes(&tabs, "t", &dir.path().join("gone.pdf"), &sha, &[]),
        Err(SigningError::FileMissing)
    ));
    // fills need the tab's helper, which a tab that isn't open has not
    let fill = Fill {
        field: "Name".into(),
        value: FillValue::Text("Ada".into()),
    };
    assert!(filled_bytes(&tabs, "t", &path, &sha, &[fill]).is_err());
}

#[test]
fn signs_a_field_listed_before_an_earlier_signature() {
    // the earlier signature in a new field, after the form's own
    let earlier = signed(RSA_KEY, FORM, &options(Some([72., 72., 200., 50.])));
    let stamp = stamp_pdf(200., 50., "Signed");
    let plan = plan(
        vec![],
        SignaturePlan::Existing {
            field: "signature".into(),
            stamp: Some(1),
        },
    );
    let out = sign_as(key(), PASSPHRASE, &earlier, &plan, &[&stamp]).unwrap();
    assert!(out.starts_with(&earlier));
    let reports = verify_pdf(&out).unwrap();
    let fields: Vec<&str> = reports.iter().map(|r| r.field.as_str()).collect();
    assert_eq!(fields, ["signature", "Signature1"]);
    assert!(reports.iter().all(|r| r.valid()));
    if has("pdfsig") {
        let dir = tempfile::tempdir().unwrap();
        let path = written(dir.path(), "twice.pdf", &out);
        assert_eq!(pdfsig_valid(dir.path(), &path), (2, 2));
    }
}
