//! Laying out one item of the flow: its textblocks, and the units the
//! pagination places, which are lines for text and rows for tables.

use std::ops::Range;

use parley::Alignment;

use crate::fonts::Fonts;
use crate::model::{Content, Item, Text};
use crate::style::{CELL_PADDING_X, CELL_PADDING_Y, HEADER_LINE, MARKER_GAP, RULE, TABLE_LINE};
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
                height,
                decos,
                ..Default::default()
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
    }
}

/// the space between the paragraphs of a cell
const CELL_PARAGRAPH_GAP: f32 = 8.0;
/// the space between a caption and its table
const CAPTION_GAP: f32 = 4.0;

pub struct TableSpec<'a> {
    pub rows: &'a [crate::model::Row],
    pub widths: &'a [f32],
    pub caption: Option<&'a str>,
}

/// a cell as laid out: where it is in the grid, and its text boxes
struct PlacedCell {
    row: usize,
    col: usize,
    colspan: usize,
    rowspan: usize,
    header: bool,
    texts: Range<usize>,
    /// how high its content is, with the padding
    height: f32,
}

/// lays out a table: its caption, then its rows with the cells in the grid
/// of their columns, merged cells spanning columns and rows. Rows that
/// merged cells join stay together, and rows taller than `room` are sliced
/// between lines.
fn table_units(fonts: &mut Fonts, table: TableSpec, indent: f32, width: f32, room: f32) -> Laid {
    let rows = table.rows;
    let columns = rows
        .iter()
        .flat_map(|row| {
            row.cells
                .iter()
                .enumerate()
                .map(|(index, cell)| cell.col.unwrap_or(index as u32) + cell.colspan.max(1))
        })
        .max()
        .unwrap_or(1)
        .max(1) as usize;
    let shares: Vec<f32> = if table.widths.len() == columns {
        let total: f32 = table.widths.iter().sum::<f32>().max(f32::EPSILON);
        table.widths.iter().map(|share| share / total).collect()
    } else {
        vec![1.0 / columns as f32; columns]
    };
    let mut edges = vec![indent];
    for share in &shares {
        edges.push(edges[edges.len() - 1] + share * width);
    }
    let edge = |col: usize| edges[col.min(columns)];

    let mut texts: Vec<TextBox> = vec![];
    let mut units: Vec<Unit> = vec![];
    let mut label = None;
    let mut top = 0.0;
    if let Some(caption) = table.caption.filter(|caption| !caption.trim().is_empty()) {
        let text = Text {
            pos: 0,
            text: caption.to_string(),
            style: "caption".into(),
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, width, Alignment::Start);
        boxed.x = indent;
        top = boxed.height() + CAPTION_GAP;
        units.push(Unit {
            height: top,
            keep_next: true,
            ..Default::default()
        });
        label = Some(boxed);
    }

    // the cells, laid out in their widths, from the top of their rows
    let mut cells: Vec<PlacedCell> = vec![];
    for (row_index, row) in rows.iter().enumerate() {
        for (index, cell) in row.cells.iter().enumerate() {
            let col = cell.col.map(|col| col as usize).unwrap_or(index);
            let colspan = (cell.colspan.max(1) as usize).min(columns.saturating_sub(col).max(1));
            let rowspan = (cell.rowspan.max(1) as usize).min(rows.len() - row_index);
            let x = edge(col);
            let inner = (edge(col + colspan) - x - 2.0 * CELL_PADDING_X).max(10.0);
            let alignment = match cell.align.as_deref() {
                Some("center") => Alignment::Center,
                Some("right") => Alignment::Right,
                _ => Alignment::Start,
            };
            let first = texts.len();
            let mut y = CELL_PADDING_Y;
            for (paragraph_index, paragraph) in cell.paragraphs.iter().enumerate() {
                let mut paragraph = paragraph.clone();
                if cell.header && paragraph.style == "p" {
                    paragraph.style = "th".into();
                }
                let mut boxed = TextBox::new(fonts, &paragraph, inner, alignment);
                if paragraph_index > 0 {
                    y += CELL_PARAGRAPH_GAP;
                }
                boxed.x = x + CELL_PADDING_X;
                boxed.y = y;
                y += boxed.height();
                texts.push(boxed);
            }
            cells.push(PlacedCell {
                row: row_index,
                col,
                colspan,
                rowspan,
                header: cell.header,
                texts: first..texts.len(),
                height: y + CELL_PADDING_Y,
            });
        }
    }

    // the heights of the rows: as high as their cells, and a merged cell's
    // last row as much higher as it needs
    let mut heights = vec![0.0f32; rows.len()];
    for cell in cells.iter().filter(|cell| cell.rowspan == 1) {
        heights[cell.row] = heights[cell.row].max(cell.height);
    }
    for cell in cells.iter().filter(|cell| cell.rowspan > 1) {
        let spanned: f32 = heights[cell.row..cell.row + cell.rowspan].iter().sum();
        if spanned < cell.height {
            heights[cell.row + cell.rowspan - 1] += cell.height - spanned;
        }
    }
    let mut tops = vec![top];
    for height in &heights {
        tops.push(tops[tops.len() - 1] + height);
    }
    for cell in &cells {
        for index in cell.texts.clone() {
            texts[index].y += tops[cell.row];
        }
    }

    // the header rows, whose last one has a stronger line under it, unless
    // the table has no other rows
    let leading = rows.iter().take_while(|row| row.header).count();
    let header_rows = if leading == rows.len() { 0 } else { leading };
    // the room a slice of rows has: the header rows repeat above it on every
    // page, and the caption is above the first
    let headers_height = tops[header_rows] - tops[0];
    let slice_room = |first: bool| {
        let left = room - headers_height - if first { tops[0] } else { 0.0 };
        if left < 40.0 {
            room
        } else {
            left
        }
    };
    // the groups of rows that merged cells join
    let mut start = 0;
    while start < rows.len() {
        let mut end = start + 1;
        let mut index = 0;
        while index < cells.len() {
            let cell = &cells[index];
            if cell.row >= start && cell.row < end && cell.row + cell.rowspan > end {
                end = cell.row + cell.rowspan;
                index = 0;
                continue;
            }
            index += 1;
        }
        let group: Vec<&PlacedCell> = cells
            .iter()
            .filter(|cell| cell.row >= start && cell.row < end)
            .collect();
        let mut decos = vec![];
        for cell in &group {
            let (x, w) = (
                edge(cell.col),
                edge(cell.col + cell.colspan) - edge(cell.col),
            );
            let (y0, y1) = (tops[cell.row], tops[cell.row + cell.rowspan]);
            if cell.header {
                decos.push(Deco::Rect {
                    x,
                    y: y0,
                    w,
                    h: y1 - y0,
                    role: Role::HeaderFill,
                });
            }
            if cell.col > 0 {
                decos.push(Deco::Rect {
                    x,
                    y: y0,
                    w: TABLE_LINE,
                    h: y1 - y0,
                    role: Role::TableLine,
                });
            }
            let header_line = header_rows > 0 && cell.row + cell.rowspan == header_rows;
            let thickness = if header_line { HEADER_LINE } else { TABLE_LINE };
            decos.push(Deco::Rect {
                x,
                y: y1 - thickness,
                w,
                h: thickness,
                role: if header_line {
                    Role::HeaderLine
                } else {
                    Role::TableLine
                },
            });
        }
        let group_texts = group
            .iter()
            .map(|cell| cell.texts.clone())
            .reduce(|a, b| a.start.min(b.start)..a.end.max(b.end))
            .unwrap_or(0..0);
        let header = end <= header_rows;
        let row_edges: Vec<(usize, f32, f32)> = (start..end)
            .map(|row| (row, tops[row], tops[row + 1]))
            .collect();
        let (y0, y1) = (tops[start], tops[end]);
        if room <= 0.0 || y1 - y0 <= room + 0.01 {
            units.push(Unit {
                top: y0,
                height: y1 - y0,
                header,
                texts: group_texts,
                rows: row_edges,
                // the header rows stay with the first row
                keep_next: header,
                decos,
                ..Default::default()
            });
        } else {
            // taller than a page: sliced between each of its lines, so the
            // row starts on the page it comes to and fills the pages after
            let lines: Vec<(f32, f32)> = group_texts
                .clone()
                .flat_map(|index| {
                    let boxed = &texts[index];
                    boxed
                        .lines()
                        .into_iter()
                        .map(|line| (boxed.y + line.top, boxed.y + line.bottom))
                        .collect::<Vec<_>>()
                })
                .collect();
            let mut from = y0;
            while from < y1 - 0.01 {
                let limit = from + slice_room(from == y0);
                let to = {
                    lines
                        .iter()
                        .map(|(_, bottom)| *bottom)
                        .chain([y1])
                        .filter(|cut| {
                            *cut > from + 0.01
                                && *cut <= limit + 0.01
                                && lines.iter().all(|(top, bottom)| {
                                    *cut <= top + 0.01 || *cut >= bottom - 0.01
                                })
                        })
                        .fold(f32::NAN, f32::min)
                };
                let to = if to.is_nan() { limit } else { to };
                units.push(Unit {
                    top: from,
                    height: to - from,
                    header,
                    texts: group_texts.clone(),
                    clip: Some((from, to)),
                    rows: row_edges
                        .iter()
                        .filter(|(_, top, bottom)| *bottom > from && *top < to)
                        .map(|(row, top, bottom)| (*row, top.max(from), bottom.min(to)))
                        .collect(),
                    decos: decos
                        .iter()
                        .filter_map(|deco| clipped(deco, from, to))
                        .collect(),
                    ..Default::default()
                });
                from = to;
            }
        }
        start = end;
    }
    Laid {
        units,
        texts,
        marker: None,
        label,
        columns: edges,
    }
}

/// the part of a decoration from `from` to `to`, or nothing
fn clipped(deco: &Deco, from: f32, to: f32) -> Option<Deco> {
    let Deco::Rect { x, y, w, h, role } = deco else {
        return Some(deco.clone());
    };
    let top = y.max(from);
    let bottom = (y + h).min(to);
    (bottom > top + 0.001).then_some(Deco::Rect {
        x: *x,
        y: top,
        w: *w,
        h: bottom - top,
        role: *role,
    })
}
