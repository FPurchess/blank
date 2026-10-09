//! Display math: a formula on lines of its own, centered unless aligned,
//! never split across pages, with its number at the right when it is
//! numbered. The number is set in after paginating (`Engine::set_math_numbers`),
//! so the formula leaves room for the widest one.

use parley::Alignment;

use super::{Deco, Laid};
use crate::fonts::Fonts;
use crate::math::{layout, MathError, MathLaid};
use crate::model::{Text, TextKind};
use crate::style::text_style;
use crate::text::{align_offset, TextBox};

/// the number widest in practice, "(999)": the room a numbered formula
/// leaves at the right
const WIDEST_NUMBER: &str = "(999)";

/// the space between a formula and its number, at least
const NUMBER_GAP: f32 = 12.0;

/// where a formula's number goes, in the item's coordinates: its right
/// edge and its baseline
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NumberPlace {
    pub right: f32,
    pub baseline: f32,
}

/// the sentence an error shows in a preview: what's wrong and where
pub fn error_sentence(error: &MathError) -> String {
    format!(
        "{} (line {}, column {})",
        error.message, error.line, error.column
    )
}

/// what a formula draws, laid out in `inner` from `indent`: the formula, or
/// its source as code while it can't be set (an error, or no math fonts
/// yet), or, for a preview, the error as a sentence
pub fn math_units(
    fonts: &mut Fonts,
    latex: &str,
    numbered: bool,
    align: Option<&str>,
    preview: bool,
    indent: f32,
    inner: f32,
) -> Laid {
    let size = text_style(TextKind::P).size;
    let laid = layout(fonts, latex, true, size);
    let math = match laid {
        MathLaid::Ok(math) => math,
        MathLaid::Err(error) if preview => {
            return label_units(fonts, &error_sentence(&error), TextKind::Alt, indent, inner)
        }
        MathLaid::Err(_) | MathLaid::NoFonts => {
            return label_units(fonts, latex, TextKind::Code, indent, inner)
        }
    };
    let number_room = if numbered {
        number_width(fonts) + NUMBER_GAP
    } else {
        0.0
    };
    // the formula in the whole width when its number fits beside it, as
    // amsmath sets it, else the number goes on a line of its own below
    let beside = math.width + 2.0 * number_room <= inner;
    // centered in the whole width, but aligned otherwise up to its number,
    // which would stand over its right edge
    let align = align.unwrap_or("center");
    let room = if numbered && beside && align != "center" {
        inner - number_room
    } else {
        inner
    };
    let x = indent + align_offset(Some(align), room, math.width);
    let mut height = math.height + math.depth;
    let mut number = None;
    if numbered {
        let line = text_style(TextKind::P).line;
        let baseline = if beside {
            math.height
        } else {
            height += line;
            height - line / 4.0
        };
        number = Some(NumberPlace {
            right: indent + inner,
            baseline,
        });
    }
    let y = math.height;
    let deco = Deco::Math {
        math,
        x,
        y,
        cell: None,
    };
    let mut laid = Laid::single(height, vec![deco]);
    laid.number = number;
    laid
}

/// a text in place of a formula: its source as code, or what's wrong
fn label_units(fonts: &mut Fonts, text: &str, style: TextKind, indent: f32, inner: f32) -> Laid {
    let text = Text {
        pos: 0,
        text: text.to_string(),
        style,
        ..Default::default()
    };
    let mut label = TextBox::new(fonts, &text, inner, Alignment::Start);
    label.x = indent;
    let mut laid = Laid::single(label.height(), vec![]);
    laid.label = Some(label);
    laid
}

/// how wide the widest number is, "(999)" in the body text, measured once
/// for the fonts there are
fn number_width(fonts: &mut Fonts) -> f32 {
    if let Some(width) = fonts.maths.number_width {
        return width;
    }
    let boxed = TextBox::new(
        fonts,
        &number_label(WIDEST_NUMBER),
        1000.0,
        Alignment::Start,
    );
    let width = boxed.layout.width();
    fonts.maths.number_width = Some(width);
    width
}

/// a formula's number as text: in the body text, in parentheses
pub fn number_label(label: &str) -> Text {
    Text {
        pos: 0,
        text: label.to_string(),
        style: TextKind::P,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::tests::math_fonts;
    use crate::math::MathBox;
    use std::sync::Arc;

    fn the_math(laid: &Laid) -> (Arc<MathBox>, f32, f32) {
        laid.units[0]
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Math { math, x, y, .. } => Some((math.clone(), *x, *y)),
                _ => None,
            })
            .expect("a formula")
    }

    #[test]
    fn centers_a_formula() {
        let mut fonts = math_fonts();
        let laid = math_units(&mut fonts, "x^2", false, None, false, 10.0, 300.0);
        let (math, x, y) = the_math(&laid);
        assert!((x - (10.0 + (300.0 - math.width) / 2.0)).abs() < 0.01);
        assert_eq!(y, math.height);
        assert_eq!(laid.units.len(), 1);
        assert_eq!(laid.units[0].height, math.height + math.depth);
        assert!(laid.number.is_none());
    }

    #[test]
    fn aligns_a_formula() {
        let mut fonts = math_fonts();
        let left = math_units(&mut fonts, "x", false, Some("left"), false, 0.0, 300.0);
        assert_eq!(the_math(&left).1, 0.0);
        let right = math_units(&mut fonts, "x", false, Some("right"), false, 0.0, 300.0);
        let (math, x, _) = the_math(&right);
        assert!((x + math.width - 300.0).abs() < 0.01);
    }

    #[test]
    fn numbers_a_formula_at_the_right() {
        let mut fonts = math_fonts();
        let laid = math_units(&mut fonts, "a = b", true, None, false, 20.0, 300.0);
        let (math, _, _) = the_math(&laid);
        let number = laid.number.expect("a place for the number");
        assert_eq!(number.right, 320.0);
        assert_eq!(number.baseline, math.height);
        assert_eq!(laid.units[0].height, math.height + math.depth);
    }

    #[test]
    fn keeps_a_right_aligned_formula_clear_of_its_number() {
        let mut fonts = math_fonts();
        let laid = math_units(&mut fonts, "a = b", true, Some("right"), false, 20.0, 300.0);
        let (math, x, _) = the_math(&laid);
        let number = laid.number.expect("a place for the number");
        let gap = number.right - number_width(&mut fonts) - (x + math.width);
        assert!((gap - NUMBER_GAP).abs() < 0.01, "{gap}");
    }

    #[test]
    fn measures_the_widest_number_once_for_its_fonts() {
        let mut fonts = math_fonts();
        let width = number_width(&mut fonts);
        assert!(width > 0.0);
        assert_eq!(fonts.maths.number_width, Some(width));
        // a font added may set it otherwise
        let dejavu = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/dejavu-sans-bold.ttf"
        ))
        .unwrap();
        fonts.add(dejavu, "Other");
        assert_eq!(fonts.maths.number_width, None);
        assert_eq!(number_width(&mut fonts), width);
    }

    #[test]
    fn puts_the_number_below_a_wide_formula() {
        let mut fonts = math_fonts();
        let wide = "a + b + c + d + e + f + g + h + i + j + k + l + m + n";
        let laid = math_units(&mut fonts, wide, true, None, false, 0.0, 200.0);
        let (math, _, _) = the_math(&laid);
        let number = laid.number.expect("a place for the number");
        assert!(number.baseline > math.height + math.depth);
        assert!(laid.units[0].height > math.height + math.depth);
    }

    #[test]
    fn shows_the_source_while_it_cant_be_set() {
        let mut fonts = crate::fonts::repository_fonts();
        let laid = math_units(&mut fonts, "x^2", false, None, false, 0.0, 300.0);
        assert!(laid.units[0].decos.is_empty());
        assert_eq!(&*laid.label.unwrap().text, "x^2");
        let mut fonts = math_fonts();
        let laid = math_units(&mut fonts, r"\nope", false, None, false, 0.0, 300.0);
        assert_eq!(&*laid.label.unwrap().text, r"\nope");
    }

    #[test]
    fn says_whats_wrong_in_a_preview() {
        let mut fonts = math_fonts();
        let laid = math_units(&mut fonts, r"\nope", false, None, true, 0.0, 300.0);
        let label = laid.label.unwrap();
        assert!(label.text.contains("line 1, column 1"), "{}", label.text);
        assert!(label.text.contains("nope"), "{}", label.text);
    }
}
