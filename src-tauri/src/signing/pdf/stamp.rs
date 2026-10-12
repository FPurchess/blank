//! stamps in a page's content: Form XObjects (see xobject.rs) drawn after
//! the page's own content, which is wrapped in `q … Q`, so nothing it
//! leaves set moves them; and the appearance of a widget that shows a
//! stamp

use anyhow::{bail, Context, Result};
use lopdf::{dictionary, Dictionary, IncrementalDocument, Object, ObjectId, Stream};

use super::xobject::Imported;
use super::{current, inherited, reals, resolve, PageGeometry};

/// a stamp to draw on a page
#[derive(Debug, Clone, Copy)]
pub struct Draw {
    pub form: Imported,
    /// x, y, w, h in points from the top left of the page as shown
    pub rect: [f64; 4],
}

/// clamp moves `rect` into a page of `size` (as shown), made smaller,
/// keeping its proportions, if it doesn't fit
pub fn clamp(rect: [f64; 4], size: (f64, f64)) -> [f64; 4] {
    let [mut x, mut y, mut w, mut h] = rect;
    let scale = (size.0 / w).min(size.1 / h).min(1.);
    w *= scale;
    h *= scale;
    x = x.min(size.0 - w).max(0.);
    y = y.min(size.1 - h).max(0.);
    [x, y, w, h]
}

/// matrix draws `form` into the display rectangle `rect` of a page of
/// `geo`, stretched to it
fn matrix(geo: &PageGeometry, form: &Imported, rect: [f64; 4]) -> [f64; 6] {
    let [a, b, c, d, e, f] = geo.placement(geo.rect_to_user(rect));
    let (sx, sy) = (rect[2] / form.width, rect[3] / form.height);
    // first scaled to the rectangle, then placed
    [sx * a, sx * b, sy * c, sy * d, e, f]
}

/// operator writes the numbers of a matrix and `cm`
fn cm(m: &[f64; 6]) -> String {
    let n: Vec<String> = m.iter().map(|v| format!("{v:.4}")).collect();
    format!("{} cm", n.join(" "))
}

/// free_name is the first of BlankStamp0, BlankStamp1, … that `xobjects`
/// doesn't hold
fn free_name(xobjects: &Dictionary) -> String {
    (0..)
        .map(|n| format!("BlankStamp{n}"))
        .find(|name| !xobjects.has(name.as_bytes()))
        .unwrap_or_default()
}

/// draw_on_page draws `draws` on the page `page`, over its content. The
/// page gets a direct /Resources, a copy of what it has or inherits with
/// the stamps added: a resources object other pages share is never edited.
pub fn draw_on_page(incr: &mut IncrementalDocument, page: ObjectId, draws: &[Draw]) -> Result<()> {
    if draws.is_empty() {
        return Ok(());
    }
    let prev = incr.get_prev_documents();
    let geo = PageGeometry::of(prev, page)?;
    let page_dict = current(incr, page)?
        .as_dict()
        .context("a page isn't a dictionary")?;
    let mut resources = match page_dict.get(b"Resources") {
        Ok(r) => resolve(prev, r).and_then(|r| r.as_dict().ok()).cloned(),
        Err(_) => inherited(prev, page, b"Resources")
            .and_then(|r| r.as_dict().ok())
            .cloned(),
    }
    .unwrap_or_default();
    let mut xobjects = resources
        .get(b"XObject")
        .ok()
        .and_then(|x| resolve(prev, x))
        .and_then(|x| x.as_dict().ok())
        .cloned()
        .unwrap_or_default();
    let mut ops = String::from("\nQ\n");
    for draw in draws {
        let name = free_name(&xobjects);
        xobjects.set(name.as_bytes(), draw.form.id);
        ops.push_str(&format!(
            "q {} /{name} Do Q\n",
            cm(&matrix(&geo, &draw.form, draw.rect))
        ));
    }
    resources.set("XObject", xobjects);

    // the content: [q, the old streams…, Q and the stamps]
    let mut contents: Vec<Object> = match page_dict.get(b"Contents") {
        Ok(Object::Array(a)) => a.clone(),
        Ok(Object::Reference(r)) => match current(incr, *r)? {
            // an indirect array of streams
            Object::Array(a) => a.clone(),
            _ => vec![Object::Reference(*r)],
        },
        Ok(_) => bail!("a page's /Contents isn't a stream or an array"),
        Err(_) => vec![],
    };
    let open = incr
        .new_document
        .add_object(Stream::new(Dictionary::new(), b"q\n".to_vec()));
    let close = incr
        .new_document
        .add_object(Stream::new(Dictionary::new(), ops.into_bytes()));
    contents.insert(0, Object::Reference(open));
    contents.push(Object::Reference(close));

    incr.opt_clone_object_to_new_document(page)?;
    let p = incr.new_document.get_dictionary_mut(page)?;
    p.set("Contents", Object::Array(contents));
    p.set("Resources", resources);
    Ok(())
}

/// appearance is a widget's appearance: a form of `w` × `h` points
/// (upright, turned with the page by its /Matrix) that shows `stamp`
/// fitted into it and centred, or nothing: Blank draws no frame around a
/// signature
pub fn appearance(
    incr: &mut IncrementalDocument,
    geo: &PageGeometry,
    w: f64,
    h: f64,
    stamp: Option<Imported>,
) -> ObjectId {
    let mut dict = dictionary! {
        "Type" => "XObject", "Subtype" => "Form", "BBox" => reals(&[0., 0., w, h]),
        "Matrix" => reals(&geo.appearance_matrix()),
    };
    let mut content = vec![];
    if let Some(stamp) = stamp.filter(|_| w > 0. && h > 0.) {
        let s = (w / stamp.width).min(h / stamp.height);
        let (dx, dy) = ((w - stamp.width * s) / 2., (h - stamp.height * s) / 2.);
        content = format!("q {} /BlankStamp Do Q\n", cm(&[s, 0., 0., s, dx, dy])).into_bytes();
        dict.set(
            "Resources",
            dictionary! { "XObject" => dictionary! { "BlankStamp" => stamp.id } },
        );
    }
    incr.new_document.add_object(Stream::new(dict, content))
}
