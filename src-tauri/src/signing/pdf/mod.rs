//! Loading a PDF for an incremental update, and what signing needs of it: page geometry, inherited attributes, text strings.

pub mod sign;

use anyhow::{bail, Context, Result};
use lopdf::xref::XrefType;
use lopdf::{Document, IncrementalDocument, Object, ObjectId, StringFormat};

pub struct Loaded {
    pub bytes: Vec<u8>,
    pub doc: Document,
    pub xref_stream: bool,
    pub hybrid: bool,
    pub warnings: Vec<String>,
}

/// The offset after the last `startxref`.
pub fn last_startxref(bytes: &[u8]) -> Option<usize> {
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

/// Loads a PDF that is about to get an incremental update, refusing what
/// can't safely be updated.
pub fn load_for_update(bytes: Vec<u8>) -> Result<Loaded> {
    if !bytes.starts_with(b"%PDF-") {
        // offsets in such files are relative to the header in some writers and
        // to the file start in others; appending to them is a guess
        bail!("the file doesn't start with %PDF- (junk before the header)");
    }
    let startxref = last_startxref(&bytes).context("no startxref at the end of the file")?;
    if !looks_like_xref_at(&bytes, startxref) {
        bail!("the cross-reference offset at the end of the file is wrong; the file would need repairing");
    }
    let doc = Document::load_mem(&bytes).context("can't read the PDF")?;
    if doc.xref_start == 0 || doc.xref_start != startxref {
        bail!("the cross-reference table had to be reconstructed; the file would need repairing");
    }
    if doc.trailer.get(b"Encrypt").is_ok() || doc.encryption_state.is_some() || doc.is_encrypted() {
        bail!("This PDF has restrictions set by its author. Blank can't sign it yet.");
    }
    let mut warnings = vec![];
    let in_use = doc
        .reference_table
        .entries
        .values()
        .filter(|e| {
            matches!(
                e,
                lopdf::xref::XrefEntry::Normal { .. } | lopdf::xref::XrefEntry::Compressed { .. }
            )
        })
        .count();
    if doc.objects.len() < in_use {
        warnings.push(format!(
            "{} of {in_use} objects couldn't be read",
            in_use - doc.objects.len()
        ));
    }
    let xref_stream = matches!(
        doc.reference_table.cross_reference_type,
        XrefType::CrossReferenceStream
    );
    let hybrid = doc.trailer.get(b"XRefStm").is_ok();
    Ok(Loaded {
        bytes,
        doc,
        xref_stream,
        hybrid,
        warnings,
    })
}

/// DocMDP permission of a certified document (1, 2 or 3), if any.
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

pub fn resolve<'a>(doc: &'a Document, o: &'a Object) -> Option<&'a Object> {
    doc.dereference(o).ok().map(|(_, o)| o)
}

/// An attribute of a page, inherited from its ancestors if the page lacks it.
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

/// Where a page shows: its crop box in user space, its rotation and unit.
#[derive(Debug, Clone, Copy)]
pub struct PageGeometry {
    pub bbox: [f64; 4],
    pub rotate: i64,
    pub user_unit: f64,
}

impl PageGeometry {
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

    /// The page as shown, in points: width and height.
    pub fn visible_size(&self) -> (f64, f64) {
        let w = (self.bbox[2] - self.bbox[0]) * self.user_unit;
        let h = (self.bbox[3] - self.bbox[1]) * self.user_unit;
        if self.rotate % 180 == 0 {
            (w, h)
        } else {
            (h, w)
        }
    }

    /// A point given in points from the top left of the page as shown, in user space.
    pub fn to_user(&self, vx: f64, vy: f64) -> (f64, f64) {
        let (vx, vy) = (vx / self.user_unit, vy / self.user_unit);
        let [x0, y0, x1, y1] = self.bbox;
        match self.rotate {
            90 => (x0 + vy, y0 + vx),
            180 => (x1 - vx, y0 + vy),
            270 => (x1 - vy, y1 - vx),
            _ => (x0 + vx, y1 - vy),
        }
    }

    /// A rectangle given as x, y, w, h in points from the top left of the page
    /// as shown, as a user-space rectangle [llx lly urx ury].
    pub fn rect_to_user(&self, r: [f64; 4]) -> [f64; 4] {
        let (ax, ay) = self.to_user(r[0], r[1]);
        let (bx, by) = self.to_user(r[0] + r[2], r[1] + r[3]);
        [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
    }

    /// The matrix that draws a form made upright (its BBox is [0 0 w h] in
    /// points) into `user` (a user-space rectangle) on this page.
    pub fn placement(&self, user: [f64; 4]) -> [f64; 6] {
        let s = 1.0 / self.user_unit;
        // rotate counter-clockwise by the page's rotation, which the viewer
        // turns clockwise again
        let (a, b, c, d) = match self.rotate {
            90 => (0., s, -s, 0.),
            180 => (-s, 0., 0., -s),
            270 => (0., -s, s, 0.),
            _ => (s, 0., 0., s),
        };
        // where the form's origin lands: the corner that ends up lowest-left
        let (e, f) = match self.rotate {
            90 => (user[2], user[1]),
            180 => (user[2], user[3]),
            270 => (user[0], user[3]),
            _ => (user[0], user[1]),
        };
        [a, b, c, d, e, f]
    }

    /// The rotation alone, for a widget's appearance /Matrix.
    pub fn appearance_matrix(&self) -> [f64; 6] {
        match self.rotate {
            90 => [0., 1., -1., 0., 0., 0.],
            180 => [-1., 0., 0., -1., 0., 0.],
            270 => [0., -1., 1., 0., 0., 0.],
            _ => [1., 0., 0., 1., 0., 0.],
        }
    }
}

pub fn reals(v: &[f64]) -> Object {
    Object::Array(v.iter().map(|x| Object::Real(*x as f32)).collect())
}

/// A PDF text string: PDFDocEncoding for ASCII, UTF-16BE otherwise.
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

/// Copies the old trailer for the new section, without the entries that
/// describe the old cross-reference section itself.
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

/// Which page objects the document has, in order (1-based page number -> id).
pub fn page_id(doc: &Document, page: u32) -> Result<ObjectId> {
    doc.get_pages()
        .get(&page)
        .copied()
        .with_context(|| format!("no page {page}"))
}
