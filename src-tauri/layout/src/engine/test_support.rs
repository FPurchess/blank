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
    }
}

pub fn heading(pos: u32, level: u8, text: &str) -> Item {
    Item {
        content: Content::Text(Text {
            pos,
            text: text.into(),
            style: format!("h{level}"),
            level,
            top: true,
            ..Default::default()
        }),
        indent: 0.0,
        before: 16.0,
        after: 5.0,
        marker: None,
        bars: vec![],
        bars_continue: false,
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
