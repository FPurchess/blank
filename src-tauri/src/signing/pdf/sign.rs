//! signing a PDF in an incremental update: a new /Sig field and widget,
//! the signature dictionary with a reserved /Contents, then the byte ranges
//! are patched in, hashed and signed

use super::{
    clean_trailer, docmdp_permission, load_for_update, page_id, reals, text_string, PageGeometry,
};
use crate::signing::cms::sign_detached;
use crate::signing::keys::Identity;
use crate::signing::Refusal;
use anyhow::{bail, Context, Result};
use lopdf::{dictionary, Dictionary, IncrementalDocument, Object, ObjectId, Stream, StringFormat};
use sha2::{Digest, Sha256};

/// what to sign with, and where the signature goes
pub struct SignRequest<'a> {
    pub identity: &'a Identity,
    /// 1-based page of the signature widget
    pub page: u32,
    /// x, y, w, h in points from the top left of the page as shown; None: invisible
    pub rect: Option<[f64; 4]>,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub name: Option<String>,
    pub tsa: Option<String>,
    /// bytes reserved for the DER signature (hex doubles it)
    pub reserve: usize,
}

/// the most room for a signature: a long chain and a timestamp token fit
/// many times over
const MAX_RESERVE: usize = 256 * 1024;

/// how a signing went: signed, or the signature needed more room
enum Attempt {
    Signed(Vec<u8>),
    /// the DER signature's length, more than the room reserved
    TooLarge(usize),
}

const BR_PLACEHOLDER: [i64; 4] = [0, 1_111_111_111, 2_222_222_222, 3_333_333_333];

/// sign_pdf signs `original` as `req` asks, and returns it with the
/// signature appended; a signature larger than `req.reserve` is made again
/// with room for it
pub fn sign_pdf(original: &[u8], req: &SignRequest) -> Result<Vec<u8>> {
    if let Some(rect) = req.rect {
        if !rect.iter().all(|value| value.is_finite()) || rect[2] <= 0. || rect[3] <= 0. {
            bail!("the signature's place isn't a rectangle");
        }
    }
    match sign_once(original, req, req.reserve)? {
        Attempt::Signed(signed) => Ok(signed),
        // a new signature, and a new timestamp, may be a little longer
        Attempt::TooLarge(length) if length + 2048 <= MAX_RESERVE => {
            match sign_once(original, req, length + 2048)? {
                Attempt::Signed(signed) => Ok(signed),
                Attempt::TooLarge(_) => bail!("the signature doesn't fit"),
            }
        }
        Attempt::TooLarge(_) => bail!("the signature doesn't fit"),
    }
}

/// pdf_date is now, as a PDF date
fn pdf_date() -> String {
    let t = time::OffsetDateTime::now_utc();
    format!(
        "D:{:04}{:02}{:02}{:02}{:02}{:02}Z",
        t.year(),
        t.month() as u8,
        t.day(),
        t.hour(),
        t.minute(),
        t.second()
    )
}

/// add_annot adds `widget` to the page's /Annots, wherever that array lives
fn add_annot(incr: &mut IncrementalDocument, page: ObjectId, widget: ObjectId) -> Result<()> {
    let annots = incr
        .get_prev_documents()
        .get_dictionary(page)?
        .get(b"Annots")
        .ok()
        .cloned();
    match annots {
        Some(Object::Reference(r)) => {
            incr.opt_clone_object_to_new_document(r)?;
            match incr.new_document.get_object_mut(r)? {
                Object::Array(a) => a.push(Object::Reference(widget)),
                _ => bail!("/Annots doesn't point to an array"),
            }
        }
        Some(Object::Array(mut a)) => {
            a.push(Object::Reference(widget));
            incr.opt_clone_object_to_new_document(page)?;
            incr.new_document.get_dictionary_mut(page)?.set("Annots", a);
        }
        _ => {
            incr.opt_clone_object_to_new_document(page)?;
            incr.new_document
                .get_dictionary_mut(page)?
                .set("Annots", vec![Object::Reference(widget)]);
        }
    }
    Ok(())
}

/// add_field adds the field to /AcroForm /Fields and sets /SigFlags 3
fn add_field(incr: &mut IncrementalDocument, field: ObjectId) -> Result<()> {
    let root = incr
        .get_prev_documents()
        .trailer
        .get(b"Root")?
        .as_reference()?;
    let form = incr
        .get_prev_documents()
        .get_dictionary(root)?
        .get(b"AcroForm")
        .ok()
        .cloned();
    let update = |incr: &mut IncrementalDocument, form: &mut Dictionary| -> Result<()> {
        form.set("SigFlags", 3);
        match form.get(b"Fields").ok().cloned() {
            Some(Object::Reference(r)) => {
                incr.opt_clone_object_to_new_document(r)?;
                match incr.new_document.get_object_mut(r)? {
                    Object::Array(a) => a.push(Object::Reference(field)),
                    _ => bail!("/Fields doesn't point to an array"),
                }
            }
            Some(Object::Array(mut a)) => {
                a.push(Object::Reference(field));
                form.set("Fields", a);
            }
            _ => form.set("Fields", vec![Object::Reference(field)]),
        }
        Ok(())
    };
    match form {
        Some(Object::Reference(r)) => {
            let mut f = incr.get_prev_documents().get_dictionary(r)?.clone();
            update(incr, &mut f)?;
            incr.new_document.set_object(r, f);
        }
        Some(Object::Dictionary(mut f)) => {
            update(incr, &mut f)?;
            incr.opt_clone_object_to_new_document(root)?;
            incr.new_document
                .get_dictionary_mut(root)?
                .set("AcroForm", f);
        }
        _ => {
            let mut f = Dictionary::new();
            update(incr, &mut f)?;
            let id = incr.new_document.add_object(f);
            incr.opt_clone_object_to_new_document(root)?;
            incr.new_document
                .get_dictionary_mut(root)?
                .set("AcroForm", id);
        }
    }
    Ok(())
}

/// appearance is the widget's appearance: an empty form. What the
/// signature looks like is in the page content (a signature block Blank
/// drew), or there is none (an invisible signature); Blank draws no frame
/// around a signature.
fn appearance(incr: &mut IncrementalDocument, geo: &PageGeometry, w: f64, h: f64) -> ObjectId {
    let dict = dictionary! {
        "Type" => "XObject", "Subtype" => "Form", "BBox" => reals(&[0., 0., w, h]),
        "Matrix" => reals(&geo.appearance_matrix()),
    };
    incr.new_document.add_object(Stream::new(dict, Vec::new()))
}

/// sign_once signs `original` with `reserve` bytes of room for the DER
/// signature
fn sign_once(original: &[u8], req: &SignRequest, reserve: usize) -> Result<Attempt> {
    let doc = load_for_update(original)?;
    // P=2 allows signing, though Acrobat may count the new field as a
    // change it didn't allow
    if docmdp_permission(&doc) == Some(1) {
        return Err(Refusal::Certified.into());
    }
    let names: Vec<Vec<u8>> = super::form_fields(&doc)
        .iter()
        .filter_map(|field| field.partial.map(<[u8]>::to_vec))
        .collect();
    let mut incr = IncrementalDocument::create_from(original.to_vec(), doc);
    clean_trailer(&mut incr);

    let page = page_id(incr.get_prev_documents(), req.page)?;
    let geo = PageGeometry::of(incr.get_prev_documents(), page)?;
    let date = pdf_date();

    let mut sig = dictionary! {
        "Type" => "Sig",
        "Filter" => "Adobe.PPKLite",
        "SubFilter" => "ETSI.CAdES.detached",
        "ByteRange" => BR_PLACEHOLDER.iter().map(|n| Object::Integer(*n)).collect::<Vec<_>>(),
        "Contents" => Object::String(vec![0; reserve], StringFormat::Hexadecimal),
        "M" => Object::String(date.clone().into_bytes(), StringFormat::Literal),
    };
    if let Some(n) = &req.name {
        sig.set("Name", text_string(n));
    }
    if let Some(r) = &req.reason {
        sig.set("Reason", text_string(r));
    }
    if let Some(l) = &req.location {
        sig.set("Location", text_string(l));
    }
    let sig_id = incr.new_document.add_object(sig);
    let (rect, ap) = match req.rect {
        Some(r) => (geo.rect_to_user(r), appearance(&mut incr, &geo, r[2], r[3])),
        None => ([0.; 4], appearance(&mut incr, &geo, 0., 0.)),
    };
    let mut n = 1;
    let field_name = loop {
        let name = format!("Signature{n}");
        if !names.iter().any(|x| x == name.as_bytes()) {
            break name;
        }
        n += 1;
    };
    let widget = dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Sig",
        "T" => Object::String(field_name.into_bytes(), StringFormat::Literal),
        "V" => sig_id, "F" => 4, "Rect" => reals(&rect), "P" => page,
        "AP" => dictionary! { "N" => ap },
    };
    let widget_id = incr.new_document.add_object(widget);
    add_annot(&mut incr, page, widget_id)?;
    add_field(&mut incr, widget_id)?;

    let mut out = Vec::new();
    incr.save_to(&mut out)?;
    // lopdf ends with "%%EOF" and no newline; add one like most writers
    out.push(b'\n');

    // patch /ByteRange and find /Contents in what we appended
    let appended = original.len();
    let find = |needle: &[u8]| -> Result<usize> {
        out[appended..]
            .windows(needle.len())
            .position(|w| w == needle)
            .map(|p| p + appended)
            .context("placeholder not found")
    };
    let hex_zeros = vec![b'0'; reserve * 2];
    let mut contents_needle = vec![b'<'];
    contents_needle.extend(&hex_zeros);
    contents_needle.push(b'>');
    let gap_start = find(&contents_needle)?;
    let gap_end = gap_start + contents_needle.len();
    let br = [0, gap_start, gap_end, out.len() - gap_end];
    let placeholder = format!(
        "{} {} {} {}",
        BR_PLACEHOLDER[0], BR_PLACEHOLDER[1], BR_PLACEHOLDER[2], BR_PLACEHOLDER[3]
    );
    let br_at = find(placeholder.as_bytes())?;
    let mut actual = format!("{} {} {} {}", br[0], br[1], br[2], br[3]);
    if actual.len() > placeholder.len() {
        bail!("byte range too long");
    }
    while actual.len() < placeholder.len() {
        actual.push(' ');
    }
    out[br_at..br_at + placeholder.len()].copy_from_slice(actual.as_bytes());

    let mut h = Sha256::new();
    h.update(&out[..gap_start]);
    h.update(&out[gap_end..]);
    let digest: [u8; 32] = h.finalize().into();

    // the timestamp server is asked between signing and writing the
    // signature; sign_pdf runs on a blocking thread, which may wait for it
    let tsa = req.tsa.clone().unwrap_or_default();
    let stamp =
        |value: &[u8]| tauri::async_runtime::block_on(crate::signing::tsa::timestamp(&tsa, value));
    let cms = sign_detached(
        req.identity,
        &digest,
        req.tsa
            .as_ref()
            .map(|_| &stamp as crate::signing::cms::Stamp),
    )?;
    if cms.len() > reserve {
        return Ok(Attempt::TooLarge(cms.len()));
    }
    let hex = hex::encode_upper(&cms);
    out[gap_start + 1..gap_start + 1 + hex.len()].copy_from_slice(hex.as_bytes());

    if !out.starts_with(original) {
        bail!("the update changed the bytes before it");
    }
    Ok(Attempt::Signed(out))
}
