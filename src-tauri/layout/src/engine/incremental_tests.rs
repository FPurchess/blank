//! A property test: random edits applied through `update` lay out as a
//! fresh engine lays out the same items, and pages that stay as they were
//! keep their versions.

use super::test_support::LONG;
use super::{Engine, Op, Page};
use crate::fonts::repository_fonts;
use crate::model::{
    Cell, CellBlock, CellText, Column, Content, Frame, Item, Row, Settings, Text, Track,
};

/// xorshift64, so the edits are the same on every run
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }

    fn chance(&mut self, percent: u64) -> bool {
        self.next() % 100 < percent
    }

    fn words(&mut self, count: usize) -> String {
        let words: Vec<&str> = LONG.split(' ').collect();
        (0..count)
            .map(|_| words[self.below(words.len())])
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// a block of the document, before it has positions
#[derive(Clone, Debug)]
enum Spec {
    Paragraph(String),
    Heading(u8, String),
    ListItem(String),
    Quote(String),
    Break,
    Rule,
    /// a content block shown as its label
    Boxed(String),
    /// a table of contents, to its depth
    Toc(u8),
    /// a paragraph that starts a new page, as a form can
    PageStart(String),
    /// width and height in points; 0 for not loaded
    Image(f32, f32),
    Table {
        rows: Vec<Vec<String>>,
        headers: usize,
        caption: Option<String>,
        /// cells of a list item and an image instead of a paragraph
        blocks: bool,
    },
    /// a band of a grid: its columns' paragraphs and headings (level 0 for
    /// a paragraph), side by side, the first a column of points
    Grid {
        columns: Vec<Vec<(u8, String)>>,
        page_start: bool,
    },
    /// a letter: its frames of paragraphs at (x, y), on a page of its own,
    /// then its paragraphs below `flow_top`
    Letter {
        frames: Vec<(f32, f32, Vec<String>)>,
        flow_top: f32,
        body: Vec<String>,
    },
}

fn utf16(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

fn text_item(pos: u32, text: &str, style: &str, level: u8, top: bool) -> Item {
    Item {
        content: Content::Text(Text {
            pos,
            text: text.into(),
            style: style.into(),
            level,
            top,
            listed: top && level > 0,
            ..Default::default()
        }),
        indent: 0.0,
        before: if level > 0 { 16.0 } else { 0.0 },
        after: if level > 0 { 5.0 } else { 8.0 },
        marker: None,
        bars: vec![],
        bars_continue: false,
        page_start: false,
        column: None,
        frame: None,
        flow_top: 0.0,
    }
}

/// the items of the blocks, with positions as flatten.ts gives them: each
/// node takes its content's size and two for its tokens
fn to_items(specs: &[Spec]) -> Vec<Item> {
    let mut pos = 0u32;
    let mut items = vec![];
    // what a table of contents lists: the headings, as flatten.ts gives
    // them to it
    let headings: Vec<(u8, String)> = specs
        .iter()
        .filter_map(|spec| match spec {
            Spec::Heading(level, text) => Some((*level, text.clone())),
            _ => None,
        })
        .collect();
    for spec in specs {
        match spec {
            Spec::Paragraph(text) => {
                items.push(text_item(pos + 1, text, "p", 0, true));
                pos += utf16(text) + 2;
            }
            Spec::Heading(level, text) => {
                items.push(text_item(pos + 1, text, &format!("h{level}"), *level, true));
                pos += utf16(text) + 2;
            }
            Spec::ListItem(text) => {
                // a list of one item of one paragraph
                let mut item = text_item(pos + 3, text, "p", 0, false);
                item.indent = 18.0;
                item.marker = Some("•".into());
                items.push(item);
                pos += utf16(text) + 6;
            }
            Spec::Quote(text) => {
                let mut item = text_item(pos + 2, text, "p", 0, false);
                item.indent = 12.0;
                item.bars = vec![0.0];
                items.push(item);
                pos += utf16(text) + 4;
            }
            Spec::Break => {
                items.push(Item {
                    content: Content::Break { pos },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Rule => {
                items.push(Item {
                    content: Content::Rule { pos },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Grid {
                columns,
                page_start,
            } => {
                // a form whose fields are the columns
                let tracks: Vec<Track> = (0..columns.len())
                    .map(|index| match index {
                        0 => Track { pt: 120.0, fr: 0.0 },
                        _ => Track {
                            pt: 0.0,
                            fr: index as f32,
                        },
                    })
                    .collect();
                let start = items.len();
                pos += 1;
                for (index, blocks) in columns.iter().enumerate() {
                    pos += 1;
                    for (level, text) in blocks {
                        let style = if *level > 0 {
                            format!("h{level}")
                        } else {
                            "p".into()
                        };
                        let mut item = text_item(pos + 1, text, &style, *level, false);
                        if let Content::Text(text) = &mut item.content {
                            text.listed = *level > 0;
                        }
                        item.column = Some(Column {
                            start: items.len() == start,
                            index: index as u32,
                            tracks: tracks.clone(),
                            gap: 12.0,
                            ..Default::default()
                        });
                        items.push(item);
                        pos += utf16(text) + 2;
                    }
                    pos += 1;
                }
                pos += 1;
                if let Some(first) = items.get_mut(start) {
                    first.page_start = *page_start;
                }
            }
            Spec::Letter {
                frames,
                flow_top,
                body,
            } => {
                let start = items.len();
                pos += 1;
                for (x, y, texts) in frames {
                    pos += 1;
                    for (index, text) in texts.iter().enumerate() {
                        let mut item = text_item(pos + 1, text, "p", 0, false);
                        item.frame = Some(Frame {
                            start: index == 0,
                            x: *x,
                            y: *y,
                            width: 160.0,
                            ..Default::default()
                        });
                        items.push(item);
                        pos += utf16(text) + 2;
                    }
                    pos += 1;
                }
                for (index, text) in body.iter().enumerate() {
                    pos += 1;
                    let mut item = text_item(pos + 1, text, "p", 0, false);
                    if index == 0 {
                        item.flow_top = *flow_top;
                    }
                    items.push(item);
                    pos += utf16(text) + 3;
                }
                pos += 1;
                if let Some(first) = items.get_mut(start) {
                    first.page_start = true;
                }
            }
            Spec::PageStart(text) => {
                let mut item = text_item(pos + 1, text, "p", 0, true);
                item.page_start = true;
                items.push(item);
                pos += utf16(text) + 2;
            }
            Spec::Toc(depth) => {
                items.push(Item {
                    content: Content::Toc {
                        pos,
                        title: "Contents".into(),
                        depth: *depth,
                        entries: headings
                            .iter()
                            .filter(|(level, _)| level <= depth)
                            .map(|(level, text)| crate::model::TocEntry {
                                level: *level,
                                text: text.clone(),
                            })
                            .collect(),
                    },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Boxed(label) => {
                items.push(Item {
                    content: Content::Boxed {
                        pos,
                        label: label.clone(),
                    },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Image(width, height) => {
                items.push(Item {
                    content: Content::Image {
                        pos,
                        src: format!("{width}x{height}.png"),
                        width: *width,
                        height: *height,
                        alt: "a picture".into(),
                        align: None,
                    },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Table {
                rows,
                headers,
                caption,
                blocks,
            } => {
                let start = pos;
                let mut at = start + 1;
                let rows = rows
                    .iter()
                    .enumerate()
                    .map(|(index, cells)| {
                        let row_start = at;
                        at += 1;
                        let cells = cells
                            .iter()
                            .map(|text| {
                                let paragraph = Text {
                                    pos: at + 2,
                                    text: text.clone(),
                                    ..Default::default()
                                };
                                if *blocks {
                                    // a list of one item, then an image
                                    let image = at + utf16(text) + 6;
                                    at += utf16(text) + 9;
                                    Cell {
                                        blocks: vec![
                                            CellBlock::Text(CellText {
                                                text: Text {
                                                    pos: paragraph.pos + 2,
                                                    ..paragraph
                                                },
                                                indent: 18.0,
                                                marker: Some("•".into()),
                                                bars: vec![],
                                            }),
                                            CellBlock::Image {
                                                pos: image,
                                                src: "cell.png".into(),
                                                width: 40.0 + (utf16(text) % 7) as f32 * 30.0,
                                                height: 30.0,
                                                alt: String::new(),
                                                indent: 0.0,
                                                marker: None,
                                                bars: vec![],
                                            },
                                        ],
                                        header: index < *headers,
                                        ..Default::default()
                                    }
                                } else {
                                    at += utf16(text) + 4;
                                    Cell {
                                        paragraphs: vec![paragraph],
                                        header: index < *headers,
                                        ..Default::default()
                                    }
                                }
                            })
                            .collect();
                        at += 1;
                        let _ = row_start;
                        Row {
                            cells,
                            header: index < *headers,
                        }
                    })
                    .collect();
                pos = at + 1;
                items.push(Item {
                    content: Content::Table {
                        pos: start,
                        end: pos,
                        rows,
                        widths: vec![],
                        caption: caption.clone(),
                    },
                    ..text_item(0, "", "p", 0, true)
                });
            }
        }
    }
    items
}

fn random_spec(random: &mut Random, room: f32) -> Spec {
    match random.below(20) {
        0..=6 => {
            let count = 1 + random.below(90);
            Spec::Paragraph(random.words(count))
        }
        7..=9 => {
            let count = 1 + random.below(6);
            Spec::Heading(1 + random.below(3) as u8, random.words(count))
        }
        10 | 11 => {
            let count = 1 + random.below(30);
            Spec::ListItem(random.words(count))
        }
        12 => {
            let count = 1 + random.below(30);
            Spec::Quote(random.words(count))
        }
        13 if random.chance(40) => Spec::Toc(1 + random.below(3) as u8),
        13 if random.chance(50) => random_grid(random),
        13 if random.chance(50) => random_letter(random),
        13 if random.chance(40) => {
            let count = 1 + random.below(30);
            Spec::PageStart(random.words(count))
        }
        13 => Spec::Break,
        14 if random.chance(50) => {
            let count = 1 + random.below(20);
            Spec::Boxed(random.words(count))
        }
        14 => Spec::Rule,
        15 | 16 => {
            if random.chance(20) {
                Spec::Image(0.0, 0.0)
            } else {
                let height = 20.0 + random.below((room * 1.2) as usize) as f32;
                Spec::Image(200.0 + random.below(300) as f32, height)
            }
        }
        _ => {
            let columns = 1 + random.below(3);
            let count = 1 + random.below(12);
            let tall = random.chance(15);
            let rows = (0..count)
                .map(|row| {
                    (0..columns)
                        .map(|_| {
                            let words = if tall && row == count / 2 {
                                400 + random.below(400)
                            } else {
                                1 + random.below(12)
                            };
                            random.words(words)
                        })
                        .collect()
                })
                .collect();
            Spec::Table {
                rows,
                headers: random.below(3).min(count),
                caption: random.chance(50).then(|| random.words(4)),
                blocks: random.chance(30),
            }
        }
    }
}

/// a band of a grid of one to three columns of a few blocks, some of them
/// longer than a page
fn random_grid(random: &mut Random) -> Spec {
    let columns = (0..1 + random.below(3))
        .map(|_| {
            (0..1 + random.below(4))
                .map(|_| {
                    let words = if random.chance(10) {
                        300 + random.below(400)
                    } else {
                        1 + random.below(60)
                    };
                    let level = if random.chance(20) {
                        1 + random.below(3) as u8
                    } else {
                        0
                    };
                    (level, random.words(words))
                })
                .collect()
        })
        .collect();
    Spec::Grid {
        columns,
        page_start: random.chance(20),
    }
}

/// a letter of one to three frames of a few lines and a body
fn random_letter(random: &mut Random) -> Spec {
    let frames = (0..1 + random.below(3))
        .map(|_| {
            let x = 40.0 + random.below(350) as f32;
            let y = 60.0 + random.below(300) as f32;
            let lines = (0..1 + random.below(4))
                .map(|_| {
                    let count = 1 + random.below(12);
                    random.words(count)
                })
                .collect();
            (x, y, lines)
        })
        .collect();
    let body = (0..1 + random.below(4))
        .map(|_| {
            let count = 1 + random.below(200);
            random.words(count)
        })
        .collect();
    Spec::Letter {
        frames,
        flow_top: random.below(400) as f32,
        body,
    }
}

/// changes one block, as editing it would
fn restyle(random: &mut Random, spec: &mut Spec, room: f32) {
    *spec = match spec.clone() {
        Spec::Paragraph(text) if random.chance(50) => {
            Spec::Heading(1 + random.below(3) as u8, text)
        }
        Spec::Paragraph(text) | Spec::ListItem(text) | Spec::Quote(text) => {
            // type a word somewhere in it
            let mut words: Vec<String> = text.split(' ').map(String::from).collect();
            let at = random.below(words.len() + 1);
            words.insert(at, random.words(1));
            Spec::Paragraph(words.join(" "))
        }
        Spec::Heading(level, text) => {
            if random.chance(50) {
                Spec::Paragraph(text)
            } else {
                Spec::Heading(if level == 1 { 2 } else { 1 }, text)
            }
        }
        Spec::Image(width, height) => {
            if random.chance(30) {
                Spec::Image(0.0, 0.0)
            } else {
                let _ = (width, height);
                Spec::Image(
                    100.0 + random.below(400) as f32,
                    20.0 + random.below((room * 1.1) as usize) as f32,
                )
            }
        }
        Spec::Table {
            rows,
            headers,
            caption,
            blocks,
        } => {
            if random.chance(50) {
                Spec::Table {
                    rows,
                    headers,
                    caption: match caption {
                        Some(_) => None,
                        None => Some(random.words(3)),
                    },
                    blocks,
                }
            } else {
                let headers = if headers > 0 { 0 } else { 1.min(rows.len()) };
                Spec::Table {
                    rows,
                    headers,
                    caption,
                    blocks,
                }
            }
        }
        Spec::Grid {
            mut columns,
            page_start,
        } => {
            // type a word into one of its blocks, or make another band
            if random.chance(30) {
                random_grid(random)
            } else {
                let column = random.below(columns.len());
                let block = random.below(columns[column].len());
                let (_, text) = &mut columns[column][block];
                text.push(' ');
                let count = 1 + random.below(40);
                text.push_str(&random.words(count));
                Spec::Grid {
                    columns,
                    page_start,
                }
            }
        }
        Spec::Letter {
            mut frames,
            flow_top,
            mut body,
        } => {
            // type a word into a frame or the body
            let count = 1 + random.below(30);
            let words = random.words(count);
            if random.chance(50) {
                let frame = random.below(frames.len());
                let line = random.below(frames[frame].2.len());
                frames[frame].2[line].push(' ');
                frames[frame].2[line].push_str(&words);
            } else {
                let line = random.below(body.len());
                body[line].push(' ');
                body[line].push_str(&words);
            }
            Spec::Letter {
                frames,
                flow_top,
                body,
            }
        }
        other @ (Spec::Break | Spec::Rule | Spec::Boxed(_) | Spec::Toc(_) | Spec::PageStart(_)) => {
            let _ = other;
            random_spec(random, room)
        }
    };
}

/// the page numbers of tables of contents each page shows
fn all_numbers(engine: &Engine) -> Vec<Vec<String>> {
    (0..engine.pages.len())
        .map(|page| {
            engine
                .body_parts(page)
                .into_iter()
                .filter_map(|(op, part)| match (op, part) {
                    (Op::Glyphs { run, text, .. }, super::Part::TocNumber { .. }) => {
                        let from = run.glyphs.first()?.start as usize;
                        let to = run.glyphs.last()?.end as usize;
                        Some(text[from..to].to_string())
                    }
                    _ => None,
                })
                .collect()
        })
        .collect()
}

/// the change from one list of items to another, as update takes it: the
/// items between their common start and end, and how far the end moved
fn change(old: &[Item], new: &[Item]) -> (usize, usize, Vec<Item>, i64) {
    let size = |items: &[Item]| items.last().map(|item| item.to() as i64).unwrap_or(0);
    let shift = size(new) - size(old);
    let prefix = old.iter().zip(new).take_while(|(a, b)| a == b).count();
    let most = old.len().min(new.len()) - prefix;
    let suffix = old
        .iter()
        .rev()
        .zip(new.iter().rev())
        .take(most)
        .take_while(|(a, b)| {
            let mut moved = (*a).clone();
            moved.shift(shift);
            moved == **b
        })
        .count();
    (
        prefix,
        old.len() - prefix - suffix,
        new[prefix..new.len() - suffix].to_vec(),
        shift,
    )
}

fn all_ops(engine: &mut Engine) -> Vec<Vec<Op>> {
    (0..engine.pages.len())
        .map(|page| engine.page_ops(page, true))
        .collect()
}

fn layout_of(page: &Page) -> (usize, usize, Option<(usize, usize)>, f32, [String; 6]) {
    (
        page.start,
        page.end,
        page.first,
        page.bottom,
        page.bands.clone(),
    )
}

fn settings_for(run: u64) -> Settings {
    let mut settings = Settings::default();
    if run % 2 == 1 {
        settings.new_page_before = vec![1];
    }
    if run % 3 != 2 {
        settings.footer.center = "{page} of {pages}".into();
        settings.header.right = "{chapter}".into();
    }
    if run % 4 == 3 {
        // a small page, so there are many of them
        settings.height = 420.0;
    }
    settings
}

/// one random edit of the blocks
fn edit(random: &mut Random, specs: &mut Vec<Spec>, room: f32) {
    match random.below(10) {
        0..=2 => {
            let at = random.below(specs.len() + 1);
            specs.insert(at, random_spec(random, room));
        }
        3 | 4 if specs.len() > 2 => {
            let at = random.below(specs.len());
            specs.remove(at);
        }
        _ if !specs.is_empty() => {
            let at = random.below(specs.len());
            restyle(random, &mut specs[at], room);
        }
        _ => specs.push(random_spec(random, room)),
    }
}

fn first_to_last(indices: impl Iterator<Item = usize>) -> std::ops::Range<usize> {
    let indices: Vec<usize> = indices.collect();
    match (indices.first(), indices.last()) {
        (Some(&first), Some(&last)) => first..last + 1,
        _ => 0..0,
    }
}

#[test]
fn incremental_equals_full() {
    const RUNS: u64 = 4;
    // more for a longer search: BLANK_PROPERTY_STEPS=2000 cargo test --release
    let steps: usize = std::env::var("BLANK_PROPERTY_STEPS")
        .ok()
        .and_then(|steps| steps.parse().ok())
        .unwrap_or(25);
    for run in 0..RUNS {
        let mut random = Random(0x9e37_79b9_7f4a_7c15 ^ (run + 1));
        let settings = settings_for(run);
        let room = settings.content_bottom() - settings.content_top();
        let mut specs: Vec<Spec> = (0..24).map(|_| random_spec(&mut random, room)).collect();
        let mut engine = Engine::new(repository_fonts());
        engine.set_settings(settings.clone());
        engine.set_items(to_items(&specs));
        let mut fresh = Engine::new(repository_fonts());
        fresh.set_settings(settings.clone());
        let mut before_ops = all_ops(&mut engine);
        let mut before_numbers = all_numbers(&engine);
        for step in 0..steps {
            let before_pages = engine.pages.clone();
            let before_frags = engine.frags.clone();
            // one edit through update, or a few at once through update_many:
            // in document order mostly, and sometimes not
            let edits = if random.chance(25) {
                2 + random.below(2)
            } else {
                1
            };
            let mut entries = vec![];
            let mut current = to_items(&specs);
            // the index each item had before the step, None for new ones
            let mut old_index: Vec<Option<usize>> = (0..current.len()).map(Some).collect();
            for _ in 0..edits {
                edit(&mut random, &mut specs, room);
                let items = to_items(&specs);
                let entry = change(&current, &items);
                old_index.splice(entry.0..entry.0 + entry.1, vec![None; entry.2.len()]);
                entries.push(entry);
                current = items;
            }
            let items = current;
            let described: Vec<String> = entries
                .iter()
                .map(|(start, delete, inserted, shift)| {
                    format!("({start}, {delete}, {}, {shift})", inserted.len())
                })
                .collect();
            let count: usize = entries.iter().map(|entry| entry.2.len()).sum();
            let context = format!("run {run} step {step}: update {}", described.join(" "));
            let changes = if entries.len() == 1 {
                let (start, delete, inserted, shift) = entries.pop().unwrap();
                engine.update(start, delete, inserted, shift)
            } else {
                engine.update_many(entries)
            };

            // the shift moved every position the engine keeps
            // (but the bands, which the engine numbers itself)
            let unnumbered = |items: &[Item]| {
                let mut items = items.to_vec();
                for item in &mut items {
                    if let Some(column) = &mut item.column {
                        column.band = 0;
                    }
                    if let Some(frame) = &mut item.frame {
                        frame.id = 0;
                    }
                }
                items
            };
            assert_eq!(unnumbered(&engine.items), items, "{context}");
            fresh.set_items(items);
            for (index, (laid, full)) in engine.laid.iter().zip(&fresh.laid).enumerate() {
                let a: Vec<u32> = laid.texts.iter().map(|text| text.pos).collect();
                let b: Vec<u32> = full.texts.iter().map(|text| text.pos).collect();
                assert_eq!(a, b, "{context}: item {index}");
                assert_eq!(
                    laid.cell_images, full.cell_images,
                    "{context}: item {index}"
                );
            }
            // only the new items were laid out
            assert_eq!(engine.stats.laid_out, count, "{context}");
            // and what no font has is counted as they come and go (in the
            // order the characters came, which after edits isn't the
            // document's)
            let sorted = |mut chars: Vec<char>| {
                chars.sort();
                chars
            };
            assert_eq!(
                sorted(engine.missing()),
                sorted(fresh.missing()),
                "{context}"
            );

            // the pages are what a fresh layout gives
            if let Some(at) = (0..engine.frags.len().max(fresh.frags.len()))
                .find(|&index| engine.frags.get(index) != fresh.frags.get(index))
            {
                panic!(
                    "{context}: fragment {at} is {:?}, a fresh layout has {:?}",
                    engine.frags.get(at),
                    fresh.frags.get(at)
                );
            }
            assert_eq!(
                engine.pages.iter().map(layout_of).collect::<Vec<_>>(),
                fresh.pages.iter().map(layout_of).collect::<Vec<_>>(),
                "{context}"
            );
            let ops = all_ops(&mut engine);
            assert!(
                ops == all_ops(&mut fresh),
                "{context}: the display lists differ"
            );

            // a version stands for what a page shows: one that was there
            // before shows what it showed then. The body version for the
            // page without its bands, the band version for the bands.
            let body = |page: &Page, ops: &[Op]| {
                let _ = page;
                ops.iter()
                    .filter(|op| {
                        !matches!(
                            op,
                            Op::Glyphs {
                                role: crate::items::Role::Band,
                                ..
                            }
                        )
                    })
                    .cloned()
                    .collect::<Vec<Op>>()
            };
            for (index, page) in engine.pages.iter().enumerate() {
                if let Some(old) = before_pages
                    .iter()
                    .position(|old| old.version == page.version)
                {
                    assert!(
                        ops[index] == before_ops[old],
                        "{context}: page {index} kept the version of page {old}, which showed something else"
                    );
                }
                if let Some(old) = before_pages
                    .iter()
                    .position(|old| old.body_version == page.body_version)
                {
                    assert!(
                        body(page, &ops[index]) == body(&before_pages[old], &before_ops[old]),
                        "{context}: page {index} kept the body version of page {old}, whose body was another"
                    );
                }
                if let Some(old) = before_pages
                    .iter()
                    .position(|old| old.band_version == page.band_version)
                {
                    assert_eq!(
                        page.bands, before_pages[old].bands,
                        "{context}: page {index} kept the band version of page {old}"
                    );
                }
            }
            // and a page that shows what it showed keeps its versions, so it
            // isn't painted again: one whose fragments are the old page's,
            // of items that weren't laid out again, keeps its body, and with
            // the same bands its version too
            let moved = |frag: &super::Frag| -> Option<usize> {
                old_index.get(frag.item).copied().flatten()
            };
            let numbers = all_numbers(&engine);
            for (index, page) in engine.pages.iter().enumerate() {
                let Some(old) = before_pages.get(index) else {
                    continue;
                };
                let new_frags = &engine.frags[page.start..page.end];
                let old_frags = &before_frags[old.start..old.end];
                let same = new_frags.len() == old_frags.len()
                    && new_frags.iter().zip(old_frags).all(|(a, b)| {
                        moved(a) == Some(b.item)
                            && (a.unit, a.y, a.repeat) == (b.unit, b.y, b.repeat)
                    });
                // and the page numbers of tables of contents on it, which
                // are set in after paginating, are as before
                if same && numbers.get(index) == before_numbers.get(index) {
                    assert_eq!(
                        page.body_version, old.body_version,
                        "{context}: page {index}'s body was painted again"
                    );
                    if page.bands == old.bands {
                        assert_eq!(
                            page.version, old.version,
                            "{context}: page {index} was painted again"
                        );
                    }
                }
            }
            // the ranges it reports are the pages whose versions changed
            let differ = |version: fn(&Page) -> u32| {
                first_to_last((0..engine.pages.len()).filter(|&index| {
                    before_pages.get(index).map(version) != Some(version(&engine.pages[index]))
                }))
            };
            assert_eq!(
                changes.body,
                differ(|page| page.body_version),
                "{context}: body"
            );
            assert_eq!(
                changes.bands,
                differ(|page| page.band_version),
                "{context}: bands"
            );
            before_ops = ops;
            before_numbers = numbers;
        }
    }
}

/// a document that fills its pages, with `{page} of {pages}` in the footer
fn numbered(paragraphs: usize) -> (Engine, Vec<Item>) {
    use super::test_support::document;
    let mut settings = Settings::default();
    settings.footer.center = "{page} of {pages}".into();
    let items = document(&vec![LONG; paragraphs]);
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings);
    engine.set_items(items.clone());
    (engine, items)
}

#[test]
fn a_new_page_changes_only_the_bands_of_the_others() {
    let (mut engine, items) = numbered(40);
    let before = engine.pages.clone();
    // paragraphs at the end until there is a page more
    let mut added = 0;
    let mut pos = items.last().unwrap().to() + 1;
    let mut changes = Default::default();
    while engine.pages.len() == before.len() {
        changes = engine.update(
            items.len() + added,
            0,
            vec![super::test_support::paragraph(pos + 1, LONG)],
            0,
        );
        pos += LONG.len() as u32 + 2;
        added += 1;
    }
    let pages = engine.pages.len();
    assert_eq!(pages, before.len() + 1);
    let last = before.len() - 1;
    for (index, (page, old)) in engine.pages.iter().zip(&before[..last]).enumerate() {
        assert_eq!(page.body_version, old.body_version);
        assert_ne!(page.band_version, old.band_version);
        assert_ne!(page.version, old.version);
        assert_eq!(page.bands[4], format!("{} of {pages}", index + 1));
    }
    // every band changed, and the bodies from the page the paragraphs went on
    assert_eq!(changes.bands, 0..pages);
    assert!(
        changes.body.start >= last && changes.body.end == pages,
        "{changes:?}"
    );
}

#[test]
fn new_bands_keep_the_bodies() {
    let (mut engine, _) = numbered(30);
    let before = engine.pages.clone();
    let mut settings = engine.settings.clone();
    settings.header.left = "Draft".into();
    let changes = engine.set_settings(settings);
    for (page, old) in engine.pages.iter().zip(&before) {
        assert_eq!(page.body_version, old.body_version);
        assert_ne!(page.band_version, old.band_version);
    }
    assert_eq!(changes.body, 0..0);
    assert_eq!(changes.bands, 0..before.len());
}

#[test]
fn a_new_font_changes_every_body() {
    // the screen caches a page's body by its version, so every page whose
    // glyphs could change with a font must get a new one
    let (mut engine, _) = numbered(30);
    let before = engine.pages.clone();
    let dejavu = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fonts/dejavu-sans.ttf"
    ))
    .unwrap();
    let changes = engine.add_font(dejavu, "DejaVu Sans");
    for (page, old) in engine.pages.iter().zip(&before) {
        assert_ne!(page.body_version, old.body_version);
        assert_ne!(page.version, old.version);
    }
    assert_eq!(changes.body, 0..engine.pages.len());
}

#[test]
fn update_many_ending_in_a_deletion_at_the_end() {
    // the unchanged items between the changes aren't a tail that settles:
    // the old pages after them still hold the deleted last item
    use super::test_support::{document, engine, paragraph};
    let items = document(&[LONG; 60]);
    let mut incremental = engine(items.clone());
    let mut changed = items[5].clone();
    if let Content::Text(text) = &mut changed.content {
        text.text.insert(0, 'x');
    }
    let last = items[59].to() - items[59].from() + 2;
    incremental.update_many(vec![
        (5, 1, vec![changed.clone()], 1),
        (59, 1, vec![], -(last as i64)),
    ]);
    let mut expected = items;
    expected[5] = changed;
    expected.pop();
    for item in &mut expected[6..] {
        item.shift(1);
    }
    let full = engine(expected.clone());
    assert_eq!(incremental.items, expected);
    assert_eq!(incremental.frags, full.frags);
    let _ = paragraph;
}

#[test]
fn splices_runs_of_items() {
    let mut runs = vec![(10, Some(0))];
    super::splice_runs(&mut runs, 3, 2, 1);
    assert_eq!(runs, [(3, Some(0)), (1, None), (5, Some(5))]);
    // an update after it counts the items as the first left them
    super::splice_runs(&mut runs, 6, 0, 2);
    assert_eq!(
        runs,
        [
            (3, Some(0)),
            (1, None),
            (2, Some(5)),
            (2, None),
            (3, Some(7))
        ]
    );
    super::splice_runs(&mut runs, 0, 11, 0);
    assert_eq!(runs, []);
}

/// how long an update takes at the end of a long document: one character
/// typed into a paragraph in its middle, the best of 5 runs of 40, as the
/// machine may be busy. Only the engine's work is timed. Run it in release:
/// cargo test --release -p blank-layout --lib update_timing -- --ignored --nocapture
#[test]
#[ignore]
fn update_timing() {
    use super::test_support::{document, engine};
    for paragraphs in [8, 480, 2460, 10150] {
        let mut items = document(&vec![LONG; paragraphs]);
        let mut engine = engine(items.clone());
        let pages = engine.pages.len();
        let middle = paragraphs / 2;
        let mut best = f64::MAX;
        for _ in 0..5 {
            const TIMES: usize = 40;
            // the typed paragraph, made before, so only the engine is timed;
            // it keeps its position, the ones after it move
            let typed: Vec<Item> = (0..TIMES)
                .map(|_| {
                    if let Content::Text(text) = &mut items[middle].content {
                        text.text.insert(0, 'x');
                    }
                    items[middle].clone()
                })
                .collect();
            let started = std::time::Instant::now();
            for changed in typed {
                engine.update(middle, 1, vec![changed], 1);
            }
            best = best.min(started.elapsed().as_secs_f64() * 1000.0 / TIMES as f64);
        }
        println!("{pages} pages: {best:.3} ms per update");
    }
}

/// a document of 200 paragraphs with a chapter heading every 20
fn chapters(settings: Settings) -> (Engine, Vec<Item>) {
    use super::test_support::{heading, paragraph};
    let mut items = vec![];
    let mut pos = 0u32;
    for index in 0..200 {
        let item = if index % 20 == 0 {
            heading(pos + 1, 1, "Chapter")
        } else {
            paragraph(pos + 1, LONG)
        };
        pos = item.to() + 1;
        items.push(item);
    }
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings);
    engine.set_items(items.clone());
    (engine, items)
}

/// types a letter into item `index`'s text
fn type_into(engine: &mut Engine, items: &[Item], index: usize) {
    let mut changed = items[index].clone();
    if let Content::Text(text) = &mut changed.content {
        text.text.insert(0, 'x');
    }
    engine.update(index, 1, vec![changed], 1);
}

#[test]
fn redoes_the_bands_only_where_they_change() {
    // typing into a chapter heading changes the chapters: the bands of
    // every page are written again only if a slot shows {chapter}
    let mut numbers = Settings::default();
    numbers.footer.center = "{page}".into();
    let (mut engine, items) = chapters(numbers);
    let pages = engine.pages.len();
    assert!(pages > 10);
    type_into(&mut engine, &items, 100);
    assert!(
        engine.stats.bands_expanded <= 3,
        "{}",
        engine.stats.bands_expanded
    );
    let mut running = Settings::default();
    running.header.left = "{chapter}".into();
    let (mut engine, items) = chapters(running);
    type_into(&mut engine, &items, 100);
    assert_eq!(engine.stats.bands_expanded, engine.pages.len());
}

#[test]
fn leaves_the_fragments_after_a_change_in_place() {
    // typing into a paragraph moves no item: the fragments after it aren't
    // rewritten, only spliced around
    let (mut engine, items) = chapters(Settings::default());
    type_into(&mut engine, &items, 101);
    assert!(engine.stats.settled_at.is_some());
    assert_eq!(engine.stats.frags_rewritten, 0);
    // a new paragraph moves the items after it
    engine.update(
        50,
        0,
        vec![super::test_support::paragraph(items[50].from(), "new")],
        5,
    );
    assert!(engine.stats.frags_rewritten > 0);
}
