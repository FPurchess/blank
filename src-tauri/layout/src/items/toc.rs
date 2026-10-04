//! A table of contents: a title, then an entry per heading, indented by
//! its level, with dot leaders to the page it starts on. The page numbers
//! aren't known until the pages are, so the entries leave a column for
//! them, as wide as the widest number a page of the document shows, and
//! the engine sets them in after paginating (see `Engine::set_toc_numbers`).

use std::collections::HashMap;

use parley::Alignment;

use super::{Deco, Laid, Role, Unit};
use crate::bands::{format_number, page_number};
use crate::fonts::Fonts;
use crate::model::{Settings, Text, TocEntry};
use crate::text::TextBox;

/// how far each level is indented from the one above it, in points
const LEVEL_INDENT: f32 = 12.0;
/// the room between an entry's text, its leaders and its page number
const NUMBER_GAP: f32 = 12.0;
/// the space between the title and the entries, and between entries
const TITLE_GAP: f32 = 8.0;
const ENTRY_GAP: f32 = 2.0;
/// the leader dots: their size and how far apart they are
const DOT: f32 = 0.9;
const DOT_STEP: f32 = 4.0;
/// the pages the number column is wide enough for: far more than a
/// document has, and with page numbers that start later still enough
const NUMBERED_PAGES: usize = 999;

/// the laid out table of contents, for the engine to set in the page
/// numbers: where their column is, and each entry's unit and baseline
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TocLaid {
    /// the left of the column, in the item's coordinates, and its width
    pub x: f32,
    pub width: f32,
    pub entries: Vec<TocLine>,
}

impl TocLaid {
    /// the entry drawn with `unit`, if one is
    pub fn entry_at(&self, unit: usize) -> Option<usize> {
        self.entries
            .binary_search_by_key(&unit, |line| line.unit)
            .ok()
    }
}

/// an entry as laid out: the unit it is drawn with, where its last line's
/// text ends and that line's baseline, in the item's coordinates, and its
/// style
#[derive(Clone, Debug, PartialEq)]
pub struct TocLine {
    pub unit: usize,
    pub end: f32,
    pub baseline: f32,
    pub style: &'static str,
}

/// the leader dots of an entry, in the item's coordinates: from where its
/// text ends to where its page number starts, on a grid of their own, so
/// they line up from entry to entry
pub fn leaders(line: &TocLine, number_x: f32) -> Vec<Deco> {
    let mut dots = vec![];
    let mut dot = ((line.end + NUMBER_GAP / 2.0) / DOT_STEP).ceil() * DOT_STEP;
    while dot + DOT <= number_x - NUMBER_GAP / 2.0 {
        dots.push(Deco::Rect {
            x: dot,
            y: line.baseline - DOT,
            w: DOT,
            h: DOT,
            role: Role::Text,
        });
        dot += DOT_STEP;
    }
    dots
}

/// the style of an entry, and of its page number
fn entry_style(level: u8) -> &'static str {
    if level <= 1 {
        "toc1"
    } else {
        "p"
    }
}

/// what an entry's page number is a text box of
pub fn number_text(label: &str, style: &str) -> Text {
    Text {
        pos: 0,
        text: label.to_string(),
        style: style.into(),
        ..Default::default()
    }
}

/// the width of the widest page number a page of the document shows, in
/// the styles of the entries: the sum of its characters' widths, which
/// are measured once each
fn number_width(fonts: &mut Fonts, settings: &Settings, styles: &[&str]) -> f32 {
    let mut widths: HashMap<(char, &str), f32> = HashMap::new();
    let mut widest = 0.0f32;
    for page in 1..=NUMBERED_PAGES {
        let label = format_number(page_number(settings, page), &settings.number_style);
        for &style in styles {
            let width: f32 = label
                .chars()
                .map(|char| {
                    *widths.entry((char, style)).or_insert_with(|| {
                        let text = number_text(&char.to_string(), style);
                        TextBox::new(fonts, &text, 1000.0, Alignment::Start)
                            .layout
                            .width()
                    })
                })
                .sum();
            widest = widest.max(width);
        }
    }
    widest
}

/// lays out a table of contents in `inner`, from `indent`
pub fn toc_units(
    fonts: &mut Fonts,
    title: &str,
    entries: &[TocEntry],
    indent: f32,
    inner: f32,
    settings: &Settings,
) -> Laid {
    let mut laid = Laid::default();
    let mut y = 0.0;
    if !title.is_empty() {
        let text = Text {
            pos: 0,
            text: title.to_string(),
            style: "toc-title".into(),
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, inner, Alignment::Start);
        boxed.x = indent;
        let height = boxed.height() + TITLE_GAP;
        laid.label = Some(boxed);
        laid.units.push(Unit {
            top: 0.0,
            height,
            // a title never ends a page: entries or the hint follow it
            keep_next: true,
            ..Default::default()
        });
        y = height;
    }
    let mut styles: Vec<&str> = entries
        .iter()
        .map(|entry| entry_style(entry.level))
        .collect();
    styles.sort_unstable();
    styles.dedup();
    let column = number_width(fonts, settings, &styles);
    let column_x = indent + inner - column;
    let mut lines = vec![];
    for entry in entries {
        let style = entry_style(entry.level);
        let left = indent + LEVEL_INDENT * f32::from(entry.level.saturating_sub(1));
        let width = (column_x - NUMBER_GAP - left).max(20.0);
        let text = Text {
            pos: 0,
            text: entry.text.clone(),
            style: style.into(),
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, width, Alignment::Start);
        boxed.x = left;
        boxed.y = y;
        let (end, baseline) = match boxed.lines().last() {
            Some(line) => {
                let index = boxed.line_count() - 1;
                let advance = boxed
                    .layout
                    .get(index)
                    .map_or(0.0, |line| line.metrics().advance);
                (left + advance, y + line.baseline)
            }
            None => (left, y + boxed.height()),
        };
        let height = boxed.height() + ENTRY_GAP;
        lines.push(TocLine {
            unit: laid.units.len(),
            end,
            baseline,
            style,
        });
        laid.units.push(Unit {
            top: y,
            height,
            extras: laid.extras.len()..laid.extras.len() + 1,
            ..Default::default()
        });
        laid.extras.push((boxed, Role::Text));
        y += height;
    }
    if entries.is_empty() {
        // what it will hold, faint, until the document has headings, on
        // the screen only (Part::Hint), as the editor's own view says it
        // (src/editor/plugins/toc.ts)
        let text = Text {
            pos: 0,
            text: "The headings of the document will be listed here".into(),
            style: "alt".into(),
            ..Default::default()
        };
        let mut boxed = TextBox::new(fonts, &text, inner, Alignment::Start);
        boxed.x = indent;
        boxed.y = y;
        laid.units.push(Unit {
            top: y,
            height: boxed.height(),
            extras: 0..1,
            ..Default::default()
        });
        laid.extras.push((boxed, Role::Hint));
    }
    laid.toc = Some(TocLaid {
        x: column_x,
        width: column,
        entries: lines,
    });
    laid
}
