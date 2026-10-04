//! The text styles: 11 pt body and headings on a major third scale, as
//! the PDF had them since pdfmake wrote it, whose line height was
//! a factor of IBM Plex Sans' natural 1.3 em.

use crate::model::TextKind;

/// IBM Plex Sans' ascender plus descender, in em
pub const NATURAL: f32 = 1.3;
pub const BODY: f32 = 11.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextStyle {
    /// set in the monospaced font, like code
    pub mono: bool,
    pub size: f32,
    /// the height of a line, in points
    pub line: f32,
    pub weight: f32,
    pub italic: bool,
    pub tracking: f32,
}

const fn style(size: f32, factor: f32, weight: f32, italic: bool, tracking: f32) -> TextStyle {
    TextStyle {
        mono: false,
        size,
        line: size * NATURAL * factor,
        weight,
        italic,
        tracking,
    }
}

pub const REGULAR: f32 = 400.0;
pub const MEDIUM: f32 = 500.0;
pub const BOLD: f32 = 700.0;

/// the style of a textblock, see Text::style
pub fn text_style(kind: TextKind) -> TextStyle {
    match kind {
        TextKind::H1 => style(21.5, 0.92, MEDIUM, false, -0.4),
        // a table of contents' title looks like a heading 2
        TextKind::H2 | TextKind::TocTitle => style(17.0, 0.96, MEDIUM, false, -0.2),
        TextKind::H3 => style(13.75, 1.0, MEDIUM, false, 0.0),
        TextKind::H4 => style(BODY, 1.12, BOLD, false, 0.0),
        TextKind::H5 => style(BODY, 1.12, BOLD, true, 0.0),
        TextKind::H6 => style(BODY, 1.12, REGULAR, true, 0.0),
        TextKind::Alt => style(BODY, 1.12, REGULAR, true, 0.0),
        TextKind::Caption => style(BODY / 1.25, 1.12, REGULAR, true, 0.0),
        // small print, e.g. a letter's return address, a step down
        TextKind::Small => style(BODY / 1.25, 1.12, REGULAR, false, 0.0),
        TextKind::Th => style(BODY, 1.12, BOLD, false, 0.0),
        // code blocks in IBM Plex Mono, a step smaller, on the body's lines
        TextKind::Code => TextStyle {
            mono: true,
            ..style(CODE_SIZE, BODY * 1.12 / CODE_SIZE, REGULAR, false, 0.0)
        },
        TextKind::Band => style(crate::bands::BAND_SIZE, 1.0, REGULAR, false, 0.0),
        // the entries of headings 1 in a table of contents, a little
        // stronger than the others
        TextKind::Toc1 => style(BODY, 1.12, MEDIUM, false, 0.0),
        TextKind::P | TextKind::Other => style(BODY, 1.12, REGULAR, false, 0.0),
    }
}

/// code, which IBM Plex Mono sets wider than the text
pub const CODE_SIZE: f32 = 10.0;
/// inline code, as much smaller than the text around it
pub const CODE_SCALE: f32 = 0.9;

/// the gap between a list marker and the text
pub const MARKER_GAP: f32 = 6.0;
/// the width of a quote bar
pub const BAR: f32 = 2.25;
/// the line of a rule
pub const RULE: f32 = 0.75;
/// the padding of table cells, 0.4 and 0.7 em as in the editor
pub const CELL_PADDING_Y: f32 = 0.4 * BODY;
pub const CELL_PADDING_X: f32 = 0.7 * BODY;
/// the lines of a table and the one under its header rows, as
/// TABLE_LINES in src/exporters/table.ts
pub const TABLE_LINE: f32 = 0.6;
pub const HEADER_LINE: f32 = 1.2;
