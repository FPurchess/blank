//! What the engine gets: the blocks of the document, flattened into items by
//! `src/engine/flatten.ts`, and the page they are laid out on.

use serde::{Deserialize, Deserializer};

/// A run of text with the same marks. Offsets count UTF-16 code units from
/// the start of the item's text, like ProseMirror positions do.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
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
    pub underline: bool,
    #[serde(default)]
    pub link: Option<String>,
}

/// A textblock: a paragraph, heading, code block or caption, wherever it is
/// (in a list, a quote).
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Text {
    /// the ProseMirror position of the first character
    pub pos: u32,
    pub text: String,
    #[serde(default)]
    pub spans: Vec<Span>,
    /// the text style, see style.rs
    #[serde(default = "paragraph")]
    pub style: TextKind,
    /// the heading level, 0 for none
    #[serde(default)]
    pub level: u8,
    /// whether it is a block of the document itself, not inside a list or
    /// a quote: only those start new pages and name chapters
    #[serde(default)]
    pub top: bool,
    /// whether it is one of the document's headings, as `isListed` in
    /// src/markdown/headings.ts says: in the outline, the PDF's bookmarks and
    /// tables of contents
    #[serde(default)]
    pub listed: bool,
    /// what it says while it's empty, e.g. the placeholder of a form's
    /// field: on the screen only
    #[serde(default)]
    pub hint: Option<String>,
    /// whether what it says while it's empty stands for a picture to come,
    /// e.g. in a form's field for one: it is drawn in a box of a picture's
    /// size, on the screen only
    #[serde(default)]
    pub picture: bool,
    /// how a paragraph or heading at the top of the document is aligned:
    /// center, right or justify, none for left (see `alignment_of`)
    #[serde(default)]
    pub align: Option<String>,
}

/// an entry of a table of contents: a heading's level and text
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct TocEntry {
    pub level: u8,
    pub text: String,
}

fn paragraph() -> TextKind {
    TextKind::P
}

/// The style of a textblock, see style.rs: what the webview sends (p, h1 to
/// h6, code) and what the engine sets itself (th for a header cell's
/// paragraphs, caption, alt for what stands for an image, band). It is read
/// from its name, and any other name is body text, as `Other`.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
#[serde(from = "String", into = "String")]
pub enum TextKind {
    P,
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
    Code,
    Th,
    Caption,
    /// small print, e.g. a letter's return address
    Small,
    Alt,
    Band,
    /// a table of contents' title, and the entries of its headings 1
    TocTitle,
    Toc1,
    #[default]
    Other,
}

impl TextKind {
    /// its name, as the webview writes it
    pub fn name(self) -> &'static str {
        match self {
            TextKind::P => "p",
            TextKind::H1 => "h1",
            TextKind::H2 => "h2",
            TextKind::H3 => "h3",
            TextKind::H4 => "h4",
            TextKind::H5 => "h5",
            TextKind::H6 => "h6",
            TextKind::Code => "code",
            TextKind::Th => "th",
            TextKind::Caption => "caption",
            TextKind::Small => "small",
            TextKind::Alt => "alt",
            TextKind::Band => "band",
            TextKind::TocTitle => "toc-title",
            TextKind::Toc1 => "toc1",
            TextKind::Other => "",
        }
    }
}

impl From<&str> for TextKind {
    fn from(name: &str) -> TextKind {
        match name {
            "p" => TextKind::P,
            "h1" => TextKind::H1,
            "h2" => TextKind::H2,
            "h3" => TextKind::H3,
            "h4" => TextKind::H4,
            "h5" => TextKind::H5,
            "h6" => TextKind::H6,
            "code" => TextKind::Code,
            "th" => TextKind::Th,
            "caption" => TextKind::Caption,
            "small" => TextKind::Small,
            "alt" => TextKind::Alt,
            "band" => TextKind::Band,
            "toc-title" => TextKind::TocTitle,
            "toc1" => TextKind::Toc1,
            _ => TextKind::Other,
        }
    }
}

impl From<String> for TextKind {
    fn from(name: String) -> TextKind {
        name.as_str().into()
    }
}

impl From<TextKind> for String {
    fn from(kind: TextKind) -> String {
        kind.name().into()
    }
}

/// A textblock in a table cell, with where it stands in the cell: in a
/// list, with its marker, or in a quote, with its bars.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
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
#[cfg_attr(test, derive(serde::Serialize))]
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
        /// where it stands in the cell, as for a `text` block: in a list,
        /// with its marker at its top, or in a quote, with its bars
        #[serde(default)]
        indent: f32,
        #[serde(default)]
        marker: Option<String>,
        #[serde(default)]
        bars: Vec<f32>,
    },
}

impl CellBlock {
    /// the quote bars it stands in
    pub fn bars(&self) -> &[f32] {
        match self {
            CellBlock::Text(text) => &text.bars,
            CellBlock::Image { bars, .. } => bars,
        }
    }
}

/// A cell of a table.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
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
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Row {
    pub cells: Vec<Cell>,
    /// a header row, repeated at the top of each page the table continues on
    #[serde(default)]
    pub header: bool,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[cfg_attr(test, derive(serde::Serialize))]
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
    /// a block that is shown as a box with a label, e.g. a content block
    /// this Blank can't show
    Boxed {
        pos: u32,
        label: String,
    },
    /// a table of contents: the listed headings up to `depth`, the n-th
    /// entry for the n-th of them, with the pages they start on
    Toc {
        pos: u32,
        #[serde(default)]
        title: String,
        depth: u8,
        #[serde(default)]
        entries: Vec<TocEntry>,
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
        /// the alignment of the paragraph it stands in: center or right;
        /// anything else, justify too, stands it at the start
        #[serde(default)]
        align: Option<String>,
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

/// the width of a column of a grid: points, or a share (`fr`) of the
/// width the columns of points and the gaps leave
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Track {
    #[serde(default)]
    pub pt: f32,
    #[serde(default)]
    pub fr: f32,
}

/// the most columns a grid has
pub const MAX_TRACKS: usize = 8;

/// The column of a grid an item stands in. The items of a band, the
/// columns of one row of a grid, come one column after the other, and the
/// columns stand side by side from where the band starts: the band ends
/// below its longest column.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Column {
    /// whether it is the first item of its band
    #[serde(default)]
    pub start: bool,
    /// which band it is in, counted by the engine (`Engine::number_bands_and_frames`)
    /// from the starts, so no edit can split one: what the webview sends
    /// once isn't sent again when the items before it change
    #[serde(skip)]
    pub band: u32,
    /// which of the band's columns
    pub index: u32,
    /// the widths of the band's columns
    pub tracks: Vec<Track>,
    /// the room between two columns, in points
    #[serde(default)]
    pub gap: f32,
}

impl Column {
    /// where the column starts and ends, from the left of the text, which
    /// is `width` wide
    pub fn edges(&self, width: f32) -> (f32, f32) {
        self.edges_of(self.index as usize, width)
    }

    /// where the column `index` of the band starts and ends, see `edges`
    fn edges_of(&self, index: usize, width: f32) -> (f32, f32) {
        let gaps = self.gap * self.tracks.len().saturating_sub(1) as f32;
        let points: f32 = self.tracks.iter().map(|track| track.pt).sum();
        let shares: f32 = self.tracks.iter().map(|track| track.fr).sum();
        let free = (width - gaps - points).max(0.0);
        let width_of = |track: &Track| {
            track.pt
                + if shares > 0.0 {
                    free * track.fr / shares
                } else {
                    0.0
                }
        };
        let index = index.min(self.tracks.len().saturating_sub(1));
        let left: f32 = self.tracks[..index]
            .iter()
            .map(|track| width_of(track) + self.gap)
            .sum();
        let right = self
            .tracks
            .get(index)
            .map_or(width, |track| left + width_of(track));
        (left, right.min(width))
    }

    /// the column of its band nearest to `x`, from the left of the text,
    /// which is `width` wide
    pub fn at(&self, x: f32, width: f32) -> u32 {
        let distance = |index: usize| {
            let (left, right) = self.edges_of(index, width);
            (left - x).max(x - right).max(0.0)
        };
        (0..self.tracks.len())
            .min_by(|&a, &b| distance(a).total_cmp(&distance(b)))
            .unwrap_or(0) as u32
    }

    /// whether `other` is another column of the same band
    pub fn beside(&self, other: &Column) -> bool {
        self.band == other.band && self.index != other.index
    }
}

/// A frame on the page an item stands in, outside the flow: the items of a
/// frame stand one below the other from its top, on the page where they
/// come, and take no room in the flow. In points from the page's top left
/// edge.
#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Frame {
    /// whether it is the first item of its frame
    #[serde(default)]
    pub start: bool,
    /// which frame it is in, counted by the engine from the starts, as the
    /// bands of grids are (`Engine::number_bands_and_frames`)
    #[serde(skip)]
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

/// One block of the flow, with where it stands. The webview writes the keys
/// of its fields in camelCase; the test `reads_every_key_the_webview_sends`
/// checks both sides against src/engine/__fixtures__/contract.json.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[cfg_attr(test, derive(serde::Serialize))]
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
    #[serde(default, rename = "barsContinue")]
    pub bars_continue: bool,
    /// whether it starts a new page, e.g. a form whose definition says so
    #[serde(default, rename = "pageStart")]
    pub page_start: bool,
    /// the column of a grid it stands in, if it does; its indent and bars
    /// count from the column's left
    #[serde(default)]
    pub column: Option<Column>,
    /// the frame it stands in, if it does; its indent and bars count from
    /// the frame's left
    #[serde(default)]
    pub frame: Option<Frame>,
    /// where it starts at the highest, from the page's top edge, e.g. the
    /// text of a letter below its address: 0 for anywhere
    #[serde(default, rename = "flowTop")]
    pub flow_top: f32,
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Margins {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

#[derive(Deserialize, Clone, Debug, PartialEq, Default)]
#[cfg_attr(test, derive(serde::Serialize))]
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
#[cfg_attr(test, derive(serde::Serialize))]
pub struct Bands {
    #[serde(default)]
    pub header: Slots,
    #[serde(default)]
    pub footer: Slots,
}

/// "same", "plain" or the first page's own bands, as in settings.ts
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[cfg_attr(test, derive(serde::Serialize))]
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
#[cfg_attr(test, derive(serde::Serialize))]
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
#[cfg_attr(test, derive(serde::Serialize))]
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

/// an image's size as it may be: not finite is not loaded (0 × 0), and at
/// most MAX_IMAGE a side, keeping its shape
fn image_size(width: &mut f32, height: &mut f32) {
    if !(width.is_finite() && height.is_finite()) || *width <= 0.0 || *height <= 0.0 {
        (*width, *height) = (0.0, 0.0);
        return;
    }
    let scale = (MAX_IMAGE / width.max(*height)).min(1.0);
    (*width, *height) = (*width * scale, *height * scale);
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
            Content::Break { pos }
            | Content::Rule { pos }
            | Content::Boxed { pos, .. }
            | Content::Toc { pos, .. }
            | Content::Image { pos, .. } => *pos,
            Content::Table { pos, .. } => *pos,
        }
    }

    /// the last ProseMirror position the item stands for
    pub fn to(&self) -> u32 {
        match &self.content {
            Content::Text(text) => text.pos.saturating_add(utf16_len(&text.text)),
            Content::Break { pos }
            | Content::Rule { pos }
            | Content::Boxed { pos, .. }
            | Content::Toc { pos, .. }
            | Content::Image { pos, .. } => pos.saturating_add(1),
            Content::Table { end, .. } => *end,
        }
    }

    /// where the room for the item starts and ends, from the left of the
    /// text: the column it stands in, or the whole width
    pub fn edges(&self, settings: &Settings) -> (f32, f32) {
        let width = settings.content_width();
        if let Some(frame) = &self.frame {
            let left = frame.x - settings.margins.left;
            return (left, left + frame.width);
        }
        self.column
            .as_ref()
            .map_or((0.0, width), |column| column.edges(width))
    }

    /// whether it stands somewhere else than across the text: in a column
    /// of a grid or in a frame
    pub fn placed(&self) -> bool {
        self.column.is_some() || self.frame.is_some()
    }

    /// where its own text starts and ends, from the left of the text: from
    /// its indent in its column to the column's end
    pub fn text_edges(&self, settings: &Settings) -> (f32, f32) {
        let (left, right) = self.edges(settings);
        (left + self.indent, right)
    }

    /// whether `other` stands in another column of the same band
    pub fn beside(&self, other: &Item) -> bool {
        matches!((&self.column, &other.column), (Some(a), Some(b)) if a.beside(b))
    }

    /// the band of a grid it stands in, if it does
    pub fn band(&self) -> Option<u32> {
        self.column.as_ref().map(|column| column.band)
    }

    /// moves the item by `delta` positions, when text before it changed
    pub fn shift(&mut self, delta: i64) {
        let moved = |pos: &mut u32| *pos = shift_pos(*pos, delta);
        match &mut self.content {
            Content::Text(text) => moved(&mut text.pos),
            Content::Break { pos }
            | Content::Rule { pos }
            | Content::Boxed { pos, .. }
            | Content::Toc { pos, .. }
            | Content::Image { pos, .. } => moved(pos),
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
        clamp_bars(&mut self.bars);
        if let Some(column) = &mut self.column {
            if column.tracks.is_empty() {
                column.tracks.push(Track { pt: 0.0, fr: 1.0 });
            }
            column.tracks.truncate(MAX_TRACKS);
            for track in &mut column.tracks {
                track.pt = finite(track.pt, 0.0, 0.0, MAX_PAGE);
                track.fr = finite(track.fr, 0.0, 0.0, 1e6);
            }
            column.gap = finite(column.gap, 0.0, 0.0, MAX_PAGE);
            column.index = column.index.min(column.tracks.len() as u32 - 1);
        }
        if let Some(frame) = &mut self.frame {
            frame.x = finite(frame.x, 0.0, 0.0, MAX_PAGE);
            frame.y = finite(frame.y, 0.0, 0.0, MAX_PAGE);
            frame.width = finite(frame.width, 100.0, 20.0, MAX_PAGE);
            // a frame isn't in a column
            self.column = None;
        }
        self.flow_top = finite(self.flow_top, 0.0, 0.0, MAX_PAGE);
        match &mut self.content {
            Content::Text(Text {
                hint: Some(hint), ..
            }) => truncate(hint, MAX_LABEL),
            Content::Image { width, height, .. } => image_size(width, height),
            Content::Boxed { label, .. } => truncate(label, MAX_LABEL),
            Content::Toc {
                title,
                depth,
                entries,
                ..
            } => {
                truncate(title, MAX_LABEL);
                *depth = (*depth).clamp(1, 6);
                // an entry is as long as its heading, which is laid out too
                entries.truncate(MAX_TOC_ENTRIES);
                for entry in entries {
                    entry.level = entry.level.clamp(1, 6);
                }
            }
            Content::Table { widths, rows, .. } => {
                for share in widths {
                    *share = finite(*share, 0.0, 0.0, 1e6);
                }
                for block in rows
                    .iter_mut()
                    .flat_map(|row| &mut row.cells)
                    .flat_map(|cell| &mut cell.blocks)
                {
                    match block {
                        CellBlock::Text(text) => {
                            clamp_bars(&mut text.bars);
                            text.indent = finite(text.indent, 0.0, 0.0, MAX_PAGE);
                        }
                        CellBlock::Image {
                            width,
                            height,
                            indent,
                            bars,
                            ..
                        } => {
                            image_size(width, height);
                            *indent = finite(*indent, 0.0, 0.0, MAX_PAGE);
                            clamp_bars(bars);
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

/// a number for JSON, with at most three decimals, which is finer than any
/// screen; 0 for what isn't finite, which JSON can't hold
pub fn json_number(value: f32) -> String {
    let rounded = (f64::from(value) * 1000.0).round() / 1000.0;
    if rounded.is_finite() {
        // as an f32 again, so it prints as short as before
        format!("{}", rounded as f32)
    } else {
        "0".into()
    }
}

/// the largest size of an image, in points: 35 m, far beyond any page
pub const MAX_IMAGE: f32 = 100_000.0;
/// the most quote bars an item has, nested quotes deep
pub const MAX_BARS: usize = 64;
/// the most characters of the label of a boxed item, of the title of a table
/// of contents, and of a text's hint
pub const MAX_LABEL: usize = 500;
/// the most entries of a table of contents, far more than a book has
pub const MAX_TOC_ENTRIES: usize = 10_000;

/// cuts `text` to at most `max` characters
fn truncate(text: &mut String, max: usize) {
    if let Some((end, _)) = text.char_indices().nth(max) {
        text.truncate(end);
    }
}

/// keeps at most MAX_BARS quote bars, each on the page
fn clamp_bars(bars: &mut Vec<f32>) {
    bars.truncate(MAX_BARS);
    for bar in bars {
        *bar = finite(*bar, 0.0, 0.0, MAX_PAGE);
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
    text[..text.floor_char_boundary(byte)]
        .encode_utf16()
        .count() as u32
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
        assert_eq!(first.text.style, TextKind::P);
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

    /// the paths of every key in a JSON value, arrays counted as one element
    fn keys(value: &serde_json::Value, path: &str, out: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, child) in map {
                    let path = format!("{path}.{key}");
                    keys(child, &path, out);
                    out.push(path);
                }
            }
            serde_json::Value::Array(list) => {
                for child in list {
                    keys(child, &format!("{path}[]"), out);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn reads_text_styles_by_their_names() {
        let style = |json: &str| serde_json::from_str::<Text>(json).unwrap().style;
        assert_eq!(style(r#"{"pos":0,"text":"a","style":"h2"}"#), TextKind::H2);
        assert_eq!(
            style(r#"{"pos":0,"text":"a","style":"code"}"#),
            TextKind::Code
        );
        // without a style, a paragraph
        assert_eq!(style(r#"{"pos":0,"text":"a"}"#), TextKind::P);
        // one Blank doesn't know is body text, as before
        assert_eq!(
            style(r#"{"pos":0,"text":"a","style":"h7"}"#),
            TextKind::Other
        );
        assert_eq!(style(r#"{"pos":0,"text":"a","style":""}"#), TextKind::Other);
        assert_eq!(Text::default().style, TextKind::Other);
        for name in ["p", "h1", "h6", "code", "th", "caption", "alt", "band"] {
            assert_eq!(TextKind::from(name).name(), name);
        }
        assert_eq!(
            crate::style::text_style(TextKind::Other),
            crate::style::text_style(TextKind::P)
        );
    }

    #[test]
    fn reads_every_key_the_webview_sends() {
        // what flatten and settingsOf send for a document that uses every
        // key (src/engine/contract.test.ts); a key serde doesn't know is
        // dropped without an error, so it is missing when written back
        let sent: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/engine/__fixtures__/contract.json"
        ))
        .unwrap();
        let items: Vec<Item> = serde_json::from_value(sent["items"].clone()).unwrap();
        let settings: Settings = serde_json::from_value(sent["settings"].clone()).unwrap();
        let read = serde_json::json!({ "items": items, "settings": settings });
        let (mut wanted, mut found) = (Vec::new(), Vec::new());
        keys(&sent, "", &mut wanted);
        keys(&read, "", &mut found);
        // a cell's paragraphs are written like text items, whose kind
        // they don't need
        let unread = |key: &String| key.ends_with(".paragraphs[].kind");
        let missing: Vec<_> = wanted
            .iter()
            .filter(|key| !found.contains(key) && !unread(key))
            .collect();
        assert!(
            missing.is_empty(),
            "keys the engine doesn't read: {missing:?}"
        );
        assert!(items.iter().any(|item| item.bars_continue));
    }
}
