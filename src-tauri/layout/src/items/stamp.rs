//! A stamp placed on a PDF's page: an image (the user's signature or
//! initials) contained in the stamp's box, and the lines under it, e.g. a
//! date or a place. A stamp engine's page is the stamp's box, so the item
//! fills it: the image as large as the room the lines leave, centred
//! however the lines are aligned (at the left or centred).

use parley::Alignment;

use super::{picture_scale, Deco, Laid, Role, Unit};
use crate::fonts::Fonts;
use crate::model::{Text, TextKind};
use crate::style::BODY;
use crate::text::TextBox;

/// what a stamp shows, see `Content::Stamp`
pub struct StampSpec<'a> {
    pub src: &'a str,
    pub width: f32,
    pub height: f32,
    pub alt: &'a str,
    pub lines: &'a [String],
    pub size: f32,
    pub center: bool,
}

/// lays out a stamp in a box of `width` × `height` points; its lines are
/// extras, as they aren't text of the document. `Laid::extent` is where
/// what it shows starts and how wide it is, which is the stamp's own
/// width, e.g. its widest line.
pub fn stamp_units(fonts: &mut Fonts, spec: StampSpec, width: f32, height: f32) -> Laid {
    let width = width.max(0.0);
    let height = height.max(0.0);
    let size = if spec.size > 0.0 { spec.size } else { BODY };
    let alignment = if spec.center {
        Alignment::Center
    } else {
        Alignment::Start
    };
    let mut extras = vec![];
    let mut lines_height = 0.0;
    for line in spec.lines {
        let text = Text {
            pos: 0,
            text: line.clone(),
            style: TextKind::P,
            size: Some(size),
            ..Default::default()
        };
        let boxed = TextBox::new(fonts, &text, width, alignment);
        lines_height += boxed.height();
        extras.push((boxed, Role::Text));
    }
    let mut decos = vec![];
    let mut image_height = 0.0;
    // the edges of what it shows, from the left of the box
    let (mut left, mut right) = (f32::INFINITY, f32::NEG_INFINITY);
    let room = (height - lines_height).max(0.0);
    if !spec.src.is_empty() && spec.width > 0.0 && spec.height > 0.0 && room > 0.0 {
        // as large as the room allows, its shape kept, in the middle
        let scale = picture_scale((spec.width, spec.height), width, room, Some(1.0));
        let (w, h) = (spec.width * scale, spec.height * scale);
        let x = (width - w) / 2.0;
        // in the middle of the room the lines leave
        let y = (room - h) / 2.0;
        decos.push(Deco::Image {
            src: spec.src.to_string(),
            alt: spec.alt.to_string(),
            x,
            y,
            w,
            h,
        });
        left = left.min(x);
        right = right.max(x + w);
        // the image's room is the stamp's, but for the lines
        image_height = room;
    }
    let mut top = image_height;
    for (boxed, _) in &mut extras {
        boxed.y = top;
        top += boxed.height();
        let shown = boxed.layout.width();
        let x = if spec.center {
            (width - shown) / 2.0
        } else {
            0.0
        };
        left = left.min(x);
        right = right.max(x + shown);
    }
    let extent = if left <= right {
        (left, right - left)
    } else {
        (0.0, 0.0)
    };
    Laid {
        units: vec![Unit {
            height: top,
            decos,
            extras: 0..extras.len(),
            ..Default::default()
        }],
        extras,
        extent: Some(extent),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::repository_fonts;

    fn laid(src: &str, lines: &[String], center: bool, width: f32, height: f32) -> Laid {
        let mut fonts = repository_fonts();
        stamp_units(
            &mut fonts,
            StampSpec {
                src,
                width: 300.0,
                height: 100.0,
                alt: "Signature",
                lines,
                size: 12.0,
                center,
            },
            width,
            height,
        )
    }

    fn image(laid: &Laid) -> (f32, f32, f32, f32) {
        laid.units[0]
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Image { x, y, w, h, .. } => Some((*x, *y, *w, *h)),
                _ => None,
            })
            .unwrap()
    }

    #[test]
    fn contains_the_image_in_the_box_centred() {
        // a wide box: as high as it, in the middle
        let wide = laid("signature.png", &[], false, 600.0, 100.0);
        let (x, y, w, h) = image(&wide);
        assert_eq!((y, w, h), (0.0, 300.0, 100.0));
        assert!((x - 150.0).abs() < 0.01);
        assert_eq!(wide.extent, Some((150.0, 300.0)));
        assert!((wide.units[0].height - 100.0).abs() < 0.01);
        // a tall box: as wide as it, its shape kept
        let tall = laid("signature.png", &[], false, 60.0, 200.0);
        let (x, y, w, h) = image(&tall);
        assert_eq!((x, w), (0.0, 60.0));
        assert!((h - 20.0).abs() < 0.01);
        assert!((y - 90.0).abs() < 0.01);
        assert!((tall.units[0].height - 200.0).abs() < 0.01);
    }

    #[test]
    fn sets_the_lines_in_the_body_font_at_its_size() {
        let lines = ["12 October 2026".to_string(), "Berlin".to_string()];
        let laid = laid("", &lines, false, 600.0, 200.0);
        assert!(laid.units[0].decos.is_empty());
        assert_eq!(laid.extras.len(), 2);
        let (first, second) = (&laid.extras[0].0, &laid.extras[1].0);
        // a line each, one under the other, as high as 12 pt body text
        assert_eq!(first.line_count(), 1);
        let line = 12.0 * crate::style::NATURAL * 1.12;
        assert!((first.height() - line).abs() < 0.01);
        assert!((second.y - first.height()).abs() < 0.01);
        assert!((laid.units[0].height - 2.0 * line).abs() < 0.01);
        // as wide as the wider line, from the left
        let (left, width) = laid.extent.unwrap();
        assert_eq!(left, 0.0);
        let widest = first.layout.width().max(second.layout.width());
        assert!((width - widest).abs() < 0.01);
        assert!(width < 200.0);
    }

    #[test]
    fn centres_the_lines() {
        let lines = ["Berlin".to_string()];
        let laid = laid("", &lines, true, 600.0, 200.0);
        let (left, width) = laid.extent.unwrap();
        assert!((left - (600.0 - width) / 2.0).abs() < 0.01);
    }

    #[test]
    fn leaves_the_lines_their_room_under_the_image() {
        let lines = ["Ada Lovelace".to_string()];
        let laid = laid("signature.png", &lines, true, 300.0, 100.0);
        let (_, y, _, h) = image(&laid);
        let text = &laid.extras[0].0;
        assert!(y + h <= text.y + 0.01);
        assert!((text.y + text.height() - 100.0).abs() < 0.01);
        assert!((laid.units[0].height - 100.0).abs() < 0.01);
    }

    #[test]
    fn centres_the_image_over_lines_at_the_left() {
        let lines = ["Ada Lovelace".to_string()];
        let laid = laid("signature.png", &lines, false, 300.0, 100.0);
        let (x, _, w, _) = image(&laid);
        assert!((x - (300.0 - w) / 2.0).abs() < 0.01);
        assert_eq!(laid.extras[0].0.x, 0.0, "the lines at the left");
    }

    #[test]
    fn lays_out_in_no_room_instead_of_panicking() {
        for (width, height) in [(f32::NAN, 10.0), (-5.0, -5.0), (0.0, 0.0)] {
            let laid = laid("signature.png", &["a".into()], true, width, height);
            assert_eq!(laid.units.len(), 1);
        }
    }
}
