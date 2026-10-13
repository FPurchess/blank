//! loading a PDF for an incremental update, and what signing needs of it:
//! page geometry, inherited attributes, text strings

pub mod sign;

use anyhow::{bail, Context, Result};
use lopdf::{Dictionary, Document, IncrementalDocument, Object, ObjectId, StringFormat};

use crate::signing::Refusal;

/// last_startxref returns the offset after the last `startxref`
fn last_startxref(bytes: &[u8]) -> Option<usize> {
    let tail_start = bytes.len().saturating_sub(2048);
    let tail = &bytes[tail_start..];
    let pos = tail.windows(9).rposition(|w| w == b"startxref")?;
    let rest = &tail[pos + 9..];
    let digits: Vec<u8> = rest
        .iter()
        .copied()
        .skip_while(|b| b.is_ascii_whitespace())
        .take_while(|b| b.is_ascii_digit())
        .collect();
    std::str::from_utf8(&digits).ok()?.parse().ok()
}

/// looks_like_xref_at tells whether a cross-reference section starts at
/// `at`: a table, or the object of a stream
fn looks_like_xref_at(bytes: &[u8], at: usize) -> bool {
    let Some(s) = bytes.get(at..) else {
        return false;
    };
    if s.starts_with(b"xref") {
        return true;
    }
    // "N G obj" of an xref stream
    let head = &s[..s.len().min(40)];
    let text = String::from_utf8_lossy(head);
    let mut it = text.split_ascii_whitespace();
    matches!((it.next(), it.next(), it.next()), (Some(n), Some(g), Some(o))
        if n.parse::<u32>().is_ok() && g.parse::<u16>().is_ok() && o.starts_with("obj"))
}

/// load_for_update reads a PDF that is about to get an incremental update,
/// refusing what can't safely be updated
pub fn load_for_update(bytes: &[u8]) -> Result<Document> {
    if !bytes.starts_with(b"%PDF-") {
        // offsets in such files are relative to the header in some writers and
        // to the file start in others; appending to them is a guess
        bail!("the file doesn't start with %PDF- (junk before the header)");
    }
    let startxref = last_startxref(bytes).context("no startxref at the end of the file")?;
    if !looks_like_xref_at(bytes, startxref) {
        bail!("the cross-reference offset at the end of the file is wrong; the file would need repairing");
    }
    let doc = Document::load_mem(bytes).context("can't read the PDF")?;
    if doc.xref_start == 0 || doc.xref_start != startxref {
        bail!("the cross-reference table had to be reconstructed; the file would need repairing");
    }
    if doc.trailer.get(b"Encrypt").is_ok() || doc.encryption_state.is_some() || doc.is_encrypted() {
        return Err(Refusal::Restricted.into());
    }
    Ok(doc)
}

/// docmdp_permission returns the DocMDP permission of a certified
/// document (1, 2 or 3), if it is one
pub fn docmdp_permission(doc: &Document) -> Option<i64> {
    let catalog = doc.catalog().ok()?;
    let perms = resolve(doc, catalog.get(b"Perms").ok()?)?.as_dict().ok()?;
    let sig = resolve(doc, perms.get(b"DocMDP").ok()?)?.as_dict().ok()?;
    let refs = resolve(doc, sig.get(b"Reference").ok()?)?.as_array().ok()?;
    for r in refs {
        let r = resolve(doc, r)?.as_dict().ok()?;
        if r.get(b"TransformMethod").and_then(Object::as_name).ok() == Some(b"DocMDP") {
            let p = r
                .get(b"TransformParams")
                .ok()
                .and_then(|t| resolve(doc, t))
                .and_then(|t| t.as_dict().ok())
                .and_then(|t| t.get(b"P").ok())
                .and_then(|p| p.as_i64().ok())
                .unwrap_or(2);
            return Some(p);
        }
    }
    Some(2)
}

/// resolve follows `o` if it's a reference
pub fn resolve<'a>(doc: &'a Document, o: &'a Object) -> Option<&'a Object> {
    doc.dereference(o).ok().map(|(_, o)| o)
}

/// the most fields form_fields visits, how deep it goes, how many kids of
/// one field it takes, and the longest full name it builds: a hostile
/// form (kids that list themselves or an ancestor, endless nesting, huge
/// arrays) can't make it loop or run out of memory
const MAX_FIELDS: usize = 10_000;
const MAX_DEPTH: usize = 32;
const MAX_KIDS: usize = 4_096;
const MAX_NAME: usize = 1_024;

/// a field of a PDF's form, as form_fields finds it
pub struct FormField<'a> {
    pub dict: &'a Dictionary,
    /// its partial name, `/T` as written
    pub partial: Option<&'a [u8]>,
    /// its full name, the partial names from the top joined by dots, at
    /// most MAX_NAME bytes
    pub name: String,
    /// a signature field: `/FT /Sig`, its own or inherited
    pub signature: bool,
}

/// form_fields walks the fields of the PDF's form (`/AcroForm /Fields` and
/// their `/Kids`), in the form's order, each field once
pub fn form_fields(doc: &Document) -> Vec<FormField<'_>> {
    let mut out = vec![];
    let Some(list) = doc
        .catalog()
        .ok()
        .and_then(|c| c.get(b"AcroForm").ok())
        .and_then(|o| resolve(doc, o))
        .and_then(|form| form.as_dict().ok())
        .and_then(|form| form.get(b"Fields").ok())
        .and_then(|o| resolve(doc, o))
        .and_then(|fields| fields.as_array().ok())
    else {
        return out;
    };
    // (field, its parent's full name, the parent is a signature, depth)
    let mut stack: Vec<(&Object, String, bool, usize)> = list
        .iter()
        .take(MAX_KIDS)
        .rev()
        .map(|f| (f, String::new(), false, 0))
        .collect();
    let mut seen = std::collections::HashSet::new();
    let mut visits = 0;
    while let Some((o, prefix, parent_sig, depth)) = stack.pop() {
        visits += 1;
        if visits > MAX_FIELDS {
            break;
        }
        let Ok((id, obj)) = doc.dereference(o) else {
            continue;
        };
        // a field listed twice, or in its own kids, is walked once
        if id.is_some_and(|id| !seen.insert(id)) {
            continue;
        }
        let Ok(dict) = obj.as_dict() else { continue };
        let title = dict.get(b"T").ok();
        let partial = title.and_then(|t| t.as_str().ok());
        let mut name = prefix;
        if let (Some(title), Some(raw)) = (title, partial) {
            let t = lopdf::decode_text_string(title)
                .unwrap_or_else(|_| String::from_utf8_lossy(raw).into_owned());
            if !name.is_empty() {
                name.push('.');
            }
            name.push_str(&t);
            if name.len() > MAX_NAME {
                let mut end = MAX_NAME;
                while !name.is_char_boundary(end) {
                    end -= 1;
                }
                name.truncate(end);
            }
        }
        let signature = dict
            .get(b"FT")
            .and_then(Object::as_name)
            .map(|n| n == b"Sig")
            .unwrap_or(parent_sig);
        if depth < MAX_DEPTH {
            if let Some(kids) = dict
                .get(b"Kids")
                .ok()
                .and_then(|k| resolve(doc, k))
                .and_then(|k| k.as_array().ok())
            {
                stack.extend(
                    kids.iter()
                        .take(MAX_KIDS)
                        .rev()
                        .map(|k| (k, name.clone(), signature, depth + 1)),
                );
            }
        }
        out.push(FormField {
            dict,
            partial,
            name,
            signature,
        });
    }
    out
}

/// inherited returns an attribute of a page, inherited from its ancestors
/// if the page lacks it
pub fn inherited<'a>(doc: &'a Document, page: ObjectId, key: &[u8]) -> Option<&'a Object> {
    let mut node = doc.get_dictionary(page).ok()?;
    for _ in 0..64 {
        if let Ok(v) = node.get(key) {
            return resolve(doc, v);
        }
        let parent = node.get(b"Parent").ok()?.as_reference().ok()?;
        node = doc.get_dictionary(parent).ok()?;
    }
    None
}

/// numbers reads an array of numbers
fn numbers(o: &Object, doc: &Document) -> Option<Vec<f64>> {
    let arr = resolve(doc, o)?.as_array().ok()?;
    arr.iter()
        .map(|v| match resolve(doc, v)? {
            Object::Integer(i) => Some(*i as f64),
            Object::Real(r) => Some(*r as f64),
            _ => None,
        })
        .collect()
}

/// where a page shows: its crop box in user space, its rotation and unit
#[derive(Debug, Clone, Copy)]
pub struct PageGeometry {
    pub bbox: [f64; 4],
    pub rotate: i64,
    pub user_unit: f64,
}

impl PageGeometry {
    /// of reads the geometry of `page`
    pub fn of(doc: &Document, page: ObjectId) -> Result<Self> {
        let media = inherited(doc, page, b"MediaBox")
            .and_then(|o| numbers(o, doc))
            .unwrap_or(vec![0., 0., 612., 792.]);
        let crop = inherited(doc, page, b"CropBox")
            .and_then(|o| numbers(o, doc))
            .unwrap_or(media.clone());
        if crop.len() != 4 {
            bail!("bad page box");
        }
        let norm = |b: &[f64]| {
            [
                b[0].min(b[2]),
                b[1].min(b[3]),
                b[0].max(b[2]),
                b[1].max(b[3]),
            ]
        };
        let rotate = inherited(doc, page, b"Rotate")
            .and_then(|o| o.as_i64().ok())
            .unwrap_or(0)
            .rem_euclid(360);
        let rotate = (rotate / 90) * 90;
        let user_unit = doc
            .get_dictionary(page)?
            .get(b"UserUnit")
            .ok()
            .and_then(|o| match o {
                Object::Integer(i) => Some(*i as f64),
                Object::Real(r) => Some(*r as f64),
                _ => None,
            })
            .unwrap_or(1.0);
        Ok(Self {
            bbox: norm(&crop),
            rotate,
            user_unit,
        })
    }

    /// point_to_user turns a point given in points from the top left of the page
    /// as shown into user space
    pub fn point_to_user(&self, vx: f64, vy: f64) -> (f64, f64) {
        let (vx, vy) = (vx / self.user_unit, vy / self.user_unit);
        let [x0, y0, x1, y1] = self.bbox;
        match self.rotate {
            90 => (x0 + vy, y0 + vx),
            180 => (x1 - vx, y0 + vy),
            270 => (x1 - vy, y1 - vx),
            _ => (x0 + vx, y1 - vy),
        }
    }

    /// rect_to_user turns a rectangle given as x, y, w, h in points from the
    /// top left of the page as shown into a user-space rectangle [llx lly
    /// urx ury]
    pub fn rect_to_user(&self, r: [f64; 4]) -> [f64; 4] {
        let (ax, ay) = self.point_to_user(r[0], r[1]);
        let (bx, by) = self.point_to_user(r[0] + r[2], r[1] + r[3]);
        [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
    }

    /// appearance_matrix is the rotation alone, for a widget's appearance
    /// /Matrix
    pub fn appearance_matrix(&self) -> [f64; 6] {
        match self.rotate {
            90 => [0., 1., -1., 0., 0., 0.],
            180 => [-1., 0., 0., -1., 0., 0.],
            270 => [0., -1., 1., 0., 0., 0.],
            _ => [1., 0., 0., 1., 0., 0.],
        }
    }
}

/// reals is an array of reals
pub fn reals(v: &[f64]) -> Object {
    Object::Array(v.iter().map(|x| Object::Real(*x as f32)).collect())
}

/// text_string is a PDF text string: PDFDocEncoding for ASCII, UTF-16BE
/// otherwise
pub fn text_string(s: &str) -> Object {
    if s.is_ascii() {
        Object::String(s.as_bytes().to_vec(), StringFormat::Literal)
    } else {
        let mut b = vec![0xfe, 0xff];
        for u in s.encode_utf16() {
            b.extend(u.to_be_bytes());
        }
        Object::String(b, StringFormat::Hexadecimal)
    }
}

/// clean_trailer keeps the old trailer for the new section, without the
/// entries that describe the old cross-reference section itself
pub fn clean_trailer(incr: &mut IncrementalDocument) {
    let t = &mut incr.new_document.trailer;
    for k in [
        &b"XRefStm"[..],
        b"DecodeParms",
        b"Filter",
        b"Index",
        b"W",
        b"Length",
        b"Type",
        b"F",
        b"FFilter",
        b"FDecodeParms",
        b"DL",
    ] {
        t.remove(k);
    }
}

/// page_id returns the object of page `page`, from 1
pub fn page_id(doc: &Document, page: u32) -> Result<ObjectId> {
    doc.get_pages()
        .get(&page)
        .copied()
        .with_context(|| format!("no page {page}"))
}
