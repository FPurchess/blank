//! Laying out a table: its caption, then its rows with the cells in the
//! grid of their columns.

use std::ops::Range;

use parley::Alignment;

use super::{Deco, Laid, Role, Unit};
use crate::fonts::Fonts;
use crate::model::Text;
use crate::style::{CELL_PADDING_X, CELL_PADDING_Y, HEADER_LINE, TABLE_LINE};
use crate::text::TextBox;

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

#[cfg(test)]
mod tests {
    use crate::engine::test_support::{self, *};
    use crate::engine::{Hit, Op};
    use crate::model::{Content, Item, Text};

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
}
