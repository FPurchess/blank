//! A signature block: room for a signature, a line to sign on, and the
//! lines under it, e.g. who signs and where and when. Unsigned, the room
//! holds what it says on the screen only ("Signature"), so a printout has an
//! empty line to sign by hand; signed, it holds the signature's image,
//! standing on the line.

use parley::Alignment;

use super::{picture_scale, Deco, Laid, Role, Unit};
use crate::fonts::Fonts;
use crate::model::{Text, TextKind};
use crate::style::RULE;
use crate::text::TextBox;

/// the room for the signature above the line, in points: about three lines
/// of text, as a pen needs
pub const SIGNATURE_ROOM: f32 = 42.0;
/// how much of the width of the text a block takes when it doesn't say
pub const SIGNATURE_SHARE: f32 = 0.5;
/// the space between the line and the first line under it
const LINE_GAP: f32 = 3.0;
/// the space between the signature's image and the line it stands on
const IMAGE_GAP: f32 = 1.0;

/// what a signature block shows, see `Content::Signature`
pub struct SignatureSpec<'a> {
    pub src: &'a str,
    pub width: f32,
    pub height: f32,
    pub alt: &'a str,
    pub lines: &'a [String],
    pub hint: &'a str,
    pub share: Option<f32>,
}

/// lays out a signature block at `indent`, in `inner` points of width; its
/// lines are extras, text of the block but not of the document
pub fn signature_units(fonts: &mut Fonts, spec: SignatureSpec, indent: f32, inner: f32) -> Laid {
    let share = spec.share.unwrap_or(SIGNATURE_SHARE);
    // a width that isn't a number lays the block out as if it had none,
    // rather than panic in clamp
    let inner = inner.max(0.0);
    let width = (inner * share).clamp(20.0_f32.min(inner), inner);
    let mut decos = vec![];
    let mut label = None;
    if !spec.src.is_empty() && spec.width > 0.0 && spec.height > 0.0 {
        // as large as the room allows, standing on the line
        let scale = picture_scale(
            (spec.width, spec.height),
            width,
            SIGNATURE_ROOM - IMAGE_GAP,
            Some(1.0),
        );
        let (w, h) = (spec.width * scale, spec.height * scale);
        decos.push(Deco::Image {
            src: spec.src.to_string(),
            alt: spec.alt.to_string(),
            x: indent,
            y: SIGNATURE_ROOM - IMAGE_GAP - h,
            w,
            h,
        });
    } else if !spec.hint.is_empty() {
        let text = Text {
            pos: 0,
            text: spec.hint.to_string(),
            style: TextKind::Small,
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, width, Alignment::Start);
        boxed.x = indent;
        boxed.y = SIGNATURE_ROOM - IMAGE_GAP - boxed.height();
        label = Some(boxed);
    }
    decos.push(Deco::Rect {
        x: indent,
        y: SIGNATURE_ROOM,
        w: width,
        h: RULE,
        role: Role::Text,
    });
    let mut extras = vec![];
    let mut top = SIGNATURE_ROOM + RULE + LINE_GAP;
    for line in spec.lines {
        let text = Text {
            pos: 0,
            text: line.clone(),
            style: TextKind::Small,
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, width, Alignment::Start);
        boxed.x = indent;
        boxed.y = top;
        top += boxed.height();
        extras.push((boxed, Role::Text));
    }
    Laid {
        units: vec![Unit {
            height: top,
            decos,
            extras: 0..extras.len(),
            ..Default::default()
        }],
        extras,
        label,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::repository_fonts;

    fn laid(src: &str, lines: &[String], share: Option<f32>) -> Laid {
        let mut fonts = repository_fonts();
        signature_units(
            &mut fonts,
            SignatureSpec {
                src,
                width: 300.0,
                height: 100.0,
                alt: "Signature of Ada",
                lines,
                hint: "Signature",
                share,
            },
            10.0,
            400.0,
        )
    }

    #[test]
    fn leaves_room_and_a_line_to_sign_on_while_unsigned() {
        let laid = laid("", &["Ada Lovelace · Tenant".into()], None);
        let unit = &laid.units[0];
        // the hint, but no image
        assert!(laid.label.is_some());
        assert!(!unit
            .decos
            .iter()
            .any(|deco| matches!(deco, Deco::Image { .. })));
        let line = unit
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Rect { x, y, w, .. } => Some((*x, *y, *w)),
                _ => None,
            })
            .unwrap();
        assert_eq!(line, (10.0, SIGNATURE_ROOM, 400.0 * SIGNATURE_SHARE));
        assert_eq!(laid.extras.len(), 1);
        assert!(laid.extras[0].0.y > SIGNATURE_ROOM);
        assert!(unit.height > laid.extras[0].0.y);
    }

    #[test]
    fn stands_the_signature_on_the_line_within_the_room() {
        let laid = laid("data:image/png;base64,", &[], Some(1.0));
        let (y, w, h) = laid.units[0]
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Image { y, w, h, .. } => Some((*y, *w, *h)),
                _ => None,
            })
            .unwrap();
        assert!(laid.label.is_none());
        assert!(h <= SIGNATURE_ROOM);
        assert!((y + h + IMAGE_GAP - SIGNATURE_ROOM).abs() < 0.01);
        // its aspect kept
        assert!((w / h - 3.0).abs() < 0.01);
    }

    #[test]
    fn lays_out_without_a_width_instead_of_panicking() {
        let mut fonts = repository_fonts();
        for inner in [f32::NAN, -5.0] {
            let laid = signature_units(
                &mut fonts,
                SignatureSpec {
                    src: "",
                    width: 0.0,
                    height: 0.0,
                    alt: "",
                    lines: &[],
                    hint: "Signature",
                    share: None,
                },
                0.0,
                inner,
            );
            assert_eq!(laid.units.len(), 1);
        }
    }
}
