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
    items.extend(more_of_the_sample(pos));
    items
}

/// a red pixel, the image of the sample
const PNG: [u8; 69] = [
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0,
    0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1,
    1, 0, 201, 254, 146, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

/// the images of the sample, by their src
fn sample_images() -> std::collections::HashMap<String, blank_layout::pdf::ImageData> {
    let mut images = std::collections::HashMap::new();
    images.insert(
        "pixel.png".to_string(),
        blank_layout::pdf::ImageData {
            bytes: PNG.to_vec(),
            jpeg: false,
        },
    );
    images
}

/// what else the sample has, from `pos` on: a table with two header rows
/// and a caption, a code block, combining marks and an image
fn more_of_the_sample(mut pos: u32) -> Vec<Item> {
    use blank_layout::model::{Cell, Row};
    let mut items = vec![];
    let cell = |text: &str, pos: &mut u32| {
        let cell = Cell {
            paragraphs: vec![Text {
                pos: *pos + 2,
                text: text.into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        *pos += text.encode_utf16().count() as u32 + 4;
        cell
    };
    let table = pos;
    let mut at = pos + 1;
    let mut rows = vec![];
    for (index, texts) in [
        ["Quarter", "Region", "Sales"],
        ["", "", "in euros"],
        ["Q1", "North", "1,200"],
        ["Q1", "South", "980"],
        ["Q2", "North", "1,450"],
    ]
    .iter()
    .enumerate()
    {
        at += 1;
        let cells = texts.iter().map(|text| cell(text, &mut at)).collect();
        at += 1;
        rows.push(Row {
            cells,
            header: index < 2,
        });
    }
    pos = at + 1;
    items.push(Item {
        content: Content::Table {
            pos: table,
            end: pos,
            rows,
            widths: vec![2.0, 3.0, 2.0],
            caption: Some("Sales by quarter and region".into()),
        },
        ..text_item(0, "", "p", 0, vec![])
    });
    // no quotes: pdftotext writes them as entities read_words doesn't read
    let code = "fn main() {\n    let total = 1200 + 980;\n}";
    items.push(text_item(pos + 1, code, "code", 0, vec![]));
    pos += code.encode_utf16().count() as u32 + 2;
    let marks = "A cafe\u{301} with cre\u{300}me bru\u{302}le\u{301}e, as written.";
    items.push(text_item(pos + 1, marks, "p", 0, vec![]));
    pos += marks.encode_utf16().count() as u32 + 2;
    items.push(Item {
        content: Content::Image {
            pos,
            src: "pixel.png".into(),
            width: 120.0,
            height: 80.0,
            alt: "a red pixel".into(),
        },
        ..text_item(0, "", "p", 0, vec![])
    });
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
        &sample_images(),
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

/// what a missing tool means: on CI a failure, as there the checks must
/// run, and else a skip
fn missing_tool<T>(tool: &str, package: &str) -> Option<T> {
    if std::env::var_os("CI").is_some() {
        panic!("{tool} is missing: install {package}, CI doesn't skip the check");
    }
    None
}

/// the package a tool comes with
fn package_of(tool: &str) -> &'static str {
    match tool {
        "qpdf" => "qpdf",
        _ => "poppler-utils",
    }
}

/// the plain text pdftotext reads from a PDF, or nothing without pdftotext
/// (only off CI)
fn read_text(pdf: &[u8], name: &str) -> Option<String> {
    let path = std::env::temp_dir().join(format!("blank-layout-{name}.pdf"));
    std::fs::write(&path, pdf).unwrap();
    let out = path.with_extension("txt");
    let status = match Command::new("pdftotext")
        .arg("-enc")
        .arg("UTF-8")
        .arg(&path)
        .arg(&out)
        .status()
    {
        Ok(status) => status,
        Err(_) => return missing_tool("pdftotext", "poppler-utils"),
    };
    assert!(status.success());
    Some(std::fs::read_to_string(&out).unwrap())
}

fn pdf_of(engine: &mut Engine) -> Vec<u8> {
    write(
        engine,
        &Default::default(),
        &Info {
            title: String::new(),
            author: String::new(),
        },
    )
    .unwrap()
}

#[test]
fn pdf_text_keeps_marks_and_ligatures() {
    // NFD marks, Arabic with lam-alef and a mark, and Hebrew points, all
    // in DejaVu Sans; and a Devanagari conjunct in Noto Sans Devanagari if
    // this system has it
    let devanagari = "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf";
    let mut lines = vec![
        "cafe\u{301} and e\u{301}x",
        "\u{627}\u{644}\u{633}\u{644}\u{627}\u{645} \u{628}\u{64e}\u{628}",
        "\u{5e9}\u{5b8}\u{5c1}\u{5dc}\u{5d5}\u{5b9}\u{5dd}",
    ];
    let mut engine = Engine::new(repository_fonts());
    match std::fs::read(devanagari) {
        Ok(bytes) => {
            engine.fonts.add(bytes, "Noto Sans Devanagari");
            lines.push("\u{915}\u{94d}\u{937}\u{92e}\u{93e}");
        }
        Err(_) => eprintln!("no Noto Sans Devanagari, skipping the conjunct"),
    }
    let mut pos = 0;
    let items: Vec<Item> = lines
        .iter()
        .map(|line| {
            let item = text_item(pos + 1, line, "p", 0, vec![]);
            pos += line.encode_utf16().count() as u32 + 2;
            item
        })
        .collect();
    engine.set_items(items);
    let Some(text) = read_text(&pdf_of(&mut engine), "marks") else {
        eprintln!("pdftotext is missing, skipping the check");
        return;
    };
    let text: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && !('\u{202a}'..='\u{202e}').contains(c))
        .collect();
    for line in lines {
        for word in line.split(' ') {
            let rtl = word.chars().any(|c| ('\u{590}'..='\u{6ff}').contains(&c));
            if rtl {
                // every letter and mark is there. pdftotext turns the
                // letters of one glyph around right to left (lam-alef, a
                // letter with its marks), while the PDF has them as they are
                // written, as its ToUnicode mapping must
                let mut expected: Vec<char> = word.chars().collect();
                expected.sort();
                let found = text.chars().collect::<Vec<_>>();
                let found = found.windows(expected.len()).any(|window| {
                    let mut window = window.to_vec();
                    window.sort();
                    window == expected
                });
                assert!(found, "{word:?} is not in {text:?}");
            } else {
                // left to right exactly, the marks composed or not
                assert!(
                    text.contains(word) || text.contains(&compose(word)),
                    "{word:?} is not in {text:?}"
                );
            }
        }
    }
}

/// é from e and a combining acute, the only composition the checks need
fn compose(word: &str) -> String {
    word.replace("e\u{301}", "\u{e9}")
}

#[test]
fn pdf_text_keeps_what_no_font_has() {
    // Chinese, which no font of the repository has: laid out with the
    // missing glyph, and still in the PDF's text where it was laid out
    let mut engine = Engine::new(repository_fonts());
    engine.set_items(vec![text_item(
        1,
        "plain \u{4e2d}\u{6587}\u{5b57} text \u{4e2d}",
        "p",
        0,
        vec![],
    )]);
    assert!(!engine.missing().is_empty());
    let pdf = pdf_of(&mut engine);
    if let Some(text) = read_text(&pdf, "notdef") {
        assert!(text.contains("\u{4e2d}\u{6587}\u{5b57}"), "{text:?}");
    }
    compare(&mut engine, "notdef");
}

/// what a command prints, or nothing without it (only off CI)
fn run(program: &str, args: &[&str]) -> Option<String> {
    let out = match Command::new(program).args(args).output() {
        Ok(out) => out,
        Err(_) => return missing_tool(program, package_of(program)),
    };
    Some(String::from_utf8_lossy(&out.stdout).into_owned() + &String::from_utf8_lossy(&out.stderr))
}

#[test]
fn pdf_is_tagged() {
    use blank_layout::pdf::write_with;
    let mut items = sample();
    let end = items.last().unwrap().to();
    items.extend(table_with_blocks().into_iter().map(|mut item| {
        item.shift(end as i64);
        item
    }));
    // a quote, and an image that isn't loaded
    let end = items.last().unwrap().to();
    let mut quote = text_item(end + 2, "To be or not to be.", "p", 0, vec![]);
    quote.indent = 12.0;
    quote.bars = vec![0.0];
    items.push(quote);
    items.push(Item {
        content: Content::Image {
            pos: end + 30,
            src: "missing.png".into(),
            width: 0.0,
            height: 0.0,
            alt: "a map of the town".into(),
        },
        ..text_item(0, "", "p", 0, vec![])
    });
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings());
    engine.set_items(items);
    let written = write_with(
        &mut engine,
        &Default::default(),
        &Info {
            title: "Sample".into(),
            author: "".into(),
        },
        "en-GB",
    )
    .unwrap();
    assert!(written.warnings.is_empty());
    let path = std::env::temp_dir().join("blank-layout-tagged.pdf");
    std::fs::write(&path, &written.bytes).unwrap();
    let path = path.to_str().unwrap();
    let Some(info) = run("pdfinfo", &[path]) else {
        eprintln!("pdfinfo is missing, skipping the check");
        return;
    };
    let tagged = info.lines().find(|line| line.starts_with("Tagged:"));
    assert!(tagged.is_some_and(|line| line.ends_with("yes")), "{info}");
    if let Some(check) = run("qpdf", &["--check", path]) {
        assert!(
            check.contains("No syntax or stream encoding errors"),
            "{check}"
        );
        // the language, the bookmarks and the structure, in the uncompressed file
        let plain = std::env::temp_dir().join("blank-layout-tagged-qdf.pdf");
        let plain = plain.to_str().unwrap();
        run("qpdf", &["--qdf", "--object-streams=disable", path, plain]);
        let bytes = std::fs::read(plain).unwrap();
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("/Lang (en-GB)"), "no /Lang");
        assert!(text.contains("/Outlines"), "no bookmarks");
        assert!(
            text.contains("/Title (Chapter 1)"),
            "no bookmark for the first chapter"
        );
        assert!(
            text.contains("/Alt (a map of the town)"),
            "no alt text on the figure"
        );
        for role in [
            "/H1",
            "/H2",
            "/P",
            "/L",
            "/LI",
            "/Lbl",
            "/LBody",
            "/Table",
            "/TR",
            "/TH",
            "/TD",
            "/Caption",
            "/BlockQuote",
            "/Figure",
            "/Link",
        ] {
            assert!(
                text.contains(&format!("/S {role}")),
                "no {role} in the structure"
            );
        }
    }
    // and its text is where it was laid out, as without tags
    compare(&mut engine, "tagged");
}

#[test]
fn pdf_tags_a_cell_in_its_reading_order() {
    let mut engine = Engine::new(repository_fonts());
    engine.set_settings(settings());
    engine.set_items(table_with_blocks());
    let pdf = pdf_of(&mut engine);
    let path = std::env::temp_dir().join("blank-layout-cell-order.pdf");
    std::fs::write(&path, pdf).unwrap();
    let Some(structure) = run("pdfinfo", &["-struct-text", path.to_str().unwrap()]) else {
        eprintln!("pdfinfo is missing, skipping the check");
        return;
    };
    // the list in the cell: each marker as the label of its item, before it
    let at = |text: &str| {
        structure
            .find(text)
            .unwrap_or_else(|| panic!("{text} not in {structure}"))
    };
    let first = at("\"flour and water\"");
    let second = at("\"a pinch of salt\"");
    let marker = structure[..first]
        .rfind("\"•\"")
        .expect("a marker before the first item");
    assert!(structure[marker..first].contains("LBody"), "{structure}");
    assert!(
        structure[first..second].contains("\"•\""),
        "the second marker comes between"
    );
    assert!(structure.contains("LI"), "{structure}");
    assert!(structure.contains("Lbl"), "{structure}");
}
