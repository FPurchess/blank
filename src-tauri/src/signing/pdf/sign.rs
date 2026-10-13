//! an incremental update of a PDF: stamps in its pages' content, empty
//! signature fields for others, and a signature: a /Sig field and widget
//! (one the PDF has, or a new one), the signature dictionary with a
//! reserved /Contents, then the byte ranges are patched in, hashed and
//! signed. Without a signer the update holds the stamps and fields alone.

use std::collections::HashMap;

use super::rules::Rules;
use super::stamp::{appearance, draw_on_page, repeat_into, Draw};
use super::xobject::{import_stamp, Imported};
use super::{
    clean_trailer, current, form_fields, is_rect, load_for_update, numbers, page_in, pdfa_part,
    reals, resolve, text_string, PageGeometry,
};
use crate::signing::cms::sign_detached;
use crate::signing::keys::Identity;
use crate::signing::Refusal;
use anyhow::{bail, Context, Result};
use lopdf::{
    dictionary, Dictionary, Document, IncrementalDocument, Object, ObjectId, StringFormat,
};
use sha2::{Digest, Sha256};

/// who signs, and what the signature says
pub struct Signer<'a> {
    pub identity: &'a Identity,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub name: Option<String>,
    pub tsa: Option<String>,
    /// bytes reserved for the DER signature (hex doubles it)
    pub reserve: usize,
}

/// a stamp to put on the pages: its one-page PDF, made by Blank's engine
pub struct PlacedStamp<'a> {
    pub pdf: &'a [u8],
    /// from 1
    pub page: u32,
    /// x, y, w, h in points from the top left of the page as shown
    pub rect: [f64; 4],
    /// on every page, as far from the nearer edges as on `page`
    /// (`repeat_into`)
    pub repeat: bool,
}

/// where the signature goes, and what it shows
pub enum Spot<'a> {
    /// nowhere on the pages: PDF apps show it in their signature panel
    Invisible,
    /// the empty signature field of this full name
    Existing {
        field: String,
        stamp: Option<&'a [u8]>,
    },
    /// a new field, `SignatureN`
    New {
        /// from 1
        page: u32,
        rect: [f64; 4],
        stamp: Option<&'a [u8]>,
    },
}

/// an empty signature field for someone else to sign later
pub struct Other {
    pub page: u32,
    pub rect: [f64; 4],
    /// who is to sign it: the field is "Signature of ‹name›"
    pub name: String,
}

/// what goes into the update
pub struct Plan<'a> {
    pub stamps: Vec<PlacedStamp<'a>>,
    pub signature: Spot<'a>,
    pub others: Vec<Other>,
    /// the fields the user filled in (full names), in a revision of their
    /// own before this one: none may be one an earlier signature locked
    pub filled: Vec<&'a str>,
}

/// the most room for a signature: a long chain and a timestamp token fit
/// many times over
const MAX_RESERVE: usize = 256 * 1024;
/// the most stamps and other signers' fields one update takes
const MAX_STAMPS: usize = 1_000;

/// how a signing went: signed, or the signature needed more room
enum Attempt {
    Signed(Vec<u8>),
    /// the DER signature's length, more than the room reserved
    TooLarge(usize),
}

const BR_PLACEHOLDER: [i64; 4] = [0, 1_111_111_111, 2_222_222_222, 3_333_333_333];

/// update_pdf appends `plan` to `original`, which `load_for_update` read
/// as `doc`, as an incremental update, signed by `signer`, or with no
/// signature without one. A signature larger than `signer.reserve` is made
/// again with room for it.
pub fn update_pdf(
    original: &[u8],
    doc: Document,
    plan: &Plan,
    signer: Option<&Signer>,
) -> Result<Vec<u8>> {
    let rects = plan
        .stamps
        .iter()
        .map(|s| &s.rect)
        .chain(plan.others.iter().map(|o| &o.rect))
        .chain(match &plan.signature {
            Spot::New { rect, .. } => Some(rect),
            _ => None,
        });
    for rect in rects {
        if !is_rect(rect) {
            bail!("a place on the page isn't a rectangle");
        }
    }
    if plan.stamps.len() + plan.others.len() > MAX_STAMPS {
        bail!("too many stamps");
    }
    let Some(signer) = signer else {
        let (incr, _) = build(original, doc, plan, None)?;
        return save(incr, original);
    };
    match sign_once(original, doc, plan, signer, signer.reserve)? {
        Attempt::Signed(signed) => Ok(signed),
        // a new signature, and a new timestamp, may be a little longer;
        // the PDF read again, which the first try took
        Attempt::TooLarge(length) if length + 2048 <= MAX_RESERVE => {
            let doc = load_for_update(original)?;
            match sign_once(original, doc, plan, signer, length + 2048)? {
                Attempt::Signed(signed) => Ok(signed),
                Attempt::TooLarge(_) => bail!("the signature doesn't fit"),
            }
        }
        Attempt::TooLarge(_) => bail!("the signature doesn't fit"),
    }
}

/// save writes the update after `original`
fn save(mut incr: IncrementalDocument, original: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    incr.save_to(&mut out)?;
    // lopdf ends with "%%EOF" and no newline; add one like most writers
    out.push(b'\n');
    if !out.starts_with(original) {
        bail!("the update changed the bytes before it");
    }
    Ok(out)
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
    let annots = current(incr, page)?.as_dict()?.get(b"Annots").ok().cloned();
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

/// add_fields adds `fields` to /AcroForm /Fields, and with `signed` sets
/// /SigFlags 3 (signatures exist, append only)
fn add_fields(incr: &mut IncrementalDocument, fields: &[ObjectId], signed: bool) -> Result<()> {
    if fields.is_empty() && !signed {
        return Ok(());
    }
    let root = incr
        .get_prev_documents()
        .trailer
        .get(b"Root")?
        .as_reference()?;
    let form = current(incr, root)?
        .as_dict()?
        .get(b"AcroForm")
        .ok()
        .cloned();
    let update = |incr: &mut IncrementalDocument, form: &mut Dictionary| -> Result<()> {
        if signed {
            form.set("SigFlags", 3);
        }
        let added = fields.iter().map(|f| Object::Reference(*f));
        match form.get(b"Fields").ok().cloned() {
            Some(Object::Reference(r)) => {
                incr.opt_clone_object_to_new_document(r)?;
                match incr.new_document.get_object_mut(r)? {
                    Object::Array(a) => a.extend(added),
                    _ => bail!("/Fields doesn't point to an array"),
                }
            }
            Some(Object::Array(mut a)) => {
                a.extend(added);
                form.set("Fields", a);
            }
            _ => form.set("Fields", added.collect::<Vec<_>>()),
        }
        Ok(())
    };
    match form {
        Some(Object::Reference(r)) => {
            let mut f = current(incr, r)?.as_dict()?.clone();
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

/// free_field_name is `wanted`, or `wanted` with the first number that
/// makes it a name no field has; `numbered` starts with `wanted1`
fn free_field_name(taken: &mut Vec<String>, wanted: &str, numbered: bool) -> String {
    let name = (if numbered { 1 } else { 0 }..)
        .map(|n| match n {
            0 => wanted.to_string(),
            n if numbered => format!("{wanted}{n}"),
            n => format!("{wanted} {}", n + 1),
        })
        .find(|name| !taken.contains(name))
        .unwrap_or_default();
    taken.push(name.clone());
    name
}

/// other_field_name is the field name for someone else's signature: a
/// partial name can't hold a period, which joins the parts of full names
fn other_field_name(name: &str) -> String {
    let name: String = name
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if c == '.' { ' ' } else { c })
        .collect();
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        "Signature".into()
    } else {
        format!("Signature of {name}")
    }
}

/// an empty signature field the PDF has, and the widget showing it
struct Target {
    field: ObjectId,
    widget: ObjectId,
    page: ObjectId,
    /// the widget's rectangle in user space
    rect: [f64; 4],
}

/// find_target finds the empty signature field `name` of the PDF in `incr`
fn find_target(incr: &IncrementalDocument, rules: &Rules, name: &str) -> Result<Target> {
    let doc = incr.get_prev_documents();
    let fields = form_fields(doc);
    let field = fields
        .iter()
        .filter(|f| f.signature && f.name == name)
        // a field with kids is the one the kids' values belong to
        .find(|f| f.partial.is_some())
        .ok_or(Refusal::NoSuchField)?;
    if field.dict.has(b"V") {
        return Err(Refusal::FieldSigned.into());
    }
    if rules.locks(name) {
        return Err(Refusal::FieldLocked.into());
    }
    let field_id = field.id.context("a signature field isn't an object")?;
    let is_widget =
        |d: &Dictionary| d.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"Widget");
    let widget = if is_widget(field.dict) {
        field_id
    } else {
        field
            .dict
            .get(b"Kids")
            .ok()
            .and_then(|k| resolve(doc, k))
            .and_then(|k| k.as_array().ok())
            .into_iter()
            .flatten()
            .filter_map(|k| k.as_reference().ok())
            .find(|k| doc.get_dictionary(*k).is_ok_and(is_widget))
            .context("a signature field has no widget")?
    };
    let widget_dict = doc.get_dictionary(widget)?;
    let page = match widget_dict.get(b"P").and_then(Object::as_reference) {
        Ok(page) if doc.get_pages().values().any(|p| *p == page) => page,
        _ => doc
            .get_pages()
            .values()
            .copied()
            .find(|page| {
                doc.get_dictionary(*page)
                    .ok()
                    .and_then(|p| p.get(b"Annots").ok())
                    .and_then(|a| resolve(doc, a))
                    .and_then(|a| a.as_array().ok())
                    .is_some_and(|a| a.iter().any(|a| a.as_reference().ok() == Some(widget)))
            })
            .context("a signature field isn't on a page")?,
    };
    let Some([x0, y0, x1, y1]) = widget_dict
        .get(b"Rect")
        .ok()
        .and_then(|r| numbers(r, doc))
        .and_then(|n| <[f64; 4]>::try_from(n).ok())
    else {
        bail!("a signature field's widget has no rectangle");
    };
    Ok(Target {
        field: field_id,
        widget,
        page,
        rect: [x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)],
    })
}

/// the stamps of a plan, each copied into the update once
struct Forms {
    pdfa1: bool,
    imported: HashMap<(usize, usize), Imported>,
}

impl Forms {
    fn get(&mut self, incr: &mut IncrementalDocument, pdf: &[u8]) -> Result<Imported> {
        let key = (pdf.as_ptr() as usize, pdf.len());
        if let Some(form) = self.imported.get(&key) {
            return Ok(*form);
        }
        let form = import_stamp(incr, pdf, self.pdfa1)?;
        self.imported.insert(key, form);
        Ok(form)
    }
}

/// build makes the update `plan` asks for of `original` (read as `doc`),
/// signed with the signature dictionary `signature` if there is one
fn build(
    original: &[u8],
    doc: Document,
    plan: &Plan,
    signature: Option<Dictionary>,
) -> Result<(IncrementalDocument, Option<ObjectId>)> {
    let rules = Rules::read(&doc);
    if !rules.allows_changes() {
        return Err(Refusal::Certified.into());
    }
    if plan.filled.iter().any(|name| rules.locks(name)) {
        return Err(Refusal::FilledLocked.into());
    }
    let mut taken: Vec<String> = form_fields(&doc).into_iter().map(|f| f.name).collect();
    let mut forms = Forms {
        pdfa1: pdfa_part(&doc) == Some(1),
        imported: HashMap::new(),
    };
    let mut incr = IncrementalDocument::create_from(original.to_vec(), doc);
    clean_trailer(&mut incr);
    let pages = incr.get_prev_documents().get_pages();
    let page_of = |number: u32| page_in(&pages, number);
    let signing = signature.is_some();

    let target = match &plan.signature {
        Spot::Existing { field, .. } => Some(find_target(&incr, &rules, field)?),
        _ => None,
    };
    // the signature's stamp: in the page content on a PDF nobody signed
    // yet, else as the signature's appearance; without a signature always
    // in the page content
    let signature_stamp = match &plan.signature {
        Spot::New { stamp, .. } | Spot::Existing { stamp, .. } => *stamp,
        Spot::Invisible => None,
    };
    let stamp_in_content = signature_stamp.is_some()
        && match &plan.signature {
            Spot::New { .. } => !signing || rules.allows_page_content(),
            _ => !signing,
        };

    // the stamps in the pages' content
    let mut draws: Vec<(ObjectId, Draw)> = vec![];
    for stamp in &plan.stamps {
        let form = forms.get(&mut incr, stamp.pdf)?;
        if stamp.repeat {
            let size = |page: ObjectId| {
                PageGeometry::of(incr.get_prev_documents(), page).map(|geo| geo.visible_size())
            };
            let placed = size(page_of(stamp.page)?)?;
            for page in pages.values() {
                let rect = repeat_into(stamp.rect, placed, size(*page)?);
                draws.push((*page, Draw { form, rect }));
            }
        } else {
            draws.push((
                page_of(stamp.page)?,
                Draw {
                    form,
                    rect: stamp.rect,
                },
            ));
        }
    }
    if let (true, Some(pdf)) = (stamp_in_content, signature_stamp) {
        let form = forms.get(&mut incr, pdf)?;
        match (&plan.signature, &target) {
            (Spot::New { page, rect, .. }, _) => {
                draws.push((page_of(*page)?, Draw { form, rect: *rect }));
            }
            (Spot::Existing { .. }, Some(target)) => {
                let geo = PageGeometry::of(incr.get_prev_documents(), target.page)?;
                let rect = geo.user_to_display(target.rect);
                draws.push((target.page, Draw { form, rect }));
            }
            _ => {}
        }
    }
    if !draws.is_empty() && !rules.allows_page_content() {
        return Err(Refusal::SignedPages.into());
    }
    let mut by_page: Vec<(ObjectId, Vec<Draw>)> = vec![];
    for (page, draw) in draws {
        match by_page.iter_mut().find(|(p, _)| *p == page) {
            Some((_, list)) => list.push(draw),
            None => by_page.push((page, vec![draw])),
        }
    }
    for (page, list) in &by_page {
        draw_on_page(&mut incr, *page, list)?;
    }

    // empty signature fields for the others who sign
    let mut new_fields = vec![];
    for other in &plan.others {
        let page = page_of(other.page)?;
        let geo = PageGeometry::of(incr.get_prev_documents(), page)?;
        let ap = appearance(&mut incr, &geo, other.rect[2], other.rect[3], None);
        let name = free_field_name(&mut taken, &other_field_name(&other.name), false);
        let widget = incr.new_document.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Widget", "FT" => "Sig",
            "T" => text_string(&name), "TU" => text_string(&name),
            "F" => 4, "Rect" => reals(&geo.rect_to_user(other.rect)), "P" => page,
            "AP" => dictionary! { "N" => ap },
        });
        add_annot(&mut incr, page, widget)?;
        new_fields.push(widget);
    }

    // the signature
    let mut sig_id = None;
    if let Some(sig) = signature {
        let id = incr.new_document.add_object(sig);
        sig_id = Some(id);
        let shown = if stamp_in_content {
            None
        } else {
            signature_stamp
                .map(|pdf| forms.get(&mut incr, pdf))
                .transpose()?
        };
        match (&plan.signature, target) {
            (Spot::Existing { .. }, Some(target)) => {
                let geo = PageGeometry::of(incr.get_prev_documents(), target.page)?;
                let [_, _, w, h] = geo.user_to_display(target.rect);
                let ap = appearance(&mut incr, &geo, w, h, shown);
                incr.opt_clone_object_to_new_document(target.field)?;
                incr.new_document
                    .get_dictionary_mut(target.field)?
                    .set("V", id);
                incr.opt_clone_object_to_new_document(target.widget)?;
                let widget = incr.new_document.get_dictionary_mut(target.widget)?;
                widget.set("AP", dictionary! { "N" => ap });
                widget.set("F", 4);
                widget.remove(b"AS");
            }
            (spot, _) => {
                let (page, rect) = match spot {
                    Spot::New { page, rect, .. } => (page_of(*page)?, Some(*rect)),
                    _ => (page_of(1)?, None),
                };
                let geo = PageGeometry::of(incr.get_prev_documents(), page)?;
                let (user, ap) = match rect {
                    Some(r) => (
                        geo.rect_to_user(r),
                        appearance(&mut incr, &geo, r[2], r[3], shown),
                    ),
                    None => ([0.; 4], appearance(&mut incr, &geo, 0., 0., None)),
                };
                let name = free_field_name(&mut taken, "Signature", true);
                let widget = incr.new_document.add_object(dictionary! {
                    "Type" => "Annot", "Subtype" => "Widget", "FT" => "Sig",
                    "T" => text_string(&name),
                    "V" => id, "F" => 4, "Rect" => reals(&user), "P" => page,
                    "AP" => dictionary! { "N" => ap },
                });
                add_annot(&mut incr, page, widget)?;
                new_fields.push(widget);
            }
        }
    }
    add_fields(&mut incr, &new_fields, signing)?;
    Ok((incr, sig_id))
}

/// sign_once signs `original` with `reserve` bytes of room for the DER
/// signature
fn sign_once(
    original: &[u8],
    doc: Document,
    plan: &Plan,
    signer: &Signer,
    reserve: usize,
) -> Result<Attempt> {
    let mut sig = dictionary! {
        "Type" => "Sig",
        "Filter" => "Adobe.PPKLite",
        "SubFilter" => "ETSI.CAdES.detached",
        "ByteRange" => BR_PLACEHOLDER.iter().map(|n| Object::Integer(*n)).collect::<Vec<_>>(),
        "Contents" => Object::String(vec![0; reserve], StringFormat::Hexadecimal),
        "M" => Object::String(pdf_date().into_bytes(), StringFormat::Literal),
    };
    if let Some(n) = &signer.name {
        sig.set("Name", text_string(n));
    }
    if let Some(r) = &signer.reason {
        sig.set("Reason", text_string(r));
    }
    if let Some(l) = &signer.location {
        sig.set("Location", text_string(l));
    }
    let (incr, _) = build(original, doc, plan, Some(sig))?;
    let mut out = save(incr, original)?;

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
    // signature; update_pdf runs on a blocking thread, which may wait for it
    let tsa = signer.tsa.clone().unwrap_or_default();
    let stamp =
        |value: &[u8]| tauri::async_runtime::block_on(crate::signing::tsa::timestamp(&tsa, value));
    let cms = sign_detached(
        signer.identity,
        &digest,
        signer
            .tsa
            .as_ref()
            .map(|_| &stamp as crate::signing::cms::Stamp),
    )?;
    if cms.len() > reserve {
        return Ok(Attempt::TooLarge(cms.len()));
    }
    let hex = hex::encode_upper(&cms);
    out[gap_start + 1..gap_start + 1 + hex.len()].copy_from_slice(hex.as_bytes());
    Ok(Attempt::Signed(out))
}
