//! A property test: random edits applied through `update` lay out as a
//! fresh engine lays out the same items, and pages that stay as they were
//! keep their versions.

use super::test_support::LONG;
use super::{Engine, Op, Page};
use crate::fonts::repository_fonts;
use crate::model::{Cell, Content, Item, Row, Settings, Text};

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
    /// width and height in points; 0 for not loaded
    Image(f32, f32),
    Table {
        rows: Vec<Vec<String>>,
        headers: usize,
        caption: Option<String>,
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
            ..Default::default()
        }),
        indent: 0.0,
        before: if level > 0 { 16.0 } else { 0.0 },
        after: if level > 0 { 5.0 } else { 8.0 },
        marker: None,
        bars: vec![],
        bars_continue: false,
    }
}

/// the items of the blocks, with positions as flatten.ts gives them: each
/// node takes its content's size and two for its tokens
fn to_items(specs: &[Spec]) -> Vec<Item> {
    let mut pos = 0u32;
    let mut items = vec![];
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
            Spec::Image(width, height) => {
                items.push(Item {
                    content: Content::Image {
                        pos,
                        src: format!("{width}x{height}.png"),
                        width: *width,
                        height: *height,
                        alt: "a picture".into(),
                    },
                    ..text_item(0, "", "p", 0, true)
                });
                pos += 1;
            }
            Spec::Table {
                rows,
                headers,
                caption,
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
                                let cell = Cell {
                                    paragraphs: vec![Text {
                                        pos: at + 2,
                                        text: text.clone(),
                                        ..Default::default()
                                    }],
                                    header: index < *headers,
                                    ..Default::default()
                                };
                                at += utf16(text) + 4;
                                cell
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
        13 => Spec::Break,
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
            }
        }
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
        } => {
            if random.chance(50) {
                Spec::Table {
                    rows,
                    headers,
                    caption: match caption {
                        Some(_) => None,
                        None => Some(random.words(3)),
                    },
                }
            } else {
                let headers = if headers > 0 { 0 } else { 1.min(rows.len()) };
                Spec::Table {
                    rows,
                    headers,
                    caption,
                }
            }
        }
        other @ (Spec::Break | Spec::Rule) => {
            let _ = other;
            random_spec(random, room)
        }
    };
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
        for step in 0..steps {
            let before_pages = engine.pages.clone();
            let before_frags = engine.frags.clone();
            let old_items = to_items(&specs);
            match random.below(10) {
                0..=2 => {
                    let at = random.below(specs.len() + 1);
                    specs.insert(at, random_spec(&mut random, room));
                }
                3 | 4 if specs.len() > 2 => {
                    let at = random.below(specs.len());
                    specs.remove(at);
                }
                _ if !specs.is_empty() => {
                    let at = random.below(specs.len());
                    restyle(&mut random, &mut specs[at], room);
                }
                _ => specs.push(random_spec(&mut random, room)),
            }
            let items = to_items(&specs);
            let (start, delete, inserted, shift) = change(&old_items, &items);
            let count = inserted.len();
            engine.update(start, delete, inserted, shift);
            let context =
                format!("run {run} step {step}: update({start}, {delete}, {count}, {shift})");

            // the shift moved every position the engine keeps
            assert_eq!(engine.items, items, "{context}");
            fresh.set_items(items);
            for (index, (laid, full)) in engine.laid.iter().zip(&fresh.laid).enumerate() {
                let a: Vec<u32> = laid.texts.iter().map(|text| text.pos).collect();
                let b: Vec<u32> = full.texts.iter().map(|text| text.pos).collect();
                assert_eq!(a, b, "{context}: item {index}");
            }
            // only the new items were laid out
            assert_eq!(engine.stats.laid_out, count, "{context}");

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
            // before shows what it showed then
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
            }
            // and a page that shows what it showed keeps its version, so it
            // isn't painted again: one whose fragments are the old page's,
            // of items that weren't laid out again, with the same bands
            let moved = |frag: &super::Frag| -> Option<super::Frag> {
                let item = if frag.item < start {
                    frag.item
                } else if frag.item >= start + delete {
                    frag.item + count - delete
                } else {
                    return None;
                };
                Some(super::Frag { item, ..*frag })
            };
            for (index, page) in engine.pages.iter().enumerate() {
                let Some(old) = before_pages.get(index) else {
                    continue;
                };
                let new_frags = &engine.frags[page.start..page.end];
                let old_frags: Vec<Option<super::Frag>> =
                    before_frags[old.start..old.end].iter().map(moved).collect();
                let same = new_frags.len() == old_frags.len()
                    && new_frags
                        .iter()
                        .zip(&old_frags)
                        .all(|(a, b)| Some(*a) == *b);
                if same && page.bands == old.bands {
                    assert_eq!(
                        page.version, old.version,
                        "{context}: page {index} was painted again"
                    );
                }
            }
            before_ops = ops;
        }
    }
}

/// how long an update takes at the end of a long document: one character
/// typed into a paragraph in its middle, 200 times. Run it in release:
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
        let started = std::time::Instant::now();
        const TIMES: usize = 200;
        for _ in 0..TIMES {
            let mut changed = items[middle].clone();
            if let Content::Text(text) = &mut changed.content {
                text.text.insert(0, 'x');
            }
            items[middle] = changed.clone();
            for item in &mut items[middle + 1..] {
                item.shift(1);
            }
            engine.update(middle, 1, vec![changed], 1);
        }
        let each = started.elapsed().as_secs_f64() * 1000.0 / TIMES as f64;
        println!("{pages} pages: {each:.3} ms per update");
    }
}
