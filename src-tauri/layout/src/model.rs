//! What the engine gets: the blocks of the document, flattened into items by
//! `src/engine/flatten.ts`, and the page they are laid out on.

use serde::{Deserialize, Deserializer};

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

/// A textblock in a table cell, with where it stands in the cell: in a
/// list, with its marker, or in a quote, with its bars.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct CellText {
    #[serde(flatten)]
    pub text: Text,
    /// from the left of the cell's text, in points
    #[serde(default)]
    pub indent: f32,
    /// a list marker, "•" or "3.", set right-aligned before the indent
    #[serde(default)]
    pub marker: Option<String>,
    /// quote bars, by their distance from the left of the cell's text
    #[serde(default)]
    pub bars: Vec<f32>,
}

/// A block of a table cell: a textblock, or an image, which is fitted to
/// the width of the cell.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CellBlock {
    Text(CellText),
    Image {
        pos: u32,
        src: String,
        /// in points, as the image's own size gives it; 0 while it isn't
        /// loaded
        #[serde(default)]
        width: f32,
        #[serde(default)]
        height: f32,
        #[serde(default)]
        alt: String,
    },
}

/// A cell of a table.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Cell {
    /// its paragraphs, when it holds nothing else; see `blocks`
    #[serde(default)]
    pub paragraphs: Vec<Text>,
    /// its blocks, with lists, quotes and images; used instead of
    /// `paragraphs` when there are any
    #[serde(default)]
    pub blocks: Vec<CellBlock>,
    #[serde(default)]
    pub header: bool,
    /// left, center or right
    #[serde(default)]
    pub align: Option<String>,
    /// the first column it covers, by default the one after the cell
    /// before it
    #[serde(default)]
    pub col: Option<u32>,
    /// how many columns and rows it covers, 1 by default
    #[serde(default = "one_u32")]
    pub colspan: u32,
    #[serde(default = "one_u32")]
    pub rowspan: u32,
}

fn one_u32() -> u32 {
    1
}

impl Cell {
    /// what the cell holds: its blocks, or else its paragraphs
    pub fn blocks(&self) -> std::borrow::Cow<'_, [CellBlock]> {
        if !self.blocks.is_empty() {
            return std::borrow::Cow::Borrowed(&self.blocks);
        }
        std::borrow::Cow::Owned(
            self.paragraphs
                .iter()
                .map(|text| {
                    CellBlock::Text(CellText {
                        text: text.clone(),
                        ..Default::default()
                    })
                })
                .collect(),
        )
    }
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
    Break {
        pos: u32,
    },
    /// a horizontal rule
    Rule {
        pos: u32,
    },
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
        /// the caption above it
        #[serde(default)]
        caption: Option<String>,
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
    /// the number the first page shows, see `read_start_number`
    #[serde(default = "one", deserialize_with = "read_start_number")]
    pub start_number: i64,
    #[serde(default)]
    pub fields: Fields,
}

fn arabic() -> String {
    "1".into()
}

fn one() -> i64 {
    1
}

/// how far a start number reaches: far beyond any document, and far from
/// where adding the page count could overflow
pub const START_NUMBER_LIMIT: i64 = 1_000_000_000;

/// reads any JSON number as a start number: whole, and within
/// ±START_NUMBER_LIMIT, as JS hands over whatever the frontmatter holds
fn read_start_number<'de, D: Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
    let number = f64::deserialize(deserializer)?;
    Ok(if number.is_finite() {
        (number.trunc() as i64).clamp(-START_NUMBER_LIMIT, START_NUMBER_LIMIT)
    } else {
        1
    })
}

/// a number as it may be: finite, else `fallback`, and within `min..=max`
fn finite(value: f32, fallback: f32, min: f32, max: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

/// the smallest and largest page, in points: the room for a line of text,
/// and the largest page a PDF can have (200 inches)
pub const MIN_PAGE: f32 = 36.0;
pub const MAX_PAGE: f32 = 14_400.0;

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
    /// the settings as the engine can lay out with them, whatever JS handed
    /// over: a page of MIN_PAGE to MAX_PAGE points, margins that leave
    /// MIN_PAGE of it for the text, and a number style it knows
    pub fn sanitize(&mut self) {
        let default = Settings::default();
        self.width = finite(self.width, default.width, MIN_PAGE, MAX_PAGE);
        self.height = finite(self.height, default.height, MIN_PAGE, MAX_PAGE);
        let margins = &mut self.margins;
        for margin in [
            &mut margins.top,
            &mut margins.right,
            &mut margins.bottom,
            &mut margins.left,
        ] {
            *margin = finite(*margin, 0.0, 0.0, MAX_PAGE);
        }
        // opposite margins shrink alike until the text has its room
        let fit = |a: &mut f32, b: &mut f32, size: f32| {
            let room = size - MIN_PAGE;
            if *a + *b > room {
                let scale = room / (*a + *b);
                *a *= scale;
                *b *= scale;
            }
        };
        fit(&mut margins.left, &mut margins.right, self.width);
        fit(&mut margins.top, &mut margins.bottom, self.height);
        if !["1", "i", "I"].contains(&self.number_style.as_str()) {
            self.number_style = "1".into();
        }
    }

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
            Content::Text(text) => text.pos.saturating_add(utf16_len(&text.text)),
            Content::Break { pos } | Content::Rule { pos } | Content::Image { pos, .. } => {
                pos.saturating_add(1)
            }
            Content::Table { end, .. } => *end,
        }
    }

    /// moves the item by `delta` positions, when text before it changed
    pub fn shift(&mut self, delta: i64) {
        let moved = |pos: &mut u32| *pos = shift_pos(*pos, delta);
        match &mut self.content {
            Content::Text(text) => moved(&mut text.pos),
            Content::Break { pos } | Content::Rule { pos } | Content::Image { pos, .. } => {
                moved(pos)
            }
            Content::Table { pos, end, rows, .. } => {
                moved(pos);
                moved(end);
                for row in rows {
                    for cell in &mut row.cells {
                        for paragraph in &mut cell.paragraphs {
                            moved(&mut paragraph.pos);
                        }
                        for block in &mut cell.blocks {
                            match block {
                                CellBlock::Text(text) => moved(&mut text.text.pos),
                                CellBlock::Image { pos, .. } => moved(pos),
                            }
                        }
                    }
                }
            }
        }
    }

    /// the item as the engine can lay it out, whatever JS handed over:
    /// finite, non-negative spaces, indents, bars and table widths, and an
    /// image with a size that isn't finite as one that isn't loaded
    pub fn sanitize(&mut self) {
        self.indent = finite(self.indent, 0.0, 0.0, MAX_PAGE);
        self.before = finite(self.before, 0.0, 0.0, MAX_PAGE);
        self.after = finite(self.after, 0.0, 0.0, MAX_PAGE);
        for bar in &mut self.bars {
            *bar = finite(*bar, 0.0, 0.0, MAX_PAGE);
        }
        match &mut self.content {
            Content::Image { width, height, .. } => {
                if !(width.is_finite() && height.is_finite()) {
                    (*width, *height) = (0.0, 0.0);
                }
                *width = width.clamp(0.0, f32::MAX);
                *height = height.clamp(0.0, f32::MAX);
            }
            Content::Table { widths, rows, .. } => {
                for share in widths {
                    *share = finite(*share, 0.0, 0.0, f32::MAX);
                }
                for block in rows
                    .iter_mut()
                    .flat_map(|row| &mut row.cells)
                    .flat_map(|cell| &mut cell.blocks)
                {
                    match block {
                        CellBlock::Text(text) => {
                            text.indent = finite(text.indent, 0.0, 0.0, MAX_PAGE);
                            for bar in &mut text.bars {
                                *bar = finite(*bar, 0.0, 0.0, MAX_PAGE);
                            }
                        }
                        CellBlock::Image { width, height, .. } => {
                            if !(width.is_finite() && height.is_finite()) {
                                (*width, *height) = (0.0, 0.0);
                            }
                            *width = width.clamp(0.0, f32::MAX);
                            *height = height.clamp(0.0, f32::MAX);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    pub fn heading_level(&self) -> u8 {
        match &self.content {
            Content::Text(text) => text.level,
            _ => 0,
        }
    }
}

/// a position moved by `delta`, within what a position can be
pub fn shift_pos(pos: u32, delta: i64) -> u32 {
    u32::try_from(i64::from(pos).saturating_add(delta).max(0)).unwrap_or(u32::MAX)
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
    fn shifts_positions_within_their_range() {
        assert_eq!(shift_pos(5, 3), 8);
        assert_eq!(shift_pos(5, -9), 0);
        assert_eq!(shift_pos(u32::MAX, 1), u32::MAX);
        assert_eq!(shift_pos(0, i64::MIN), 0);
        assert_eq!(shift_pos(1, i64::MAX), u32::MAX);
    }

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
    fn reads_the_blocks_of_cells() {
        let item: Item = serde_json::from_str(
            r#"{"kind":"table","pos":0,"end":40,"rows":[{"cells":[{"blocks":[
                {"kind":"text","pos":3,"text":"one","indent":18,"marker":"•"},
                {"kind":"text","pos":9,"text":"said","style":"p","indent":12,"bars":[0]},
                {"kind":"image","pos":15,"src":"a.png","width":40,"height":30,"alt":"a cat"}
            ]},{"paragraphs":[{"pos":20,"text":"plain"}]}]}]}"#,
        )
        .unwrap();
        let Content::Table { rows, .. } = &item.content else {
            panic!("a table");
        };
        let blocks = rows[0].cells[0].blocks();
        assert_eq!(blocks.len(), 3);
        let CellBlock::Text(first) = &blocks[0] else {
            panic!("text");
        };
        assert_eq!(
            (first.text.pos, first.indent, first.marker.as_deref()),
            (3, 18.0, Some("•"))
        );
        assert_eq!(first.text.style, "p");
        assert!(matches!(&blocks[2], CellBlock::Image { pos: 15, width, .. } if *width == 40.0));
        // the paragraphs of a cell without blocks are its blocks
        let plain = rows[0].cells[1].blocks();
        assert!(matches!(&plain[0], CellBlock::Text(text) if text.text.text == "plain"));
        // and they move with the table
        let mut moved = item.clone();
        moved.shift(5);
        let Content::Table { rows, .. } = &moved.content else {
            panic!("a table");
        };
        assert!(matches!(
            &rows[0].cells[0].blocks[2],
            CellBlock::Image { pos: 20, .. }
        ));
        assert!(matches!(&rows[0].cells[0].blocks[0], CellBlock::Text(text) if text.text.pos == 8));
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
