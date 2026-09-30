//! The PDF holds what the engine laid out: every word on the page, line and
//! spot the layout put it. Reads the PDF back with pdftotext (poppler).

use std::process::Command;

use blank_layout::engine::{Engine, Word};
use blank_layout::fonts::repository_fonts;
use blank_layout::model::{Content, Item, Settings, Span, Text};
use blank_layout::pdf::{write, Info};

fn text_item(pos: u32, text: &str, style: &str, level: u8, spans: Vec<Span>) -> Item {
    Item {
        content: Content::Text(Text {
            pos,
            text: text.into(),
            spans,
            style: style.into(),
            level,
            top: true,
        }),
        indent: 0.0,
        before: if level > 0 { 16.0 } else { 0.0 },
        after: if level > 0 { 5.0 } else { 8.0 },
        marker: None,
        bars: vec![],
        bars_continue: false,
    }
}

/// a document of chapters with styled paragraphs, lists and a page break
pub fn sample() -> Vec<Item> {
    let body = "Writing is thinking on paper. The quick brown fox jumps over the lazy dog, \
                and every line of this paragraph must end where the layout says it ends, \
                on the screen and in the PDF alike, whatever the width of the page.";
    let mut items = vec![];
    let mut pos = 0u32;
    fn push(
        pos: &mut u32,
        text: &str,
        style: &str,
        level: u8,
        spans: Vec<Span>,
        items: &mut Vec<Item>,
    ) {
        items.push(text_item(*pos + 1, text, style, level, spans));
        *pos += text.encode_utf16().count() as u32 + 2;
    }
    for chapter in 1..=6 {
        push(
            &mut pos,
            &format!("Chapter {chapter}"),
            "h1",
            1,
            vec![],
            &mut items,
        );
        for paragraph in 0..8 {
            let spans = vec![
                Span {
                    from: 0,
                    to: 7,
                    bold: true,
                    ..Default::default()
                },
                Span {
                    from: 11,
                    to: 19,
                    italic: true,
                    ..Default::default()
                },
                Span {
                    from: 30,
                    to: 39,
                    link: Some("https://example.com".into()),
                    ..Default::default()
                },
            ];
            push(
                &mut pos,
                &format!("{body} ({chapter}.{paragraph})"),
                "p",
                0,
                spans,
                &mut items,
            );
        }
        push(&mut pos, "A section", "h2", 2, vec![], &mut items);
        let mut item = text_item(pos + 1, body, "p", 0, vec![]);
        item.indent = 18.0;
        item.marker = Some("•".into());
        items.push(item);
        pos += body.len() as u32 + 4;
        if chapter == 3 {
            items.push(Item {
                content: Content::Break { pos },
                ..text_item(0, "", "p", 0, vec![])
            });
            pos += 1;
        }
    }
    items
}

fn settings() -> Settings {
    let mut settings = Settings::default();
    settings.header.left = "{title}".into();
    settings.header.right = "{chapter}".into();
    settings.footer.center = "Page {page} of {pages}".into();
    settings.first_page = blank_layout::model::FirstPage::Named("plain".into());
    settings.fields.title = "Sample".into();
    settings
}

/// the words pdftotext finds in a PDF: page, xMin, yMin, xMax, yMax, text
fn read_words(pdf: &std::path::Path) -> Option<Vec<(usize, f32, f32, f32, f32, String)>> {
    let out = pdf.with_extension("html");
    let status = Command::new("pdftotext")
        .arg("-bbox")
        .arg(pdf)
        .arg(&out)
        .status()
        .ok()?;
    assert!(status.success());
    let html = std::fs::read_to_string(&out).unwrap();
    let mut words = vec![];
    let mut page = 0;
    for line in html.lines() {
        let line = line.trim();
        if line.starts_with("<page") {
            page += 1;
        }
        let Some(rest) = line.strip_prefix("<word ") else {
            continue;
        };
        let attr = |name: &str| -> f32 {
            let start = rest.find(&format!("{name}=\"")).unwrap() + name.len() + 2;
            let end = start + rest[start..].find('"').unwrap();
            rest[start..end].parse().unwrap()
        };
        let text_start = rest.find('>').unwrap() + 1;
        let text_end = rest.find("</word>").unwrap();
        let text = rest[text_start..text_end]
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">");
        words.push((
            page - 1,
            attr("xMin"),
            attr("yMin"),
            attr("xMax"),
            attr("yMax"),
            text,
        ));
    }
    Some(words)
}

pub fn compare(engine: &mut Engine, name: &str) -> Option<usize> {
    let pdf = write(
        engine,
        &Default::default(),
        &Info {
            title: "Sample".into(),
            author: "".into(),
        },
    )
    .unwrap();
    let path = std::env::temp_dir().join(format!("blank-layout-{name}.pdf"));
    std::fs::write(&path, pdf).unwrap();
    let found = read_words(&path)?;
    let laid: Vec<Word> = engine.words();
    assert_eq!(
        found.len(),
        laid.len(),
        "as many words in the PDF as laid out"
    );
    // every word laid out is in the PDF, on its page and at its spot
    let mut unmatched = found.clone();
    // pdftotext boxes a word by the ascent and descent the PDF gives its
    // font, in em, which the first word in a font tells
    let mut metrics: std::collections::HashMap<usize, (f32, f32)> = Default::default();
    for word in &laid {
        let near = |a: f32, b: f32| (a - b).abs() < 0.05;
        let known = metrics.get(&word.font).copied();
        let index = unmatched
            .iter()
            .position(|(page, x_min, y_min, x_max, y_max, text)| {
                let (ascent, descent) = known.unwrap_or((
                    (word.baseline - y_min) / word.size,
                    (y_max - word.baseline) / word.size,
                ));
                *page == word.page
                && *text == word.text
                && near(*x_min, word.left)
                // the last glyph's width without the letter spacing
                && (x_max - word.right).abs() < 0.45
                && near(*y_min, word.baseline - ascent * word.size)
                && near(*y_max, word.baseline + descent * word.size)
                && (known.is_some() || (ascent > 0.5 && ascent < 1.2))
            });
        if let (None, Some(index)) = (known, index) {
            let (_, _, y_min, _, y_max, _) = unmatched[index];
            metrics.insert(
                word.font,
                (
                    (word.baseline - y_min) / word.size,
                    (y_max - word.baseline) / word.size,
                ),
            );
        }
        match index {
            Some(index) => {
                unmatched.swap_remove(index);
            }
            None => {
                let close: Vec<_> = unmatched
                    .iter()
                    .filter(|w| w.5 == word.text && w.0 == word.page)
                    .take(3)
                    .collect();
                panic!("{word:?} is not in the PDF where it was laid out; nearby: {close:?}");
            }
        }
    }
    Some(found.len())
}

#[test]
fn the_pdf_holds_the_layout() {
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings());
    engine.set_items(sample());
    assert!(engine.pages.len() >= 4);
    match compare(&mut engine, "sample") {
        Some(count) => assert!(count > 1000, "{count} words"),
        None => eprintln!("pdftotext is missing, skipping the comparison"),
    }
}

#[test]
fn the_pdf_holds_the_layout_on_other_paper() {
    let mut engine = Engine::new(repository_fonts());
    let mut settings = settings();
    // A5 landscape with narrow margins
    settings.width = 595.28;
    settings.height = 419.53;
    settings.margins.left = 36.0;
    settings.margins.right = 36.0;
    settings.new_page_before = vec![1];
    settings.number_style = "i".into();
    engine.set_settings(settings);
    engine.set_items(sample());
    compare(&mut engine, "a5");
}

/// a table whose cells hold a list, a quote and paragraphs, after some text
fn table_with_blocks() -> Vec<Item> {
    use blank_layout::model::{Cell, CellBlock, CellText, Row};
    let text = |pos: u32, text: &str, indent: f32, marker: Option<&str>, bars: Vec<f32>| {
        CellBlock::Text(CellText {
            text: Text {
                pos,
                text: text.into(),
                ..Default::default()
            },
            indent,
            marker: marker.map(String::from),
            bars,
        })
    };
    let cell = |blocks: Vec<CellBlock>| Cell {
        blocks,
        ..Default::default()
    };
    let rows = vec![
        Row {
            cells: vec![
                cell(vec![text(3, "Ingredients", 0.0, None, vec![])]),
                cell(vec![text(20, "Steps", 0.0, None, vec![])]),
            ],
            header: true,
        },
        Row {
            cells: vec![
                cell(vec![
                    text(40, "flour and water", 18.0, Some("•"), vec![]),
                    text(60, "a pinch of salt", 18.0, Some("•"), vec![]),
                ]),
                cell(vec![
                    text(80, "Knead it well, then let it rest.", 0.0, None, vec![]),
                    text(
                        120,
                        "Patience is the secret ingredient.",
                        12.0,
                        None,
                        vec![0.0],
                    ),
                ]),
            ],
            header: false,
        },
    ];
    vec![
        text_item(200, "Bread", "h1", 1, vec![]),
        Item {
            content: Content::Table {
                pos: 210,
                end: 400,
                rows,
                widths: vec![],
                caption: Some("A simple recipe".into()),
            },
            ..text_item(0, "", "p", 0, vec![])
        },
    ]
}

#[test]
fn the_pdf_holds_tables_with_lists_and_quotes() {
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings());
    engine.set_items(table_with_blocks());
    if let Some(count) = compare(&mut engine, "cell-blocks") {
        // the list markers are laid out and in the PDF too
        assert!(count >= 20, "{count} words");
    }
}
