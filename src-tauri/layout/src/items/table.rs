//! Laying out a table: its caption, then its rows with the cells in the
//! grid of their columns.

use std::ops::Range;

use parley::Alignment;

use super::{CellImage, Deco, Laid, Marked, Role, TableCell, Unit};
use crate::fonts::Fonts;
use crate::model::{CellBlock, Text};
use crate::style::{BAR, CELL_PADDING_X, CELL_PADDING_Y, HEADER_LINE, MARKER_GAP, TABLE_LINE};
use crate::text::TextBox;

/// the most columns a table has: a merged cell may say it covers any
/// number, e.g. from an HTML table, and the grid is laid out in memory
pub const MAX_COLUMNS: u32 = 1000;

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
    /// its list markers and alt texts, in `Laid::extras`
    extras: Range<usize>,
    /// its quote bars and images, from the top of its row
    decos: Vec<Deco>,
    /// its images: their positions, alt texts and places, from the top of
    /// its row
    images: Vec<(u32, String, f32, f32, f32, f32)>,
    /// its list markers, with the block each marks
    markers: Vec<(Marked, usize)>,
    /// the alt texts of its images that aren't loaded, by their positions
    alts: Vec<(u32, usize)>,
    /// how high its content is, with the padding
    height: f32,
}

/// a list marker, right-aligned before `x`, its first baseline at `baseline`
fn marker_box(fonts: &mut Fonts, marker: &str, style: &str, x: f32, baseline: f32) -> TextBox {
    let text = Text {
        pos: 0,
        text: marker.to_string(),
        style: style.to_string(),
        ..Default::default()
    };
    let mut marked = TextBox::new(fonts, &text, 100.0, Alignment::Start);
    marked.x = x - MARKER_GAP - marked.layout.width();
    marked.y = baseline - marked.lines().first().map_or(0.0, |line| line.baseline);
    marked
}

/// a block's quote bars, from `y` down `height`, and over the gap to the
/// next block where it is in the same quote
fn bar_decos(bars: &[f32], next: Option<&CellBlock>, left: f32, y: f32, height: f32) -> Vec<Deco> {
    let next_bars = next.map_or(&[][..], CellBlock::bars);
    bars.iter()
        .map(|bar| Deco::Rect {
            x: left + bar,
            y,
            w: BAR,
            h: height
                + if next_bars.contains(bar) {
                    CELL_PARAGRAPH_GAP
                } else {
                    0.0
                },
            role: Role::Text,
        })
        .collect()
}

/// lays out a table: its caption, then its rows with the cells in the grid
/// of their columns, merged cells spanning columns and rows. Rows that
/// merged cells join stay together, and rows taller than `room` are sliced
/// between lines.
pub(super) fn table_units(
    fonts: &mut Fonts,
    table: TableSpec,
    indent: f32,
    width: f32,
    room: f32,
) -> Laid {
    let rows = table.rows;
    let columns = rows
        .iter()
        .flat_map(|row| {
            row.cells.iter().enumerate().map(|(index, cell)| {
                let (col, colspan) = place(cell, index);
                col + colspan
            })
        })
        .max()
        .unwrap_or(1)
        .max(1) as usize;
    let total: f32 = table.widths.iter().sum();
    let shares: Vec<f32> = if table.widths.len() == columns && total.is_finite() && total > 0.0 {
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
    let mut extras: Vec<(TextBox, Role)> = vec![];
    for (row_index, row) in rows.iter().enumerate() {
        for (index, cell) in row.cells.iter().enumerate() {
            let (col, colspan) = place(cell, index);
            let (col, colspan) = (col as usize, colspan as usize);
            let colspan = colspan.min(columns.saturating_sub(col).max(1));
            let rowspan = (cell.rowspan.max(1) as usize).min(rows.len() - row_index);
            let x = edge(col);
            let inner = (edge(col + colspan) - x - 2.0 * CELL_PADDING_X).max(10.0);
            let alignment = match cell.align.as_deref() {
                Some("center") => Alignment::Center,
                Some("right") => Alignment::Right,
                _ => Alignment::Start,
            };
            let first = texts.len();
            let first_extra = extras.len();
            let left = x + CELL_PADDING_X;
            let mut decos = vec![];
            let mut images = vec![];
            let mut markers = vec![];
            let mut alts = vec![];
            let mut y = CELL_PADDING_Y;
            let blocks = cell.blocks();
            for (block_index, block) in blocks.iter().enumerate() {
                if block_index > 0 {
                    y += CELL_PARAGRAPH_GAP;
                }
                match block {
                    CellBlock::Text(block) => {
                        let mut paragraph = block.text.clone();
                        if cell.header && paragraph.style == "p" {
                            paragraph.style = "th".into();
                        }
                        let indent = block.indent.clamp(0.0, (inner - 10.0).max(0.0));
                        let mut boxed =
                            TextBox::new(fonts, &paragraph, (inner - indent).max(10.0), alignment);
                        boxed.x = left + indent;
                        boxed.y = y;
                        if let Some(marker) = &block.marker {
                            // on the baseline of the first line
                            let baseline =
                                y + boxed.lines().first().map_or(0.0, |line| line.baseline);
                            let marked =
                                marker_box(fonts, marker, &paragraph.style, boxed.x, baseline);
                            markers.push((Marked::Text(texts.len()), extras.len()));
                            extras.push((marked, Role::Text));
                        }
                        let height = boxed.height();
                        // a code block on its fill, as outside a table
                        if paragraph.style == "code" {
                            decos.push(Deco::Rect {
                                x: boxed.x - 4.0,
                                y,
                                w: boxed.width + 8.0,
                                h: height,
                                role: Role::CodeFill,
                            });
                        }
                        decos.extend(bar_decos(
                            &block.bars,
                            blocks.get(block_index + 1),
                            left,
                            y,
                            height,
                        ));
                        y += height;
                        texts.push(boxed);
                    }
                    CellBlock::Image {
                        pos,
                        src,
                        width: image_width,
                        height: image_height,
                        alt,
                        indent,
                        marker,
                        bars,
                    } => {
                        let indent = indent.clamp(0.0, (inner - 10.0).max(0.0));
                        let x = left + indent;
                        let room_x = (inner - indent).max(10.0);
                        let top = y;
                        if *image_width > 0.0 && *image_height > 0.0 {
                            // never wider than the cell, nor taller than a
                            // page, as a row's slices don't cut it
                            let scale = (room_x / image_width)
                                .min((room - 2.0 * CELL_PADDING_Y) / image_height)
                                .min(1.0);
                            let (w, h) = (image_width * scale, image_height * scale);
                            decos.push(Deco::Image {
                                src: src.clone(),
                                alt: alt.clone(),
                                x,
                                y,
                                w,
                                h,
                            });
                            images.push((*pos, alt.clone(), x, y, w, h));
                            y += h;
                        } else {
                            // until it is loaded: its alt text, or its src
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
                            let mut label = TextBox::new(fonts, &text, room_x, Alignment::Start);
                            label.x = x;
                            label.y = y;
                            y += label.height();
                            alts.push((*pos, extras.len()));
                            extras.push((label, Role::Hint));
                        }
                        // a marker at its top, as before a top-level image
                        if let Some(marker) = marker {
                            let mut marked = marker_box(fonts, marker, "p", x, top);
                            marked.y = top;
                            markers.push((Marked::Image(*pos), extras.len()));
                            extras.push((marked, Role::Text));
                        }
                        decos.extend(bar_decos(
                            bars,
                            blocks.get(block_index + 1),
                            left,
                            top,
                            y - top,
                        ));
                    }
                }
            }
            cells.push(PlacedCell {
                row: row_index,
                col,
                colspan,
                rowspan,
                header: cell.header,
                texts: first..texts.len(),
                extras: first_extra..extras.len(),
                decos,
                images,
                markers,
                alts,
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
    for cell in &mut cells {
        let top = tops[cell.row];
        for index in cell.texts.clone() {
            texts[index].y += top;
        }
        for index in cell.extras.clone() {
            extras[index].0.y += top;
        }
        cell.decos = cell.decos.iter().map(|deco| deco.moved(0.0, top)).collect();
        for image in &mut cell.images {
            image.3 += top;
        }
    }
    let mut cell_images = vec![];

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
        let group_extras = group
            .iter()
            .map(|cell| cell.extras.clone())
            .reduce(|a, b| a.start.min(b.start)..a.end.max(b.end))
            .unwrap_or(0..0);
        // the quote bars and images of the cells, over their fills and lines
        decos.extend(group.iter().flat_map(|cell| cell.decos.iter().cloned()));
        let group_images: Vec<(u32, String, f32, f32, f32, f32)> = group
            .iter()
            .flat_map(|cell| cell.images.iter().cloned())
            .collect();
        let header = end <= header_rows;
        let row_edges: Vec<(usize, f32, f32)> = (start..end)
            .map(|row| (row, tops[row], tops[row + 1]))
            .collect();
        let (y0, y1) = (tops[start], tops[end]);
        // the room the group has: on the pages the table goes on, that is
        // under its header rows, which repeat above it
        // and the first body row also under the caption, which stays with it
        let row_room = if header {
            room
        } else {
            slice_room(start == header_rows)
        };
        if room <= 0.0 || y1 - y0 <= row_room + 0.01 {
            for (pos, alt, x, y, w, h) in group_images.iter().cloned() {
                cell_images.push(CellImage {
                    pos,
                    alt,
                    unit: units.len(),
                    x,
                    y,
                    w,
                    h,
                });
            }
            units.push(Unit {
                top: y0,
                height: y1 - y0,
                header,
                texts: group_texts,
                extras: group_extras,
                rows: row_edges,
                // the header rows stay with the first row
                keep_next: header,
                decos,
                ..Default::default()
            });
        } else {
            // taller than a page: sliced between each of its lines, so the
            // row starts on the page it comes to and fills the pages after.
            // An image, and the lines of alt texts, aren't cut either.
            let line_spans = |boxed: &TextBox| {
                boxed
                    .lines()
                    .iter()
                    .map(|line| (boxed.y + line.top, boxed.y + line.bottom))
                    .collect::<Vec<_>>()
            };
            let lines: Vec<(f32, f32)> = group_texts
                .clone()
                .flat_map(|index| line_spans(&texts[index]))
                .chain(
                    group_extras
                        .clone()
                        .filter(|&index| extras[index].1 == Role::Hint)
                        .flat_map(|index| line_spans(&extras[index].0)),
                )
                .chain(group_images.iter().map(|&(_, _, _, y, _, h)| (y, y + h)))
                .collect();
            let cuts = allowed_cuts(&lines, y1);
            let mut next_cut = 0;
            let mut from = y0;
            while from < y1 - 0.01 {
                let limit = from + slice_room(from == y0);
                // the first cut after `from`, if the slice has room for it
                while cuts.get(next_cut).is_some_and(|cut| *cut <= from + 0.01) {
                    next_cut += 1;
                }
                let to = match cuts.get(next_cut) {
                    Some(&cut) if cut <= limit + 0.01 => cut,
                    _ => limit,
                };
                // always forward: where a slice can't move on, e.g. past the
                // precision of f32, the rest of the row is the last slice
                let to = if to > from { to } else { y1 };
                for (pos, alt, x, y, w, h) in group_images.iter().cloned() {
                    if y >= from - 0.01 && y < to - 0.01 {
                        cell_images.push(CellImage {
                            pos,
                            alt,
                            unit: units.len(),
                            x,
                            y,
                            w,
                            h,
                        });
                    }
                }
                units.push(Unit {
                    top: from,
                    height: to - from,
                    header,
                    texts: group_texts.clone(),
                    extras: group_extras.clone(),
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
    let cells = cells
        .iter()
        .map(|cell| TableCell {
            row: cell.row,
            col: cell.col,
            // a cell of a header row is a header cell too
            header: cell.header || rows[cell.row].header,
            texts: cell.texts.clone(),
            extras: cell.extras.clone(),
            images: cell
                .images
                .iter()
                .filter_map(|image| cell_images.iter().position(|known| known.pos == image.0))
                .collect(),
            markers: cell.markers.clone(),
            alts: cell.alts.clone(),
        })
        .collect();
    Laid {
        units,
        texts,
        marker: None,
        label,
        columns: edges,
        extras,
        cell_images,
        cells,
        missing: vec![],
    }
}

/// where a row taller than a page may be cut, in order: below a line (and
/// at the row's end, `y1`) where that isn't inside another line or image.
/// The spans are sorted by their tops, with the lowest bottom reached so
/// far, so that each cut is checked by a binary search, not against every
/// line: a cell of thousands of lines is sliced on each keystroke in it.
fn allowed_cuts(lines: &[(f32, f32)], y1: f32) -> Vec<f32> {
    let mut spans = lines.to_vec();
    spans.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut reach = Vec::with_capacity(spans.len());
    let mut lowest = f32::NEG_INFINITY;
    for (_, bottom) in &spans {
        lowest = lowest.max(*bottom);
        reach.push(lowest);
    }
    // inside a span: below its top and above its bottom, by more than the
    // rounding allowed
    let inside = |cut: f32| {
        let before = spans.partition_point(|(top, _)| *top + 0.01 < cut);
        before > 0 && reach[before - 1] - 0.01 > cut
    };
    let mut cuts: Vec<f32> = lines
        .iter()
        .map(|(_, bottom)| *bottom)
        .chain([y1])
        .filter(|cut| !inside(*cut))
        .collect();
    cuts.sort_by(f32::total_cmp);
    cuts.dedup();
    cuts
}

/// the first column a cell covers and how many, within MAX_COLUMNS
fn place(cell: &crate::model::Cell, index: usize) -> (u32, u32) {
    let col = cell
        .col
        .unwrap_or(index.min(u32::MAX as usize) as u32)
        .min(MAX_COLUMNS - 1);
    let colspan = cell.colspan.clamp(1, MAX_COLUMNS - col);
    (col, colspan)
}

/// the part of a decoration from `from` to `to`, or nothing; an image is
/// drawn whole, with the slice it starts in
fn clipped(deco: &Deco, from: f32, to: f32) -> Option<Deco> {
    let Deco::Rect { x, y, w, h, role } = deco else {
        let Deco::Image { y, .. } = deco else {
            return Some(deco.clone());
        };
        return (*y >= from - 0.01 && *y < to - 0.01).then(|| deco.clone());
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

#[cfg(test)]
mod tests {
    use crate::engine::test_support::{self, *};
    use crate::engine::{Engine, Hit, Op};
    use crate::items::{Deco, Role};
    use crate::model::{Content, Item, Text};
    use crate::text::TextBox;

    #[test]
    fn repeats_table_headers() {
        use crate::model::{Cell, Row};
        let cell = |pos: u32, text: &str, header: bool| Cell {
            paragraphs: vec![Text {
                pos,
                text: text.into(),
                ..Default::default()
            }],
            header,
            ..Default::default()
        };
        let mut rows = vec![Row {
            cells: vec![cell(3, "Name", true), cell(10, "Value", true)],
            header: true,
        }];
        for index in 0..80u32 {
            let pos = 20 + index * 20;
            rows.push(Row {
                cells: vec![cell(pos, "row", false), cell(pos + 8, "value", false)],
                header: false,
            });
        }
        let table = Item {
            content: Content::Table {
                pos: 0,
                end: 2000,
                rows,
                widths: vec![],
                caption: None,
            },
            ..paragraph(0, "")
        };
        let engine = engine(vec![table]);
        assert!(engine.pages.len() >= 2);
        let second = engine.pages[1].start;
        assert!(engine.frags[second].repeat);
        assert_eq!(engine.frags[second].unit, 0);
        // a click into a cell lands in its text
        let (page, x, y, h) = engine.caret(10 + 2, false).unwrap();
        assert_eq!(page, 0);
        assert_eq!(engine.hit(page, x + 0.1, y + h / 2.0), Some(Hit::Text(12)));
        // the grid: two columns across the text, every row placed, the
        // header row again on the second page
        let grid = engine.table_grid(0).unwrap();
        assert_eq!(grid.columns.len(), 3);
        let left = engine.settings.margins.left;
        assert!((grid.columns[0] - left).abs() < 0.01);
        assert!((grid.columns[2] - left - engine.settings.content_width()).abs() < 0.01);
        assert_eq!(grid.rows.iter().filter(|row| !row.repeat).count(), 81);
        let repeated = grid.rows.iter().find(|row| row.repeat).unwrap();
        assert_eq!((repeated.page, repeated.row), (1, 0));
        assert!(engine.table_grid(5).is_none());
        // the table's box on each page
        let boxes = engine.boxes(0, 2000);
        assert_eq!(boxes.len(), engine.pages.len());
        assert!((boxes[0].2 - engine.settings.content_top()).abs() < 0.01);
    }

    #[test]
    fn merges_cells_across_columns_and_rows() {
        use crate::model::{Cell, Row};
        // | a (2 rows) | b | c |
        // |            | d e (2 columns) |
        let rows = vec![
            Row {
                cells: vec![
                    Cell {
                        rowspan: 2,
                        ..cell(3, "a")
                    },
                    cell(8, "b"),
                    cell(13, "c"),
                ],
                header: false,
            },
            Row {
                cells: vec![Cell {
                    col: Some(1),
                    colspan: 2,
                    ..cell(20, "d e")
                }],
                header: false,
            },
        ];
        let engine = engine(vec![table_item(rows, None)]);
        let grid = engine.table_grid(0).unwrap();
        assert_eq!(grid.columns.len(), 4);
        // the rows the merged cell joins are one unit, both rows in the grid
        assert_eq!(engine.laid[0].units.len(), 1);
        assert_eq!(grid.rows.len(), 2);
        assert!((grid.rows[1].y - grid.rows[0].y - grid.rows[0].height).abs() < 0.01);
        // "d e" spans the second and third column
        let (_, x, ..) = engine.caret(20, false).unwrap();
        assert!(x > grid.columns[1] && x < grid.columns[2], "{x}");
        let texts = &engine.laid[0].texts;
        assert!(texts[3].width > texts[1].width * 1.5);
    }

    #[test]
    fn puts_the_caption_above_and_keeps_it_with_the_table() {
        use crate::model::Row;
        let rows: Vec<Row> = (0..3)
            .map(|index| Row {
                cells: vec![cell(10 + index * 10, "row")],
                header: index == 0,
            })
            .collect();
        let mut engine = engine(vec![table_item(rows, Some("The caption"))]);
        let ops = engine.page_ops(0, false);
        let caption = ops
            .iter()
            .find_map(|op| match op {
                Op::Glyphs { run, text, .. } if text.starts_with("The caption") => {
                    Some(run.baseline)
                }
                _ => None,
            })
            .unwrap();
        let grid = engine.table_grid(0).unwrap();
        assert!(caption < grid.rows[0].y);
        // the caption is not a row
        assert_eq!(grid.rows.len(), 3);
        // at the bottom of a page, the caption moves on with the table
        let settings = engine.settings.clone();
        let line = crate::style::text_style("p").line;
        let fill = ((settings.content_bottom() - settings.content_top()) / line) as usize - 3;
        let mut items: Vec<Item> = (0..fill)
            .map(|index| paragraph(index as u32 * 3 + 1, "x"))
            .collect();
        for item in &mut items {
            item.after = 0.0;
        }
        let rows: Vec<Row> = (0..3)
            .map(|index| Row {
                cells: vec![cell(90_000 + index * 10, "row")],
                header: index == 0,
            })
            .collect();
        let mut table = table_item(rows, Some("The caption"));
        if let Content::Table { pos, .. } = &mut table.content {
            *pos = 80_000;
        }
        items.push(table);
        let moved = test_support::engine(items);
        let grid = moved.table_grid(80_000).unwrap();
        assert!(grid.rows.iter().all(|row| row.page == 1));
        assert_eq!(moved.pages[1].first.unwrap().1, 0);
    }

    #[test]
    fn slices_rows_taller_than_a_page() {
        use crate::model::Row;
        let long = LONG.repeat(40);
        let rows = vec![
            Row {
                cells: vec![cell(3, "Head")],
                header: true,
            },
            Row {
                cells: vec![cell(12, &long)],
                header: false,
            },
        ];
        let mut engine = engine(vec![table_item(rows, None)]);
        assert!(engine.pages.len() >= 2, "{}", engine.pages.len());
        let bottom = engine.settings.content_bottom();
        for page in &engine.pages {
            assert!(page.bottom <= bottom + 0.1, "{} > {bottom}", page.bottom);
        }
        // every line of the cell is shown once, on some page
        let lines = engine.laid[0].texts[1].line_count();
        let shown: usize = (0..engine.pages.len())
            .map(|page| {
                engine
                    .page_ops(page, false)
                    .iter()
                    .filter(|op| matches!(op, Op::Glyphs { text, .. } if text.len() > 1000))
                    .count()
            })
            .sum();
        assert_eq!(shown, lines);
        // the header row again at the top of the second page
        let second = engine.pages[1].start;
        assert!(engine.frags[second].repeat);
        // the caret at the end of the cell is on the last page
        let end = 12 + long.len() as u32;
        let (page, ..) = engine.caret(end, false).unwrap();
        assert_eq!(page, engine.pages.len() - 1);
        // after a paragraph, the row starts on the same page
        let rows = vec![
            Row {
                cells: vec![cell(13, "Head")],
                header: true,
            },
            Row {
                cells: vec![cell(22, &long)],
                header: false,
            },
        ];
        let mut table = table_item(rows, None);
        if let Content::Table { pos, .. } = &mut table.content {
            *pos = 10;
        }
        let after = test_support::engine(vec![paragraph(1, "before"), table]);
        let grid = after.table_grid(10).unwrap();
        assert_eq!(grid.rows[0].page, 0);
        assert_eq!(grid.rows.iter().find(|row| row.row == 1).unwrap().page, 0);
        // one row on each page it is on, besides the header rows
        let body: Vec<_> = grid.rows.iter().filter(|row| row.row == 1).collect();
        assert_eq!(body.len(), after.pages.len());
    }

    #[test]
    fn nearly_page_tall_row_under_repeated_header() {
        use crate::model::Row;
        let settings = crate::model::Settings::default();
        let room = settings.content_bottom() - settings.content_top();
        // a row of hard lines, as tall as the page less than its header row:
        // it fits a page alone, but not under the header row repeated above
        for lines in 30..60 {
            let tall = vec!["x"; lines].join("\n");
            let rows = vec![
                Row {
                    cells: vec![cell(3, "Head")],
                    header: true,
                },
                Row {
                    cells: vec![cell(12, "first")],
                    header: false,
                },
                Row {
                    cells: vec![cell(22, &tall)],
                    header: false,
                },
            ];
            let engine = engine(vec![table_item(rows, None)]);
            let grid = engine.table_grid(0).unwrap();
            let header = grid.rows[0].height;
            let laid = &engine.laid[0];
            let tall_height = laid.texts[2].height() + 2.0 * crate::style::CELL_PADDING_Y;
            if tall_height <= room - header || tall_height > room {
                continue;
            }
            let bottom = engine.settings.content_bottom();
            for (index, frag) in engine.frags.iter().enumerate() {
                let unit = &laid.units[frag.unit];
                assert!(
                    frag.y + unit.height <= bottom + 0.01,
                    "fragment {index} ends at {} below {bottom}",
                    frag.y + unit.height
                );
            }
            // every line of the row is shown once
            let shown: usize = (0..engine.pages.len())
                .map(|page| {
                    let mut engine = test_support::engine(engine.items.clone());
                    engine
                        .page_ops(page, false)
                        .iter()
                        .filter(
                            |op| matches!(op, Op::Glyphs { text, .. } if text.starts_with("x\n")),
                        )
                        .count()
                })
                .sum();
            assert_eq!(shown, laid.texts[2].line_count());
            return;
        }
        panic!("no row of the height");
    }

    fn text_block(
        pos: u32,
        text: &str,
        indent: f32,
        marker: Option<&str>,
        bars: Vec<f32>,
    ) -> crate::model::CellBlock {
        crate::model::CellBlock::Text(crate::model::CellText {
            text: Text {
                pos,
                text: text.into(),
                ..Default::default()
            },
            indent,
            marker: marker.map(String::from),
            bars,
        })
    }

    fn image_block(pos: u32, width: f32, height: f32) -> crate::model::CellBlock {
        crate::model::CellBlock::Image {
            pos,
            src: format!("{width}.png"),
            width,
            height,
            alt: "a cat".into(),
            indent: 0.0,
            marker: None,
            bars: vec![],
        }
    }

    fn block_table(blocks: Vec<Vec<crate::model::CellBlock>>) -> Engine {
        use crate::model::{Cell, Row};
        let cells = blocks
            .into_iter()
            .map(|blocks| Cell {
                blocks,
                ..Default::default()
            })
            .collect();
        test_support::engine(vec![table_item(
            vec![Row {
                cells,
                header: false,
            }],
            None,
        )])
    }

    #[test]
    fn lays_out_a_list_in_a_cell() {
        let mut engine = block_table(vec![vec![
            text_block(5, "one", 18.0, Some("•"), vec![]),
            text_block(12, "two", 18.0, Some("•"), vec![]),
        ]]);
        let laid = &engine.laid[0];
        let left = laid.columns[0] + crate::style::CELL_PADDING_X;
        assert_eq!(laid.texts.len(), 2);
        assert!((laid.texts[0].x - left - 18.0).abs() < 0.01);
        assert!(laid.texts[1].y > laid.texts[0].y + laid.texts[0].height());
        // a marker before each, right-aligned before the indent, on the
        // baseline of its first line
        assert_eq!(laid.extras.len(), 2);
        for (marker, text) in laid.extras.iter().map(|(boxed, _)| boxed).zip(&laid.texts) {
            assert!(marker.x + marker.layout.width() <= text.x - crate::style::MARKER_GAP + 0.01);
            let baseline = |boxed: &TextBox| boxed.y + boxed.lines()[0].baseline;
            assert!((baseline(marker) - baseline(text)).abs() < 0.01);
        }
        assert_eq!(laid.units[0].extras, 0..2);
        // painted with the text, not as text of the document
        let bullets = engine
            .page_ops(0, false)
            .iter()
            .filter(|op| matches!(op, Op::Glyphs { text, role: Role::Text, .. } if &**text == "•"))
            .count();
        assert_eq!(bullets, 2);
        assert!(engine.laid[0].texts.iter().all(|text| &*text.text != "•"));
        // the caret is in the list's text
        assert!(engine.caret(6, false).is_some());
        assert_eq!(engine.missing(), Vec::<char>::new());
    }

    #[test]
    fn lays_out_a_quote_in_a_cell() {
        let mut engine = block_table(vec![vec![
            text_block(5, "said", 12.0, None, vec![0.0]),
            text_block(12, "more", 12.0, None, vec![0.0]),
            text_block(19, "after", 0.0, None, vec![]),
        ]]);
        let laid = &engine.laid[0];
        let left = laid.columns[0] + crate::style::CELL_PADDING_X;
        let (first, second) = (&laid.texts[0], &laid.texts[1]);
        let bars: Vec<(f32, f32, f32)> = laid.units[0]
            .decos
            .iter()
            .filter_map(|deco| match deco {
                Deco::Rect {
                    x,
                    y,
                    h,
                    role: Role::Text,
                    w,
                } if (*w - crate::style::BAR).abs() < 0.01 => Some((*x, *y, *h)),
                _ => None,
            })
            .collect();
        assert_eq!(bars.len(), 2);
        // one bar down the quote, from its first line to its last, without
        // a gap between its paragraphs
        assert!((bars[0].0 - left).abs() < 0.01);
        assert!((bars[0].1 - first.y).abs() < 0.01);
        assert!((bars[0].1 + bars[0].2 - second.y).abs() < 0.01);
        assert!((bars[1].1 + bars[1].2 - second.y - second.height()).abs() < 0.01);
        let rects = engine
            .page_ops(0, false)
            .iter()
            .filter(|op| {
                matches!(
                    op,
                    Op::Rect {
                        role: Role::Text,
                        ..
                    }
                )
            })
            .count();
        assert_eq!(rects, 2);
    }

    #[test]
    fn fits_images_to_their_cells() {
        let mut engine = block_table(vec![
            vec![
                text_block(5, "small", 0.0, None, vec![]),
                image_block(12, 50.0, 40.0),
            ],
            vec![image_block(20, 4000.0, 2000.0)],
        ]);
        let laid = &engine.laid[0];
        let inner = |column: usize| {
            laid.columns[column + 1] - laid.columns[column] - 2.0 * crate::style::CELL_PADDING_X
        };
        let images: Vec<(String, f32, f32, f32, f32)> = laid.units[0]
            .decos
            .iter()
            .filter_map(|deco| match deco {
                Deco::Image {
                    src, x, y, w, h, ..
                } => Some((src.clone(), *x, *y, *w, *h)),
                _ => None,
            })
            .collect();
        assert_eq!(images.len(), 2);
        // a small one as it is, under the text of its cell
        let (_, x, y, w, h) = images[0].clone();
        assert_eq!((w, h), (50.0, 40.0));
        assert!((x - laid.columns[0] - crate::style::CELL_PADDING_X).abs() < 0.01);
        assert!(y >= laid.texts[0].y + laid.texts[0].height() + 7.99);
        // a wide one scaled down to its cell, keeping its shape
        let (_, _, _, w, h) = images[1].clone();
        assert!((w - inner(1)).abs() < 0.01, "{w} {}", inner(1));
        assert!((h - w / 2.0).abs() < 0.01);
        // the row is as high as its tallest cell
        let row = laid.units[0].height;
        assert!((row - h - 2.0 * crate::style::CELL_PADDING_Y).abs() < 0.01);
        // painted, and boxed for a node selection of it
        let ops = engine.page_ops(0, false);
        assert_eq!(
            ops.iter()
                .filter(|op| matches!(op, Op::Image { .. }))
                .count(),
            2
        );
        let boxes = engine.boxes(12, 13);
        assert_eq!(boxes.len(), 1);
        let (page, bx, by, bw, bh) = boxes[0];
        assert_eq!(page, 0);
        assert!((bx - engine.settings.margins.left - x).abs() < 0.01);
        assert!((by - engine.frags[0].y - y).abs() < 0.01);
        assert_eq!((bw, bh), (50.0, 40.0));
        // the positions move with the table
        engine.update(0, 0, vec![paragraph(0, "")], 7);
        assert_eq!(engine.laid[1].cell_images[0].pos, 19);
        assert_eq!(engine.boxes(19, 20).len(), 1);
    }

    #[test]
    fn shows_the_alt_text_of_an_image_in_a_cell_not_loaded() {
        let mut engine = block_table(vec![vec![image_block(5, 0.0, 0.0)]]);
        let hints: Vec<String> = engine
            .page_ops(0, false)
            .iter()
            .filter_map(|op| match op {
                Op::Glyphs {
                    text,
                    role: Role::Hint,
                    ..
                } => Some(text.to_string()),
                _ => None,
            })
            .collect();
        assert_eq!(hints, ["a cat"]);
        assert!(engine.laid[0].texts.is_empty());
        assert!(engine.laid[0].units[0].height > 20.0);
    }

    #[test]
    fn sets_a_code_block_in_a_cell_on_its_fill() {
        let mut code = text_block(5, "let x = 1;", 0.0, None, vec![]);
        if let crate::model::CellBlock::Text(block) = &mut code {
            block.text.style = "code".into();
        }
        let mut engine = block_table(vec![vec![code]]);
        let boxed = &engine.laid[0].texts[0];
        let (y, height) = (boxed.y, boxed.height());
        let fill = engine.laid[0].units[0]
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Rect {
                    y,
                    h,
                    role: Role::CodeFill,
                    ..
                } => Some((*y, *h)),
                _ => None,
            })
            .unwrap();
        assert_eq!(fill, (y, height));
        let fonts: Vec<usize> = engine
            .page_ops(0, false)
            .iter()
            .filter_map(|op| match op {
                Op::Glyphs { run, .. } => Some(run.font),
                _ => None,
            })
            .collect();
        // IBM Plex Mono
        assert_eq!(fonts, [10]);
    }

    #[test]
    fn keeps_images_within_the_page() {
        // taller than a page, at the top and in a cell: scaled down to the
        // room, keeping their shape
        let tall = Item {
            content: Content::Image {
                pos: 0,
                src: "tall.png".into(),
                width: 100.0,
                height: 2000.0,
                alt: String::new(),
            },
            ..crate::engine::test_support::paragraph(0, "")
        };
        let engine = test_support::engine(vec![tall]);
        let bottom = engine.settings.content_bottom();
        assert!(
            engine.pages[0].bottom <= bottom + 0.01,
            "{}",
            engine.pages[0].bottom
        );
        let in_cell = block_table(vec![vec![image_block(5, 100.0, 2000.0)]]);
        for page in &in_cell.pages {
            assert!(page.bottom <= bottom + 0.01, "{}", page.bottom);
        }
        let image = &in_cell.laid[0].cell_images[0];
        assert!((image.w / image.h - 0.05).abs() < 1e-4);
    }

    /// the cuts as the slicing chose them before, against every line
    fn cuts_by_hand(lines: &[(f32, f32)], y1: f32) -> Vec<f32> {
        let mut cuts: Vec<f32> = lines
            .iter()
            .map(|(_, bottom)| *bottom)
            .chain([y1])
            .filter(|cut| {
                lines
                    .iter()
                    .all(|(top, bottom)| *cut <= top + 0.01 || *cut >= bottom - 0.01)
            })
            .collect();
        cuts.sort_by(f32::total_cmp);
        cuts.dedup();
        cuts
    }

    #[test]
    fn finds_the_cuts_between_lines() {
        // the lines of two cells side by side, at other heights, and an
        // image across several of them
        let mut lines: Vec<(f32, f32)> = (0..40)
            .map(|line| (line as f32 * 16.0, line as f32 * 16.0 + 16.0))
            .collect();
        lines.extend((0..30).map(|line| (4.0 + line as f32 * 21.0, 25.0 + line as f32 * 21.0)));
        lines.push((100.0, 180.0));
        lines.push((500.0, 516.0));
        assert_eq!(
            super::allowed_cuts(&lines, 700.0),
            cuts_by_hand(&lines, 700.0)
        );
        assert!(super::allowed_cuts(&[], 50.0) == [50.0]);
    }

    #[test]
    fn slices_a_cell_of_thousands_of_lines_in_time() {
        use crate::model::Row;
        // the cut search compared every cut with every line: 2000 lines took
        // 2.6 s in a debug build, on every keystroke in the cell
        let long = vec!["x"; 3000].join("\n");
        let rows = vec![Row {
            cells: vec![cell(3, &long)],
            header: false,
        }];
        let started = std::time::Instant::now();
        let engine = test_support::engine(vec![table_item(rows, None)]);
        assert_eq!(engine.laid[0].units.len(), 3001);
        assert!(
            started.elapsed().as_secs_f32() < 4.0,
            "{:?}",
            started.elapsed()
        );
    }

    #[test]
    fn keeps_the_caption_with_a_first_row_nearly_a_page_tall() {
        use crate::model::Row;
        // a first row that fits under the header row, but not under the
        // caption as well: it was kept whole and moved on, leaving the
        // caption alone on the page
        let settings = crate::model::Settings::default();
        let room = settings.content_bottom() - settings.content_top();
        let mut checked = false;
        for lines in 30..60 {
            let tall = vec!["x"; lines].join("\n");
            let rows = vec![
                Row {
                    cells: vec![cell(3, "Head")],
                    header: true,
                },
                Row {
                    cells: vec![cell(12, &tall)],
                    header: false,
                },
            ];
            let engine = test_support::engine(vec![table_item(rows, Some("Caption"))]);
            let laid = &engine.laid[0];
            let caption = laid.units[0].height;
            let head = laid.units[1].height;
            let row = laid.texts[1].height() + 2.0 * crate::style::CELL_PADDING_Y;
            if !(row + head <= room && row + head + caption > room) {
                continue;
            }
            checked = true;
            let pages: Vec<usize> = (0..engine.frags.len())
                .map(|frag| engine.pages.partition_point(|page| page.end <= frag))
                .collect();
            assert_eq!(
                pages[0], pages[1],
                "the caption and the header row: {pages:?}"
            );
            assert_eq!(
                pages[1], pages[2],
                "the header row and the first of the row: {pages:?}"
            );
        }
        assert!(checked, "no row of the height");
    }

    /// an image block in a list item, `width` × 40, 0 × 0 for not loaded
    fn listed_image(pos: u32, width: f32) -> crate::model::CellBlock {
        crate::model::CellBlock::Image {
            pos,
            src: "cat.png".into(),
            width,
            height: if width > 0.0 { 40.0 } else { 0.0 },
            alt: "a cat".into(),
            indent: 18.0,
            marker: Some("•".into()),
            bars: vec![0.0],
        }
    }

    #[test]
    fn lays_out_an_image_in_a_list_in_a_cell() {
        let engine = block_table(vec![vec![listed_image(5, 60.0), listed_image(9, 0.0)]]);
        let laid = &engine.laid[0];
        let left = laid.columns[0] + crate::style::CELL_PADDING_X;
        // indented, with its marker before it, at its top
        let image = &laid.cell_images[0];
        assert!((image.x - left - 18.0).abs() < 0.01, "{}", image.x);
        let cell = &laid.cells[0];
        assert_eq!(cell.markers.len(), 2);
        let (marked, extra) = cell.markers[0];
        assert_eq!(marked, crate::items::Marked::Image(5));
        let marker = &laid.extras[extra].0;
        assert!(marker.x + marker.layout.width() <= image.x - crate::style::MARKER_GAP + 0.01);
        assert!((marker.y - image.y).abs() < 0.01);
        // the one that isn't loaded shows its alt text there, marked too
        assert_eq!(cell.markers[1].0, crate::items::Marked::Image(9));
        let (alt_pos, alt) = cell.alts[0];
        assert_eq!(alt_pos, 9);
        assert!((laid.extras[alt].0.x - left - 18.0).abs() < 0.01);
        // the quote bar down the image and over the gap to the next block
        let bar = laid.units[0]
            .decos
            .iter()
            .find_map(|deco| match deco {
                Deco::Rect {
                    x,
                    y,
                    h,
                    role: Role::Text,
                    ..
                } if (*x - left).abs() < 0.01 => Some((*y, *h)),
                _ => None,
            })
            .expect("a bar");
        assert!((bar.0 - image.y).abs() < 0.01);
        assert!(
            (bar.1 - image.h - super::CELL_PARAGRAPH_GAP).abs() < 0.01,
            "{bar:?}"
        );
    }
}
