//! What JS may hand the engine, however odd, never makes it panic: the
//! wasm would trap, and every later call would throw.

use super::test_support::*;
use super::Engine;
use crate::fonts::repository_fonts;
use crate::model::{Cell, Content, Item, Row, Settings, START_NUMBER_LIMIT};

fn settings_from(json: &str) -> Settings {
    let page = r#""width":595,"height":842,"margins":{"top":72,"right":72,"bottom":72,"left":72}"#;
    serde_json::from_str(&format!("{{{page},{json}}}")).expect("settings")
}

#[test]
fn clamps_start_numbers() {
    for (json, expected) in [
        ("3000000000", START_NUMBER_LIMIT),
        ("9223372036854775807", START_NUMBER_LIMIT),
        ("18446744073709551615", START_NUMBER_LIMIT),
        ("1e300", START_NUMBER_LIMIT),
        ("-1e300", -START_NUMBER_LIMIT),
        ("3.7", 3),
        ("0", 0),
    ] {
        let settings = settings_from(&format!(r#""startNumber":{json}"#));
        assert_eq!(settings.start_number, expected, "{json}");
    }
    assert_eq!(settings_from(r#""numberStyle":"i""#).start_number, 1);
    // a string is still an error, which setSettings throws
    let page = r#""width":595,"height":842,"margins":{"top":72,"right":72,"bottom":72,"left":72}"#;
    assert!(serde_json::from_str::<Settings>(&format!(r#"{{{page},"startNumber":"7"}}"#)).is_err());
}

#[test]
fn numbers_huge_pages_in_arabic_at_once() {
    let mut engine = engine(document(&["one"]));
    let mut settings = settings_from(r#""startNumber":200000000,"numberStyle":"i""#);
    settings.footer.center = "{page}".into();
    let started = std::time::Instant::now();
    engine.set_settings(settings);
    assert_eq!(engine.pages[0].bands[4], "200000000");
    assert!(started.elapsed().as_secs_f32() < 1.0);
}

#[test]
fn keeps_the_page_within_what_can_be_laid_out() {
    let mut engine = engine(document(&[LONG; 3]));
    let mut settings = Settings {
        width: -5.0,
        height: f32::INFINITY,
        number_style: "a".into(),
        ..Default::default()
    };
    settings.margins.left = 1e30;
    settings.margins.right = f32::NAN;
    settings.margins.top = -3.0;
    engine.set_settings(settings);
    let settings = &engine.settings;
    assert_eq!(settings.width, crate::model::MIN_PAGE);
    assert_eq!(settings.height, Settings::default().height);
    assert!(settings.content_width() >= crate::model::MIN_PAGE - 0.01);
    assert_eq!(settings.margins.top, 0.0);
    assert_eq!(settings.number_style, "1");
    assert!(!engine.pages.is_empty());
}

#[test]
fn lays_out_items_with_numbers_out_of_range() {
    // JSON has no NaN, but 1e39 is infinite as an f32
    let json = r#"[
        {"kind":"text","pos":1,"text":"indented","indent":1e39,"before":-4,"after":1e39,"bars":[1e39]},
        {"kind":"image","pos":20,"src":"a.png","width":1e39,"height":10},
        {"kind":"image","pos":22,"src":"b.png","width":-10,"height":-10},
        {"kind":"table","pos":30,"end":40,"rows":[],"widths":[1e39,-1]}
    ]"#;
    let items: Vec<Item> = serde_json::from_str(json).unwrap();
    let mut engine = Engine::new(repository_fonts());
    engine.set_items(items.clone());
    let item = &engine.items[0];
    assert!(item.indent.is_finite() && item.after.is_finite() && item.before == 0.0);
    assert!(item.bars.iter().all(|bar| bar.is_finite()));
    // images that can't be sized are shown as not loaded
    assert!(matches!(engine.items[1].content, Content::Image { width, .. } if width == 0.0));
    assert!(!engine.laid[1].label.is_none());
    for page in 0..engine.pages.len() {
        for op in engine.page_ops(page, true) {
            if let super::Op::Rect { x, y, w, h, .. } = op {
                assert!([x, y, w, h].iter().all(|value| value.is_finite()));
            }
        }
    }
    // the same through update
    engine.update(0, 0, items, 0);
    assert!(engine.items.iter().all(|item| item.indent.is_finite()));
}

#[test]
fn clamps_merged_cells_to_a_thousand_columns() {
    let huge = Cell {
        colspan: u32::MAX,
        col: Some(u32::MAX),
        rowspan: u32::MAX,
        ..cell(3, "wide")
    };
    let rows = vec![
        Row {
            cells: vec![cell(1, "a"), huge],
            header: false,
        },
        Row {
            cells: vec![Cell {
                colspan: u32::MAX,
                ..cell(20, "b")
            }],
            header: false,
        },
    ];
    let started = std::time::Instant::now();
    let engine = engine(vec![table_item(rows, None)]);
    assert!(started.elapsed().as_secs_f32() < 5.0);
    let columns = engine.laid[0].columns.len() - 1;
    assert_eq!(columns, crate::items::MAX_COLUMNS as usize);
    assert!(engine.caret(3, false).is_some());
}

#[test]
fn answers_nothing_for_what_isnt_there() {
    let empty = Engine::new(repository_fonts());
    let rows = vec![Row {
        cells: vec![cell(3, "x")],
        header: true,
    }];
    let mut items = document(&["one", LONG]);
    items.push(Item {
        content: Content::Table {
            pos: 300,
            end: 310,
            rows,
            widths: vec![],
            caption: Some("c".into()),
        },
        ..paragraph(0, "")
    });
    let full = engine(items);
    for mut engine in [empty, full] {
        for pos in [0, 1, 5, 299, 300, 305, u32::MAX] {
            let _ = engine.caret(pos, false);
            let _ = engine.caret(pos, true);
            for down in [false, true] {
                for after in [false, true] {
                    let _ = engine.vertical(pos, after, down, 100.0);
                    assert_eq!(engine.vertical(pos, after, down, f32::NAN), None);
                    assert_eq!(engine.vertical(pos, after, down, f32::INFINITY), None);
                    let _ = engine.line_edge(pos, after, down);
                }
            }
            let _ = engine.selection(pos, 0);
            let _ = engine.selection(0, pos);
            let _ = engine.boxes(pos, u32::MAX);
            let _ = engine.table_grid(pos);
        }
        for page in [0, 1, 99, usize::MAX] {
            for (x, y) in [
                (0.0, 0.0),
                (1e9, -1e9),
                (f32::NAN, 5.0),
                (5.0, f32::INFINITY),
            ] {
                let hit = engine.hit(page, x, y);
                let word = engine.word(page, x, y);
                if !(x.is_finite() && y.is_finite()) {
                    assert_eq!((hit, word), (None, None));
                }
            }
            let _ = engine.page_ops(page, true);
            let _ = engine.band_ops(page);
            let _ = engine.page_span(page);
        }
        // changes past the end are clamped to it
        engine.update(usize::MAX, usize::MAX, vec![paragraph(900, "end")], 0);
        engine.update_many(vec![
            (usize::MAX, 3, vec![], -5),
            (0, usize::MAX, vec![], 0),
        ]);
        assert!(engine.items.is_empty());
        assert_eq!(engine.pages.len(), 1);
    }
}

#[test]
fn keeps_images_to_a_size_that_can_be_laid_out() {
    use crate::model::{CellBlock, MAX_IMAGE};
    // a cell image so tall the slices of its row couldn't move on in f32
    for height in [1e7f32, 1e20, f32::MAX] {
        let image = CellBlock::Image {
            pos: 5,
            src: "a.png".into(),
            width: 1.0,
            height,
            alt: String::new(),
            indent: 0.0,
            marker: None,
            bars: vec![],
            share: None,
        };
        let cell = Cell {
            blocks: vec![image],
            ..Default::default()
        };
        let started = std::time::Instant::now();
        let engine = engine(vec![table_item(
            vec![Row {
                cells: vec![cell],
                header: false,
            }],
            None,
        )]);
        assert!(started.elapsed().as_secs_f32() < 5.0, "{height}");
        let room = engine.settings.content_bottom() - engine.settings.content_top();
        assert!(
            engine.pages.len() <= (MAX_IMAGE / room) as usize + 2,
            "{height}: {}",
            engine.pages.len()
        );
    }
    // and a top-level one keeps its shape within the limit
    let json = r#"[{"kind":"image","pos":0,"src":"a","width":10,"height":1e36}]"#;
    let items: Vec<Item> = serde_json::from_str(json).unwrap();
    let mut engine = Engine::new(repository_fonts());
    engine.set_items(items);
    let Content::Image { width, height, .. } = engine.items[0].content else {
        panic!("an image");
    };
    assert!((height - MAX_IMAGE).abs() < 0.1, "{height}");
    assert!(width > 0.0 && width < 1e-20);
}

#[test]
fn writes_only_numbers_json_holds() {
    use crate::model::json_number;
    assert_eq!(json_number(1.23456), "1.235");
    assert_eq!(json_number(-0.5), "-0.5");
    assert_eq!(json_number(f32::INFINITY), "0");
    assert_eq!(json_number(f32::NAN), "0");
    // huge ones stay numbers: in f32, 1e36 × 1000 was inf, written "inf"
    for value in [1e36f32, f32::MAX, -f32::MAX] {
        let written = json_number(value);
        assert!(serde_json::from_str::<f64>(&written).is_ok(), "{written}");
    }
}

#[test]
fn caps_quote_bars_and_table_widths() {
    let mut quote = paragraph(1, "deep");
    quote.bars = vec![0.0; 50_000];
    let widths = Item {
        content: Content::Table {
            pos: 10,
            end: 40,
            rows: vec![Row {
                cells: vec![cell(12, "a"), cell(20, "b")],
                header: false,
            }],
            widths: vec![f32::MAX, f32::MAX],
            caption: None,
        },
        ..paragraph(0, "")
    };
    let engine = engine(vec![quote, widths]);
    assert_eq!(engine.items[0].bars.len(), crate::model::MAX_BARS);
    // the columns still split the width
    let columns = &engine.laid[1].columns;
    assert!(columns[1] - columns[0] > 100.0, "{columns:?}");
}
