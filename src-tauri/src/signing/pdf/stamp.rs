//! stamps in a page's content: Form XObjects (see xobject.rs) drawn after
//! the page's own content, which is wrapped in `q … Q`, so nothing it
//! leaves set moves them; and the appearance of a widget that shows a
//! stamp

use anyhow::{bail, Context, Result};
use lopdf::{dictionary, Dictionary, IncrementalDocument, Object, ObjectId, Stream};

use super::xobject::Imported;
use super::{current, inherited, reals, resolve, PageGeometry, MAX_DECOMPRESSED};

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
    // the content: [q…, the old streams…, Q… and the stamps], with a q for
    // each Q the page has too many and a Q for each q it leaves open, so the
    // stamps are drawn in the page's own space whatever its content does
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
    let (closes, depth) = nesting(incr, &contents);
    // what is open after the page: Blank's q, and the page's own
    let open = (1 + closes as i64 + depth).max(1) as usize;
    let mut ops = format!("\n{}", "Q\n".repeat(open));
    for draw in draws {
        let name = free_name(&xobjects);
        xobjects.set(name.as_bytes(), draw.form.id);
        ops.push_str(&format!(
            "q {} /{name} Do Q\n",
            cm(&matrix(&geo, &draw.form, draw.rect))
        ));
    }
    resources.set("XObject", xobjects);

    let open = incr.new_document.add_object(Stream::new(
        Dictionary::new(),
        "q\n".repeat(1 + closes).into_bytes(),
    ));
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

/// nesting reads the page content `contents` and returns how many more Q
/// than q it has at its lowest, and how many more q than Q at its end
/// (fewer than none if its Qs win); (0, 0) for content that can't be read,
/// as most is balanced
fn nesting(incr: &IncrementalDocument, contents: &[Object]) -> (usize, i64) {
    let mut bytes = vec![];
    for part in contents {
        let Object::Reference(id) = part else {
            continue;
        };
        let Ok(Object::Stream(stream)) = current(incr, *id) else {
            return (0, 0);
        };
        let Ok(content) = stream.decompressed_content_with_limit(MAX_DECOMPRESSED) else {
            return (0, 0);
        };
        bytes.extend_from_slice(&content);
        // streams are one content, split between tokens
        bytes.push(b'\n');
    }
    let Ok(content) = lopdf::content::Content::decode(&bytes) else {
        return (0, 0);
    };
    let (mut depth, mut lowest) = (0i64, 0i64);
    for operation in &content.operations {
        match operation.operator.as_str() {
            "q" => depth += 1,
            "Q" => {
                depth -= 1;
                lowest = lowest.min(depth);
            }
            _ => {}
        }
    }
    ((-lowest) as usize, depth)
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

    /// stamped draws a stamp on the one page of a PDF whose content is
    /// `content`, and returns the page's content after
    fn stamped(content: &[u8]) -> Vec<lopdf::content::Operation> {
        let mut doc = lopdf::Document::with_version("1.7");
        let pages = doc.new_object_id();
        let stream = doc.add_object(Stream::new(Dictionary::new(), content.to_vec()));
        let page = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages, "Contents" => stream,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
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
        let prev = lopdf::Document::load_mem(&bytes).unwrap();
        let mut incr = IncrementalDocument::create_from(bytes, prev);
        let form = incr.new_document.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => reals(&[0., 0., 10., 10.]) },
            vec![],
        ));
        let draw = Draw {
            form: Imported {
                id: form,
                width: 10.,
                height: 10.,
            },
            rect: [100., 100., 10., 10.],
        };
        draw_on_page(&mut incr, page, &[draw]).unwrap();
        let Object::Array(parts) = incr
            .new_document
            .get_dictionary(page)
            .unwrap()
            .get(b"Contents")
            .unwrap()
        else {
            panic!("no contents");
        };
        let mut all = vec![];
        for part in parts {
            let id = part.as_reference().unwrap();
            let stream = current(&incr, id).unwrap().as_stream().unwrap();
            all.extend_from_slice(&stream.content);
            all.push(b'\n');
        }
        lopdf::content::Content::decode(&all).unwrap().operations
    }

    #[test]
    fn draws_stamps_in_the_pages_own_space_however_its_content_nests() {
        // balanced, a q left open with a scale, a Q too many
        for content in [
            &b"q 2 0 0 2 0 0 cm Q"[..],
            b"q 2 0 0 2 0 0 cm",
            b"Q 2 0 0 2 0 0 cm",
        ] {
            let mut depth = 0;
            let mut at_stamp = None;
            for operation in stamped(content) {
                match operation.operator.as_str() {
                    "q" => depth += 1,
                    "Q" => depth -= 1,
                    "Do" => at_stamp = Some(depth),
                    _ => {}
                }
                assert!(depth >= 0, "a Q pops what isn't there");
            }
            // inside its own q alone, and nothing left open
            assert_eq!(at_stamp, Some(1));
            assert_eq!(depth, 0);
        }
    }

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
