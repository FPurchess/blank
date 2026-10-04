//! Builders the tests of the engine share.

use super::Engine;
use crate::fonts::repository_fonts;
use crate::model::{Content, Item, Text};

pub fn paragraph(pos: u32, text: &str) -> Item {
    Item {
        content: Content::Text(Text {
            pos,
            text: text.into(),
            top: true,
            ..Default::default()
        }),
        indent: 0.0,
        before: 0.0,
        after: 8.0,
        marker: None,
        bars: vec![],
        bars_continue: false,
        page_start: false,
        column: None,
        frame: None,
        flow_top: 0.0,
    }
}

pub fn heading(pos: u32, level: u8, text: &str) -> Item {
    Item {
        content: Content::Text(Text {
            pos,
            text: text.into(),
            style: format!("h{level}").into(),
            level,
            top: true,
            listed: true,
            ..Default::default()
        }),
        indent: 0.0,
        before: 16.0,
        after: 5.0,
        marker: None,
        bars: vec![],
        bars_continue: false,
        page_start: false,
        column: None,
        frame: None,
        flow_top: 0.0,
    }
}

/// a document of paragraphs, with the positions ProseMirror gives them
pub fn document(texts: &[&str]) -> Vec<Item> {
    let mut pos = 0;
    texts
        .iter()
        .map(|text| {
            let item = paragraph(pos + 1, text);
            pos += text.encode_utf16().count() as u32 + 2;
            item
        })
        .collect()
}

pub fn engine(items: Vec<Item>) -> Engine {
    let mut engine = Engine::new(repository_fonts());
    engine.set_items(items);
    engine
}

pub const LONG: &str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

pub fn table_item(rows: Vec<crate::model::Row>, caption: Option<&str>) -> Item {
    Item {
        content: Content::Table {
            pos: 0,
            end: 100_000,
            rows,
            widths: vec![],
            caption: caption.map(String::from),
        },
        ..paragraph(0, "")
    }
}

pub fn cell(pos: u32, text: &str) -> crate::model::Cell {
    crate::model::Cell {
        paragraphs: vec![Text {
            pos,
            text: text.into(),
            ..Default::default()
        }],
        ..Default::default()
    }
}

/// a band of a grid after the paragraphs `before`, and `after` it: its
/// columns of paragraphs side by side, of equal widths, with positions as
/// flatten.ts gives them in a form; with the position of each paragraph,
/// by column
pub fn grid_document(
    before: &[&str],
    columns: &[&[&str]],
    after: &[&str],
) -> (Vec<Item>, Vec<Vec<u32>>) {
    let mut items = document(before);
    let mut pos = items.last().map_or(0, |item| item.to() + 1);
    let tracks = vec![crate::model::Track { pt: 0.0, fr: 1.0 }; columns.len()];
    // the form and the field open
    pos += 1;
    let mut positions = vec![];
    for (index, texts) in columns.iter().enumerate() {
        pos += 1;
        let mut column = vec![];
        for text in *texts {
            let mut item = paragraph(pos + 1, text);
            if let Content::Text(text) = &mut item.content {
                text.top = false;
            }
            item.column = Some(crate::model::Column {
                start: index == 0 && column.is_empty(),
                index: index as u32,
                tracks: tracks.clone(),
                gap: 12.0,
                ..Default::default()
            });
            column.push(pos + 1);
            items.push(item);
            pos += text.encode_utf16().count() as u32 + 2;
        }
        positions.push(column);
        pos += 1;
    }
    pos += 1;
    for text in after {
        items.push(paragraph(pos + 1, text));
        pos += text.encode_utf16().count() as u32 + 2;
    }
    (items, positions)
}

/// a letter after the paragraphs `before`: its `frames` of paragraphs at
/// (x, y), 150 points wide, on a page of their own, and its `body` below
/// `flow_top`; with the position of each paragraph, the frames' first
pub fn letter_document(
    before: &[&str],
    frames: &[(f32, f32, &[&str])],
    flow_top: f32,
    body: &[&str],
) -> (Vec<Item>, Vec<u32>) {
    let mut items = document(before);
    let mut pos = items.last().map_or(0, |item| item.to() + 1) + 1;
    let mut positions = vec![];
    let start = items.len();
    for (x, y, texts) in frames {
        pos += 1;
        for (index, text) in texts.iter().enumerate() {
            let mut item = paragraph(pos + 1, text);
            item.frame = Some(crate::model::Frame {
                start: index == 0,
                x: *x,
                y: *y,
                width: 150.0,
                ..Default::default()
            });
            positions.push(pos + 1);
            items.push(item);
            pos += text.encode_utf16().count() as u32 + 2;
        }
        pos += 1;
    }
    pos += 1;
    for (index, text) in body.iter().enumerate() {
        let mut item = paragraph(pos + 1, text);
        if index == 0 {
            item.flow_top = flow_top;
        }
        positions.push(pos + 1);
        items.push(item);
        pos += text.encode_utf16().count() as u32 + 2;
    }
    if let Some(first) = items.get_mut(start) {
        first.page_start = true;
    }
    (items, positions)
}
