//! What the engine gets: the blocks of the document, flattened into items by
//! `src/engine/flatten.ts`, and the page they are laid out on.

use serde::Deserialize;

/// A run of text with the same marks. Offsets count UTF-16 code units from
/// the start of the item's text, like ProseMirror positions do.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Span {
    pub from: u32,
    pub to: u32,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub code: bool,
    #[serde(default)]
    pub link: Option<String>,
}

/// A textblock: a paragraph, heading, code block or caption, wherever it is
/// (in a list, a quote).
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Text {
    /// the ProseMirror position of the first character
    pub pos: u32,
    pub text: String,
    #[serde(default)]
    pub spans: Vec<Span>,
    /// the text style, see style.rs: p, h1…h6, code, caption, th
    #[serde(default = "paragraph")]
    pub style: String,
    /// the heading level, 0 for none
    #[serde(default)]
    pub level: u8,
    /// whether it is a block of the document itself, not inside a list or
    /// a quote: only those start new pages and name chapters
    #[serde(default)]
    pub top: bool,
}

fn paragraph() -> String {
    "p".into()
}

/// A cell of a table.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Cell {
    #[serde(default)]
    pub paragraphs: Vec<Text>,
    #[serde(default)]
    pub header: bool,
    /// left, center or right
    #[serde(default)]
    pub align: Option<String>,
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Row {
    pub cells: Vec<Cell>,
    /// a header row, repeated at the top of each page the table continues on
    #[serde(default)]
    pub header: bool,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Content {
    Text(Text),
    /// a page break: what follows starts on a new page
    Break { pos: u32 },
    /// a horizontal rule
    Rule { pos: u32 },
    Image {
        pos: u32,
        src: String,
        /// in points, already fitted to the room for the text; 0 while the
        /// image isn't loaded
        width: f32,
        height: f32,
        #[serde(default)]
        alt: String,
    },
    Table {
        pos: u32,
        /// the ProseMirror position right after the table
        end: u32,
        rows: Vec<Row>,
        /// relative widths of the columns
        #[serde(default)]
        widths: Vec<f32>,
    },
}

/// One block of the flow, with where it stands.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Item {
    #[serde(flatten)]
    pub content: Content,
    /// from the left of the text, in points
    #[serde(default)]
    pub indent: f32,
    /// space above and below, in points; the space above is dropped at the
    /// top of a page
    #[serde(default)]
    pub before: f32,
    #[serde(default)]
    pub after: f32,
    /// a list marker, "•" or "3.", set right-aligned before the indent
    #[serde(default)]
    pub marker: Option<String>,
    /// quote bars, by their distance from the left of the text
    #[serde(default)]
    pub bars: Vec<f32>,
    /// whether the quote bars reach down to the next item
    #[serde(default)]
    pub bars_continue: bool,
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Margins {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Slots {
    #[serde(default)]
    pub left: String,
    #[serde(default)]
    pub center: String,
    #[serde(default)]
    pub right: String,
}

impl Slots {
    pub fn has_text(&self) -> bool {
        !(self.left.is_empty() && self.center.is_empty() && self.right.is_empty())
    }
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Bands {
    #[serde(default)]
    pub header: Slots,
    #[serde(default)]
    pub footer: Slots,
}

/// "same", "plain" or the first page's own bands, as in settings.ts
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum FirstPage {
    Named(String),
    Own(Bands),
}

impl Default for FirstPage {
    fn default() -> Self {
        FirstPage::Named("same".into())
    }
}

/// what {title}, {author}, {date} and {file} stand for
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Fields {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub file: String,
}

/// The page, as `pageGeometry` and the `Layout` of src/layout/resolve.ts
/// give it.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub width: f32,
    pub height: f32,
    pub margins: Margins,
    #[serde(default)]
    pub new_page_before: Vec<u8>,
    #[serde(default)]
    pub header: Slots,
    #[serde(default)]
    pub footer: Slots,
    #[serde(default)]
    pub first_page: FirstPage,
    #[serde(default)]
    pub even_pages: Option<Bands>,
    #[serde(default = "arabic")]
    pub number_style: String,
    #[serde(default = "one")]
    pub start_number: i32,
    #[serde(default)]
    pub fields: Fields,
}

fn arabic() -> String {
    "1".into()
}

fn one() -> i32 {
    1
}

impl Default for Settings {
    fn default() -> Self {
        // A4 with 2.5 cm margins
        let margin = 2.5 / 2.54 * 72.0;
        Settings {
            width: 595.28,
            height: 841.89,
            margins: Margins {
                top: margin,
                right: margin,
                bottom: margin,
                left: margin,
            },
            new_page_before: vec![],
            header: Slots::default(),
            footer: Slots::default(),
            first_page: FirstPage::default(),
            even_pages: None,
            number_style: arabic(),
            start_number: 1,
            fields: Fields::default(),
        }
    }
}

impl Settings {
    pub fn content_width(&self) -> f32 {
        self.width - self.margins.left - self.margins.right
    }

    pub fn content_top(&self) -> f32 {
        self.margins.top
    }

    pub fn content_bottom(&self) -> f32 {
        self.height - self.margins.bottom
    }
}

impl Item {
    /// the first ProseMirror position the item stands for
    pub fn from(&self) -> u32 {
        match &self.content {
            Content::Text(text) => text.pos,
            Content::Break { pos } | Content::Rule { pos } | Content::Image { pos, .. } => *pos,
            Content::Table { pos, .. } => *pos,
        }
    }

    /// the last ProseMirror position the item stands for
    pub fn to(&self) -> u32 {
        match &self.content {
            Content::Text(text) => text.pos + utf16_len(&text.text),
            Content::Break { pos } | Content::Rule { pos } | Content::Image { pos, .. } => pos + 1,
            Content::Table { end, .. } => *end,
        }
    }

    /// moves the item by `delta` positions, when text before it changed
    pub fn shift(&mut self, delta: i64) {
        let moved = |pos: &mut u32| *pos = (*pos as i64 + delta).max(0) as u32;
        match &mut self.content {
            Content::Text(text) => moved(&mut text.pos),
            Content::Break { pos } | Content::Rule { pos } | Content::Image { pos, .. } => moved(pos),
            Content::Table { pos, end, rows, .. } => {
                moved(pos);
                moved(end);
                for row in rows {
                    for cell in &mut row.cells {
                        for paragraph in &mut cell.paragraphs {
                            moved(&mut paragraph.pos);
                        }
                    }
                }
            }
        }
    }

    pub fn heading_level(&self) -> u8 {
        match &self.content {
            Content::Text(text) => text.level,
            _ => 0,
        }
    }
}

/// the length of `text` in UTF-16 code units, which ProseMirror counts
pub fn utf16_len(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

/// the byte index of a UTF-16 offset into `text`
pub fn byte_of_utf16(text: &str, offset: u32) -> usize {
    let mut units = 0u32;
    for (index, char) in text.char_indices() {
        if units >= offset {
            return index;
        }
        units += char.len_utf16() as u32;
    }
    text.len()
}

/// the UTF-16 offset of a byte index into `text`
pub fn utf16_of_byte(text: &str, byte: usize) -> u32 {
    let byte = byte.min(text.len());
    text[..floor_char(text, byte)].encode_utf16().count() as u32
}

fn floor_char(text: &str, mut byte: usize) -> usize {
    while byte > 0 && !text.is_char_boundary(byte) {
        byte -= 1;
    }
    byte
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_utf16_and_bytes() {
        let text = "aé😀b";
        assert_eq!(utf16_len(text), 5);
        assert_eq!(byte_of_utf16(text, 0), 0);
        assert_eq!(byte_of_utf16(text, 2), 3);
        assert_eq!(byte_of_utf16(text, 4), 7);
        assert_eq!(byte_of_utf16(text, 9), text.len());
        assert_eq!(utf16_of_byte(text, 3), 2);
        assert_eq!(utf16_of_byte(text, 7), 4);
        assert_eq!(utf16_of_byte(text, 8), 5);
    }

    #[test]
    fn reads_items() {
        let item: Item = serde_json::from_str(
            r#"{"kind":"text","pos":1,"text":"Hi","style":"h1","level":1,"top":true,"after":5}"#,
        )
        .unwrap();
        assert_eq!(item.from(), 1);
        assert_eq!(item.to(), 3);
        assert_eq!(item.heading_level(), 1);
        assert_eq!(item.after, 5.0);
        let first: Settings = serde_json::from_str(
            r#"{"width":100,"height":200,"margins":{"top":1,"right":2,"bottom":3,"left":4},"firstPage":"plain"}"#,
        )
        .unwrap();
        assert_eq!(first.first_page, FirstPage::Named("plain".into()));
        assert_eq!(first.content_width(), 94.0);
    }
}
