//! Laying out one item of the flow: its textblocks, and the units the
//! pagination places, which are lines for text and rows for tables.

mod table;

use std::ops::Range;

use parley::Alignment;

use crate::fonts::Fonts;
use crate::model::{Content, Item, Text};
use crate::style::{MARKER_GAP, RULE};
use crate::text::TextBox;

use table::table_units;
pub use table::{TableSpec, MAX_COLUMNS};

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
        /// what stands in its place where it can't be shown, e.g. in a PDF
        /// it couldn't be decoded for
        alt: String,
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
            Deco::Image {
                src,
                alt,
                x,
                y,
                w,
                h,
            } => Deco::Image {
                src: src.clone(),
                alt: alt.clone(),
                x: x + dx,
                y: y + dy,
                w: *w,
                h: *h,
            },
        }
    }
}

/// a piece of an item that stays on one page: a line of text, the rows of a
/// table that merged cells join, a slice of rows taller than a page, an image
#[derive(Default)]
pub struct Unit {
    pub top: f32,
    pub height: f32,
    /// a header row of a table, repeated on the pages it continues on
    pub header: bool,
    /// the text boxes in it
    pub texts: Range<usize>,
    /// for a line of text: which line of its box
    pub line: Option<usize>,
    /// for a slice of rows: the part of the item it shows, from and to, in
    /// the item's coordinates; the lines of its texts outside are the other
    /// slices'
    pub clip: Option<(f32, f32)>,
    /// for a table: the rows in it, with where each starts and ends in the
    /// item's coordinates
    pub rows: Vec<(usize, f32, f32)>,
    /// stays on the page of the unit after it, e.g. a caption or the header
    /// rows with the first row
    pub keep_next: bool,
    /// drawn with the unit, in the item's coordinates
    pub decos: Vec<Deco>,
    /// the text drawn with the unit that isn't text of the document, e.g.
    /// the list markers and alt texts in a table's cells: in `Laid::extras`
    pub extras: Range<usize>,
}

impl Unit {
    /// whether a line of a text box, at `top` to `bottom` in the item's
    /// coordinates, is shown with this unit
    pub fn shows(&self, top: f32, bottom: f32) -> bool {
        match self.clip {
            Some((from, to)) => {
                let middle = (top + bottom) / 2.0;
                middle >= from && middle < to
            }
            None => true,
        }
    }
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
    /// for a table: the list markers and alt texts in its cells, with what
    /// they are painted as, see `Unit::extras`
    pub extras: Vec<(TextBox, Role)>,
    /// for a table: the images in its cells
    pub cell_images: Vec<CellImage>,
}

/// an image in a table's cell: its position, the unit it is drawn with,
/// and where, in the item's coordinates
#[derive(Clone, Debug, PartialEq)]
pub struct CellImage {
    pub pos: u32,
    pub unit: usize,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Laid {
    /// lays out an item in `width`, the width of the text on the page;
    /// `room` is the height of the text on a page, which rows of a table
    /// taller than it are sliced to
    pub fn new(fonts: &mut Fonts, item: &Item, width: f32, room: f32) -> Laid {
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
                            alt: alt.clone(),
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
                        text: if alt.is_empty() {
                            src.clone()
                        } else {
                            alt.clone()
                        },
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
            Content::Table {
                rows,
                widths,
                caption,
                ..
            } => table_units(
                fonts,
                TableSpec {
                    rows,
                    widths,
                    caption: caption.as_deref(),
                },
                item.indent,
                inner,
                room,
            ),
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
            let first_baseline =
                |boxed: &TextBox| boxed.lines().first().map_or(0.0, |line| line.baseline);
            let baseline = match (&item.content, first.line, laid.texts.first()) {
                (Content::Text(_), Some(_), Some(text)) => first_baseline(text),
                _ => first_baseline(&boxed),
            };
            boxed.y = baseline - first_baseline(&boxed);
            laid.marker = Some(boxed);
        }
        laid
    }

    fn single(height: f32, decos: Vec<Deco>) -> Laid {
        Laid {
            units: vec![Unit {
                height,
                decos,
                ..Default::default()
            }],
            texts: vec![],
            marker: None,
            label: None,
            columns: vec![],
            extras: vec![],
            cell_images: vec![],
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
            ..Default::default()
        })
        .collect();
    Laid {
        units,
        texts: vec![boxed],
        marker: None,
        label: None,
        columns: vec![],
        extras: vec![],
        cell_images: vec![],
    }
}
