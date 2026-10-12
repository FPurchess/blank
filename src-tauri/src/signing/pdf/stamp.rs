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

/// repeat_into is where a repeated stamp, placed at `rect` on a page of
/// `from` points (as shown), goes on a page of `to`: made smaller, its
/// proportions kept, if it doesn't fit; as far from the nearer of the
/// left and right edges, and of the top and bottom edges, as it was on
/// its own page (a stamp whose middle is left of its page's middle keeps
/// its distance to the left edge, else to the right one; the same up and
/// down, a tie going left and up); and never off the page
pub fn repeat_into(rect: [f64; 4], from: (f64, f64), to: (f64, f64)) -> [f64; 4] {
    let [x, y, w, h] = rect;
    let scale = (to.0 / w).min(to.1 / h).min(1.);
    let (fitted_w, fitted_h) = (w * scale, h * scale);
    // along one axis: the stamp's start and size on its page of `page`,
    // into one of `into` at the size `fitted`
    let along = |start: f64, size: f64, page: f64, into: f64, fitted: f64| {
        let far = page - start - size;
        let at = if start <= far {
            start
        } else {
            into - far - fitted
        };
        at.min(into - fitted).max(0.)
    };
    [
        along(x, w, from.0, to.0, fitted_w),
        along(y, h, from.1, to.1, fitted_h),
        fitted_w,
        fitted_h,
    ]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeats_a_stamp_as_far_from_the_nearer_edges() {
        let a4 = (595., 842.);
        let a5 = (420., 595.);
        // initials 36 pt from the bottom right of A4
        let corner = [595. - 36. - 56., 842. - 36. - 28., 56., 28.];
        assert_eq!(repeat_into(corner, a4, a4), corner, "its own page");
        assert_eq!(
            repeat_into(corner, a4, a5),
            [420. - 36. - 56., 595. - 36. - 28., 56., 28.]
        );
        // from the top left: the same place
        let top_left = [40., 50., 56., 28.];
        assert_eq!(repeat_into(top_left, a4, a5), top_left);
        // onto a larger page: still 36 pt from the bottom right
        assert_eq!(
            repeat_into([420. - 36. - 56., 595. - 36. - 28., 56., 28.], a5, a4),
            corner
        );
        // too large for the page: smaller, on it
        let wide = repeat_into([0., 700., 500., 100.], a4, (250., 400.));
        assert_eq!(wide, [0., 400. - 42. - 50., 250., 50.]);
        assert!(wide[1] >= 0. && wide[1] + wide[3] <= 400.);
    }
}
