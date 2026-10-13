//! a stamp's one-page PDF, which Blank's engine made with krilla, as a Form
//! XObject of the PDF being updated: page 1's content and every object its
//! resources reach, copied with new ids. Its marked content becomes
//! artifacts, since the stamp isn't part of the PDF's structure tree, and
//! for a PDF/A-1 target its transparency goes (PDF/A-1 has none).

use std::collections::HashMap;

use anyhow::{bail, Context, Result};
use lopdf::content::{Content, Operation};
use lopdf::Stream;
use lopdf::{dictionary, Dictionary, Document, IncrementalDocument, LoadOptions, Object, ObjectId};

use super::{inherited, numbers, page_id, reals, resolve};

/// the largest stamp PDF taken, what any stream of it may decompress to,
/// how many objects it may bring along and how deep they may nest: it's
/// Blank's own, but it came through the webview
const MAX_PDF: usize = 16 << 20;
const MAX_STREAM: usize = 64 << 20;
const MAX_OBJECTS: usize = 20_000;
const MAX_DEPTH: usize = 64;
/// the largest side of a stamp, in points: PDF's own limit
const MAX_SIDE: f64 = 14_400.;

/// a stamp copied into the update
#[derive(Debug, Clone, Copy)]
pub struct Imported {
    pub id: ObjectId,
    /// the size of its BBox, in points
    pub width: f64,
    pub height: f64,
}

/// import_stamp copies page 1 of the PDF `pdf` into `incr` as a Form
/// XObject that shows as `[0 0 w h]` (its BBox is the page's box, moved
/// there by its /Matrix); `pdfa1` drops what PDF/A-1 forbids
/// (transparency groups, soft masks), since the PDF it goes into claims it
pub fn import_stamp(incr: &mut IncrementalDocument, pdf: &[u8], pdfa1: bool) -> Result<Imported> {
    if pdf.len() > MAX_PDF {
        bail!("the stamp's PDF is too large");
    }
    let options = LoadOptions {
        max_decompressed_size: Some(MAX_STREAM),
        ..Default::default()
    };
    let doc = Document::load_mem_with_options(pdf, options).context("can't read a stamp's PDF")?;
    if doc.trailer.get(b"Encrypt").is_ok() || doc.is_encrypted() {
        bail!("a stamp's PDF is encrypted");
    }
    let page = page_id(&doc, 1)?;
    let media = inherited(&doc, page, b"CropBox")
        .or_else(|| inherited(&doc, page, b"MediaBox"))
        .context("a stamp's page has no size")?;
    let Some([x0, y0, x1, y1]) = numbers(media, &doc).and_then(|n| <[f64; 4]>::try_from(n).ok())
    else {
        bail!("a stamp's page box isn't four numbers");
    };
    let (x0, y0, x1, y1) = (x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1));
    let (width, height) = (x1 - x0, y1 - y0);
    if !(width > 0. && height > 0. && width <= MAX_SIDE && height <= MAX_SIDE) {
        bail!("a stamp's page has no room in it");
    }

    let resources = inherited(&doc, page, b"Resources")
        .and_then(|r| r.as_dict().ok())
        .cloned()
        .unwrap_or_default();
    let content = doc
        .get_page_content_with_limit(page, MAX_STREAM)
        .context("can't read a stamp's content")?;
    let content = unmark(&doc, &content, &resources)?;

    let mut copier = Copier {
        source: &doc,
        pdfa1,
        map: HashMap::new(),
        queue: vec![],
    };
    let resources = copier.copy_dict(incr, &resources, 0)?;
    // the content is drawn where the page has it: the BBox is the page's
    // box, and the matrix moves it to the origin
    let mut form = dictionary! {
        "Type" => "XObject", "Subtype" => "Form",
        "BBox" => reals(&[x0, y0, x1, y1]),
        "Resources" => resources,
    };
    if x0 != 0. || y0 != 0. {
        form.set("Matrix", reals(&[1., 0., 0., 1., -x0, -y0]));
    }
    if !pdfa1 {
        if let Some(group) = doc
            .get_dictionary(page)
            .ok()
            .and_then(|p| p.get(b"Group").ok())
            .and_then(|g| resolve(&doc, g))
            .and_then(|g| g.as_dict().ok())
            .cloned()
        {
            let group = copier.copy_dict(incr, &group, 0)?;
            form.set("Group", group);
        }
    }
    copier.drain(incr)?;
    let mut stream = Stream::new(form, content);
    // a stream that doesn't get smaller stays as it is
    let _ = stream.compress();
    let id = incr.new_document.add_object(stream);
    Ok(Imported { id, width, height })
}

/// unmark turns every marked-content sequence with an /MCID (`/P <</MCID
/// 0>> BDC`, or a named property list that has one) into `/Artifact BMC`:
/// the stamp's structure elements aren't copied, so nothing may point
/// into them
fn unmark(doc: &Document, content: &[u8], resources: &Dictionary) -> Result<Vec<u8>> {
    // no marked content with properties: an /MCID may also hide in a named
    // property list, which the content names but doesn't spell out
    if !content.windows(3).any(|w| w == b"BDC") {
        return Ok(content.to_vec());
    }
    let properties = resources
        .get(b"Properties")
        .ok()
        .and_then(|p| resolve(doc, p))
        .and_then(|p| p.as_dict().ok());
    let has_mcid = |operand: Option<&Object>| -> bool {
        let dict = match operand {
            Some(Object::Dictionary(d)) => Some(d),
            Some(Object::Name(name)) => properties
                .and_then(|p| p.get(name).ok())
                .and_then(|p| resolve(doc, p))
                .and_then(|p| p.as_dict().ok()),
            Some(Object::Reference(_)) => operand
                .and_then(|o| resolve(doc, o))
                .and_then(|o| o.as_dict().ok()),
            _ => None,
        };
        dict.is_some_and(|d| d.has(b"MCID"))
    };
    let mut decoded = Content::decode(content).context("can't read a stamp's content")?;
    for operation in &mut decoded.operations {
        if operation.operator == "BDC" && has_mcid(operation.operands.get(1)) {
            *operation = Operation::new("BMC", vec![Object::Name(b"Artifact".to_vec())]);
        }
    }
    Ok(decoded.encode()?)
}

/// copies objects of the stamp's PDF into the update, each once, with new
/// ids; references are followed through a queue, so cycles end
struct Copier<'a> {
    source: &'a Document,
    pdfa1: bool,
    /// the stamp's ids to the update's
    map: HashMap<ObjectId, ObjectId>,
    /// objects given an id in the update, to be copied
    queue: Vec<(ObjectId, ObjectId)>,
}

impl Copier<'_> {
    /// id_for is the update's id of the stamp's object `old`, queued to be
    /// copied the first time; what would make the stamp part of the stamp
    /// PDF's own page tree becomes null
    fn id_for(&mut self, incr: &mut IncrementalDocument, old: ObjectId) -> Result<Object> {
        if let Some(new) = self.map.get(&old) {
            return Ok(Object::Reference(*new));
        }
        let Ok(object) = self.source.get_object(old) else {
            return Ok(Object::Null);
        };
        let kind = match object {
            Object::Dictionary(d) => d.get(b"Type").and_then(Object::as_name).ok(),
            _ => None,
        };
        if matches!(
            kind,
            Some(b"Page" | b"Pages" | b"Catalog" | b"StructTreeRoot" | b"StructElem")
        ) {
            return Ok(Object::Null);
        }
        if self.map.len() >= MAX_OBJECTS {
            bail!("a stamp's PDF has too many objects");
        }
        let new = incr.new_document.new_object_id();
        self.map.insert(old, new);
        self.queue.push((old, new));
        Ok(Object::Reference(new))
    }

    fn copy(&mut self, incr: &mut IncrementalDocument, o: &Object, depth: usize) -> Result<Object> {
        if depth > MAX_DEPTH {
            bail!("a stamp's PDF nests too deep");
        }
        Ok(match o {
            Object::Reference(id) => self.id_for(incr, *id)?,
            Object::Array(items) => Object::Array(
                items
                    .iter()
                    .map(|item| self.copy(incr, item, depth + 1))
                    .collect::<Result<_>>()?,
            ),
            Object::Dictionary(d) => Object::Dictionary(self.copy_dict(incr, d, depth + 1)?),
            Object::Stream(s) => Object::Stream(self.copy_stream(incr, s, depth + 1)?),
            other => other.clone(),
        })
    }

    fn copy_dict(
        &mut self,
        incr: &mut IncrementalDocument,
        d: &Dictionary,
        depth: usize,
    ) -> Result<Dictionary> {
        let mut out = Dictionary::new();
        for (key, value) in d.iter() {
            // the stamp's structure tree isn't copied
            if key == b"StructParent" || key == b"StructParents" {
                continue;
            }
            out.set(key.clone(), self.copy(incr, value, depth + 1)?);
        }
        if self.pdfa1 {
            pdfa1_dict(&mut out);
        }
        Ok(out)
    }

    fn copy_stream(
        &mut self,
        incr: &mut IncrementalDocument,
        s: &Stream,
        depth: usize,
    ) -> Result<Stream> {
        let subtype = s.dict.get(b"Subtype").and_then(Object::as_name).ok();
        let mut stream = s.clone();
        if subtype == Some(b"Form") {
            // a form inside the stamp: its marked content too
            let resources = s
                .dict
                .get(b"Resources")
                .ok()
                .and_then(|r| resolve(self.source, r))
                .and_then(|r| r.as_dict().ok())
                .cloned()
                .unwrap_or_default();
            let plain = s
                .get_plain_content_with_limit(MAX_STREAM)
                .context("can't read a form of a stamp")?;
            let unmarked = unmark(self.source, &plain, &resources)?;
            if unmarked != plain {
                stream.set_plain_content(unmarked);
                let _ = stream.compress();
            }
            if self.pdfa1 {
                stream.dict.remove(b"Group");
            }
        }
        if self.pdfa1 && subtype == Some(b"Image") && s.dict.has(b"SMask") {
            flatten_over_white(self.source, &mut stream);
        }
        stream.dict = self.copy_dict(incr, &stream.dict, depth + 1)?;
        Ok(stream)
    }

    /// drain copies every queued object
    fn drain(&mut self, incr: &mut IncrementalDocument) -> Result<()> {
        while let Some((old, new)) = self.queue.pop() {
            let object = self.source.get_object(old)?.clone();
            let copied = self.copy(incr, &object, 0)?;
            incr.new_document.objects.insert(new, copied);
        }
        Ok(())
    }
}

/// pdfa1_dict takes the transparency out of a graphics state for PDF/A-1:
/// no soft mask, full opacity, the normal blend mode
fn pdfa1_dict(d: &mut Dictionary) {
    if d.get(b"Type").and_then(Object::as_name).ok() == Some(b"ExtGState")
        || d.has(b"ca")
        || d.has(b"CA")
    {
        if d.has(b"SMask") {
            d.set("SMask", Object::Name(b"None".to_vec()));
        }
        for key in [&b"ca"[..], b"CA"] {
            if d.has(key) {
                d.set(key.to_vec(), Object::Real(1.0));
            }
        }
        if d.has(b"BM") {
            d.set("BM", Object::Name(b"Normal".to_vec()));
        }
    }
}

/// flatten_over_white draws an image with a soft mask over white and drops
/// the mask, for PDF/A-1, which has no transparency: 8-bit samples of one
/// or three components, as krilla writes them. An image Blank can't
/// decode keeps its colour and loses the mask.
fn flatten_over_white(source: &Document, image: &mut Stream) {
    let flattened = (|| -> Option<Vec<u8>> {
        let mask = resolve(source, image.dict.get(b"SMask").ok()?)?
            .as_stream()
            .ok()?;
        let dim = |d: &Dictionary, key: &[u8]| d.get(key).ok()?.as_i64().ok();
        let (w, h) = (dim(&image.dict, b"Width")?, dim(&image.dict, b"Height")?);
        if dim(&mask.dict, b"Width")? != w
            || dim(&mask.dict, b"Height")? != h
            || dim(&image.dict, b"BitsPerComponent")? != 8
            || dim(&mask.dict, b"BitsPerComponent")? != 8
        {
            return None;
        }
        let pixels = usize::try_from(w)
            .ok()?
            .checked_mul(usize::try_from(h).ok()?)?;
        let colour = image.get_plain_content_with_limit(MAX_STREAM).ok()?;
        let alpha = mask.get_plain_content_with_limit(MAX_STREAM).ok()?;
        if pixels == 0 || alpha.len() < pixels || colour.len() % pixels != 0 {
            return None;
        }
        let components = colour.len() / pixels;
        if components != 1 && components != 3 {
            return None;
        }
        let mut out = colour;
        for (i, sample) in out.iter_mut().enumerate() {
            let a = u32::from(alpha[i / components]);
            *sample = ((u32::from(*sample) * a + 255 * (255 - a) + 127) / 255) as u8;
        }
        Some(out)
    })();
    image.dict.remove(b"SMask");
    if let Some(samples) = flattened {
        image.set_plain_content(samples);
        let _ = image.compress();
    }
}
