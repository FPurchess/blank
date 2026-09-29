//! Laying out one item of the flow: its textblocks, and the units the
//! pagination places, which are lines for text and rows for tables.

use std::ops::Range;

use parley::Alignment;

use crate::fonts::Fonts;
use crate::model::{Content, Item, Text};
use crate::style::{CELL_LINE, CELL_PADDING_X, CELL_PADDING_Y, MARKER_GAP, RULE};
use crate::text::TextBox;

/// what the colours of the screen and the PDF stand for
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Text = 0,
    Band = 1,
    CodeFill = 2,
    TableLine = 3,
    HeaderLine = 4,
    HeaderFill = 5,
    Placeholder = 6,
    /// the underline of a link
    LinkLine = 7,
    /// what stands for an image that isn't loaded: its alt text
    Hint = 8,
}

/// something drawn in an item besides its text
#[derive(Clone, Debug, PartialEq)]
pub enum Deco {
    Rect {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        role: Role,
    },
    Image {
        src: String,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
    },
}

impl Deco {
    pub fn moved(&self, dx: f32, dy: f32) -> Deco {
        match self {
            Deco::Rect { x, y, w, h, role } => Deco::Rect {
                x: x + dx,
                y: y + dy,
                w: *w,
                h: *h,
                role: *role,
            },
            Deco::Image { src, x, y, w, h } => Deco::Image {
                src: src.clone(),
                x: x + dx,
                y: y + dy,
                w: *w,
                h: *h,
            },
        }
    }
}

/// a piece of an item that stays on one page: a line of text, a table row,
/// an image
pub struct Unit {
    pub top: f32,
    pub height: f32,
    /// a header row of a table, repeated on the pages it continues on
    pub header: bool,
    /// the text boxes in it
    pub texts: Range<usize>,
    /// for a line of text: which line of its box
    pub line: Option<usize>,
    /// drawn with the unit, in the item's coordinates
    pub decos: Vec<Deco>,
}

pub struct Laid {
    pub units: Vec<Unit>,
    pub texts: Vec<TextBox>,
    /// the list marker, drawn with the first unit
    pub marker: Option<TextBox>,
    /// what stands in for an image that isn't loaded, drawn with the first
    /// unit; it isn't text of the document
    pub label: Option<TextBox>,
    /// for a table: where each column starts and where the last one ends,
    /// in the item's coordinates
    pub columns: Vec<f32>,
}

impl Laid {
    /// lays out an item in `width`, the width of the text on the page
    pub fn new(fonts: &mut Fonts, item: &Item, width: f32) -> Laid {
        let inner = (width - item.indent).max(20.0);
        let mut laid = match &item.content {
            Content::Text(text) => text_units(fonts, text, item.indent, inner),
            Content::Break { .. } => Laid::single(0.0, vec![]),
            Content::Rule { .. } => Laid::single(
                RULE,
                vec![Deco::Rect {
                    x: item.indent,
                    y: 0.0,
                    w: inner,
                    h: RULE,
                    role: Role::Text,
                }],
            ),
            Content::Image {
                src,
                width: image_width,
                height,
                alt,
                ..
            } => {
                if *image_width > 0.0 && *height > 0.0 {
                    // an image never is wider than the room it has
                    let scale = (inner / image_width).min(1.0);
                    let (w, h) = (image_width * scale, height * scale);
                    Laid::single(
                        h,
                        vec![Deco::Image {
                            src: src.clone(),
                            x: item.indent,
                            y: 0.0,
                            w,
                            h,
                        }],
                    )
                } else {
                    // until it is loaded, or if it can't be: its alt text,
                    // or else its src, in italics
                    let text = Text {
                        pos: 0,
                        text: if alt.is_empty() { src.clone() } else { alt.clone() },
                        style: "alt".into(),
                        ..Default::default()
                    };
                    let mut label = TextBox::new(fonts, &text, inner, Alignment::Start);
                    label.x = item.indent;
                    let mut laid = Laid::single(label.height(), vec![]);
                    laid.label = Some(label);
                    laid
                }
            }
            Content::Table { rows, widths, .. } => {
                table_units(fonts, rows, widths, item.indent, inner)
            }
        };
        if let (Some(marker), Some(first)) = (&item.marker, laid.units.first()) {
            let text = Text {
                pos: 0,
                text: marker.clone(),
                ..Default::default()
            };
            let mut boxed = TextBox::new(fonts, &text, 100.0, Alignment::Start);
            let marker_width = boxed.layout.width();
            boxed.x = item.indent - MARKER_GAP - marker_width;
            // on the baseline of the first line
            let baseline = match (&item.content, first.line) {
                (Content::Text(_), Some(_)) => laid.texts[0].lines()[0].baseline,
                _ => boxed.lines()[0].baseline,
            };
            boxed.y = baseline - boxed.lines()[0].baseline;
            laid.marker = Some(boxed);
        }
        laid
    }

    fn single(height: f32, decos: Vec<Deco>) -> Laid {
        Laid {
            units: vec![Unit {
                top: 0.0,
                height,
                header: false,
                texts: 0..0,
                line: None,
                decos,
            }],
            texts: vec![],
            marker: None,
            label: None,
            columns: vec![],
        }
    }

    pub fn height(&self) -> f32 {
        self.units
            .last()
            .map(|unit| unit.top + unit.height)
            .unwrap_or(0.0)
    }
}

fn text_units(fonts: &mut Fonts, text: &Text, indent: f32, width: f32) -> Laid {
    let mut boxed = TextBox::new(fonts, text, width, Alignment::Start);
    boxed.x = indent;
    let code = text.style == "code";
    let units = boxed
        .lines()
        .iter()
        .enumerate()
        .map(|(index, line)| Unit {
            top: line.top,
            height: line.bottom - line.top,
            header: false,
            texts: 0..1,
            line: Some(index),
            decos: if code {
                vec![Deco::Rect {
                    x: indent - 4.0,
                    y: line.top,
                    w: width + 8.0,
                    h: line.bottom - line.top,
                    role: Role::CodeFill,
                }]
            } else {
                vec![]
            },
        })
        .collect();
    Laid {
        units,
        texts: vec![boxed],
        marker: None,
        label: None,
        columns: vec![],
    }
}

/// the space between the paragraphs of a cell
const CELL_PARAGRAPH_GAP: f32 = 8.0;

fn table_units(
    fonts: &mut Fonts,
    rows: &[crate::model::Row],
    widths: &[f32],
    indent: f32,
    width: f32,
) -> Laid {
    let columns = rows
        .iter()
        .map(|row| row.cells.len())
        .max()
        .unwrap_or(1)
        .max(1);
    let shares: Vec<f32> = if widths.len() == columns {
        let total: f32 = widths.iter().sum::<f32>().max(f32::EPSILON);
        widths.iter().map(|share| share / total).collect()
    } else {
        vec![1.0 / columns as f32; columns]
    };
    let mut texts = vec![];
    let mut units = vec![];
    let mut top = 0.0;
    let header_rows = rows.iter().take_while(|row| row.header).count();
    for (row_index, row) in rows.iter().enumerate() {
        let first_text = texts.len();
        let mut x = indent;
        let mut height: f32 = 0.0;
        let mut cells = vec![];
        for (column, cell) in row.cells.iter().enumerate() {
            let cell_width = shares.get(column).copied().unwrap_or(0.0) * width;
            let inner = (cell_width - 2.0 * CELL_PADDING_X).max(10.0);
            let alignment = match cell.align.as_deref() {
                Some("center") => Alignment::Center,
                Some("right") => Alignment::Right,
                _ => Alignment::Start,
            };
            let mut y = CELL_PADDING_Y;
            for (index, paragraph) in cell.paragraphs.iter().enumerate() {
                let mut paragraph = paragraph.clone();
                if cell.header && paragraph.style == "p" {
                    paragraph.style = "th".into();
                }
                let mut boxed = TextBox::new(fonts, &paragraph, inner, alignment);
                if index > 0 {
                    y += CELL_PARAGRAPH_GAP;
                }
                boxed.x = x + CELL_PADDING_X;
                boxed.y = top + y;
                y += boxed.height();
                texts.push(boxed);
            }
            height = height.max(y + CELL_PADDING_Y);
            cells.push((x, cell_width, cell.header));
            x += cell_width;
        }
        let mut decos = vec![];
        for (x, w, header) in &cells {
            if *header {
                decos.push(Deco::Rect {
                    x: *x,
                    y: top,
                    w: *w,
                    h: height,
                    role: Role::HeaderFill,
                });
            }
        }
        for (column, (x, _, _)) in cells.iter().enumerate() {
            if column > 0 {
                decos.push(Deco::Rect {
                    x: *x,
                    y: top,
                    w: CELL_LINE,
                    h: height,
                    role: Role::TableLine,
                });
            }
        }
        let header_line = header_rows > 0 && row_index + 1 == header_rows;
        decos.push(Deco::Rect {
            x: indent,
            y: top + height
                - if header_line {
                    2.0 * CELL_LINE
                } else {
                    CELL_LINE
                },
            w: width,
            h: if header_line {
                2.0 * CELL_LINE
            } else {
                CELL_LINE
            },
            role: if header_line {
                Role::HeaderLine
            } else {
                Role::TableLine
            },
        });
        units.push(Unit {
            top,
            height,
            header: row_index < header_rows,
            texts: first_text..texts.len(),
            line: None,
            decos,
        });
        top += height;
    }
    let mut edges = vec![indent];
    for share in &shares {
        edges.push(edges[edges.len() - 1] + share * width);
    }
    Laid {
        units,
        texts,
        marker: None,
        label: None,
        columns: edges,
    }
}
