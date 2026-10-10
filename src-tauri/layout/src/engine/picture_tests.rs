//! Pictures that take a share of the width and have a caption: diagrams,
//! and images given a width.

use super::test_support::*;
use super::{Hit, Op};
use crate::model::{Content, Item};

fn picture(pos: u32, size: (f32, f32), share: Option<f32>, caption: Option<&str>) -> Item {
    Item {
        content: Content::Image {
            pos,
            src: "diagram.svg".into(),
            width: size.0,
            height: size.1,
            alt: "Flowchart".into(),
            align: None,
            share,
            caption: caption.map(String::from),
        },
        ..paragraph(pos, "")
    }
}

/// where the page shows the picture: x, y, width, height
fn drawn(items: Vec<Item>) -> (f32, f32, f32, f32) {
    engine(items)
        .page_ops(0, false)
        .into_iter()
        .find_map(|op| match op {
            Op::Image { x, y, w, h, .. } => Some((x, y, w, h)),
            _ => None,
        })
        .unwrap()
}

#[test]
fn takes_its_share_of_the_width() {
    let width = engine(vec![]).settings.content_width();
    let (_, _, w, h) = drawn(vec![picture(0, (200.0, 100.0), Some(0.5), None)]);
    assert!((w - width / 2.0).abs() < 0.01, "{w}");
    assert!((h - w / 2.0).abs() < 0.01, "{h}");
}

#[test]
fn a_share_may_enlarge_it_and_none_never_does() {
    let width = engine(vec![]).settings.content_width();
    let (_, _, w, _) = drawn(vec![picture(0, (50.0, 20.0), Some(1.0), None)]);
    assert!((w - width).abs() < 0.01, "{w}");
    let (_, _, w, _) = drawn(vec![picture(0, (50.0, 20.0), None, None)]);
    assert_eq!(w, 50.0);
}

#[test]
fn a_tall_picture_and_its_caption_fit_one_page() {
    let engine = engine(vec![picture(
        0,
        (100.0, 5000.0),
        Some(1.0),
        Some("A tall one"),
    )]);
    assert_eq!(engine.pages.len(), 1);
    let bottom = engine.settings.content_bottom();
    let laid = &engine.laid[0];
    assert!(laid.height() <= bottom - engine.settings.content_top() + 0.01);
}

#[test]
fn writes_its_caption_below_it_and_keeps_them_together() {
    let mut items: Vec<Item> = (0..40).map(|n| paragraph(n * 2, LONG)).collect();
    items.push(picture(200, (300.0, 200.0), None, Some("The plan")));
    let mut engine = engine(items);
    let picture = engine.laid.len() - 1;
    let laid = &engine.laid[picture];
    assert_eq!(laid.units.len(), 2);
    assert!(laid.units[0].keep_next);
    let (caption, _) = &laid.extras[0];
    assert!(caption.y >= 200.0, "{}", caption.y);
    // on the page the picture is on, below it
    let page = engine.pages.len() - 1;
    let ops = engine.page_ops(page, false);
    let image_bottom = ops
        .iter()
        .find_map(|op| match op {
            Op::Image { y, h, .. } => Some(y + h),
            _ => None,
        })
        .expect("the picture is on the last page");
    let caption_top = ops
        .iter()
        .filter_map(|op| match op {
            Op::Glyphs { run, text, .. } if text.contains("The plan") => Some(run.baseline),
            _ => None,
        })
        .next()
        .expect("its caption is on its page");
    assert!(caption_top > image_bottom, "{caption_top} {image_bottom}");
}

#[test]
fn moves_over_a_captioned_picture_in_two_steps() {
    let engine = engine(vec![
        paragraph(0, "above"),
        picture(7, (300.0, 100.0), None, Some("The plan")),
        paragraph(8, "below"),
    ]);
    let goal = engine.settings.margins.left + 10.0;
    // down from the text above: the picture, then the text below
    let (hit, _) = engine.vertical(2, false, true, goal).unwrap();
    assert_eq!(hit, Hit::Node(7));
    let (hit, _) = engine.vertical(7, false, true, goal).unwrap();
    assert!(matches!(hit, Hit::Text(pos) if pos >= 9), "{hit:?}");
    // and up again, never stopping at the caption
    let (hit, _) = engine.vertical(9, false, false, goal).unwrap();
    assert_eq!(hit, Hit::Node(7));
}

#[test]
fn draws_a_drawing_in_place_of_its_picture_scaled_into_its_box_with_its_paints() {
    use crate::drawing::{Drawing, Paint};
    let mut engine = engine(vec![picture(0, (200.0, 100.0), Some(0.5), None)]);
    // twice the size of its box: drawn at half
    let drawing = Drawing::read(
        r#"{"width":400,"height":200,"ops":[
            {"op":"path","d":"M0 0L400 0","stroke":2,"paint":{"alpha":0.5},"dash":[4,2],"cap":"round"},
            {"op":"glyphs","font":0,"size":20,"glyphs":[[73,10,40],[74,30,40]],"chars":true,"text":"IJ","paint":{"color":[200,30,30]}}
        ]}"#,
    )
    .unwrap();
    engine.drawings.insert("diagram.svg".into(), drawing);
    let ops = engine.page_ops(0, false);
    assert!(!ops.iter().any(|op| matches!(op, Op::Image { .. })));
    let (x, y, scale, stroke, paint) = ops
        .iter()
        .find_map(|op| match op {
            Op::Path {
                x,
                y,
                scale,
                stroke,
                paint,
                style,
                ..
            } => {
                // its dashes in its own units, scaled when drawn
                assert_eq!(style.dash.as_deref(), Some(&[4.0, 2.0][..]));
                assert_eq!(style.cap, crate::drawing::Cap::Round);
                Some((*x, *y, *scale, *stroke, *paint))
            }
            _ => None,
        })
        .unwrap();
    let width = engine.settings.content_width() / 2.0;
    assert!((scale - width / 400.0).abs() < 1e-4, "{scale}");
    assert_eq!(stroke, Some(2.0 * scale));
    assert_eq!(
        paint,
        Paint {
            alpha: 0.5,
            color: None
        }
    );
    let (run, text, paint) = ops
        .iter()
        .find_map(|op| match op {
            Op::Glyphs {
                run,
                text,
                paint: Some(paint),
                ..
            } => Some((run, text, *paint)),
            _ => None,
        })
        .unwrap();
    assert_eq!(&**text, "IJ");
    assert_eq!(paint.color, Some([200, 30, 30]));
    assert!((run.size - 20.0 * scale).abs() < 1e-4);
    assert!((run.baseline - (y + 40.0 * scale)).abs() < 1e-3);
    assert!((run.glyphs[0].x - (x + 10.0 * scale)).abs() < 1e-3);
    assert!((run.glyphs[0].advance - 20.0 * scale).abs() < 1e-3);
    assert_ne!(run.glyphs[0].id, 0, "I mapped through the charmap");
}
