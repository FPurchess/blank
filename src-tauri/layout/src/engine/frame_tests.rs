//! Frames: items placed on the page, outside the flow.

use super::test_support::{engine, letter_document, LONG};
use super::Hit;

#[test]
fn places_frames_on_the_page_and_the_text_below_them() {
    let (items, at) = letter_document(
        &["Before"],
        &[
            (60.0, 120.0, &["Ann", "Street 1"]),
            (360.0, 140.0, &["Monday"]),
        ],
        300.0,
        &["Dear Ann,", LONG],
    );
    let engine = engine(items);
    // on a page of their own, where they say
    let (page, x, y, _) = engine.caret(at[0], false).unwrap();
    assert_eq!(page, 1);
    assert!((x - 60.0).abs() < 0.01);
    assert!((120.0..135.0).contains(&y));
    let (_, street_x, street_y, _) = engine.caret(at[1], false).unwrap();
    assert_eq!(street_x, x);
    assert!(street_y > y);
    let (_, date_x, date_y, _) = engine.caret(at[2], false).unwrap();
    assert!((date_x - 360.0).abs() < 0.01);
    assert!(date_y >= 140.0);
    // each in its frame's width
    assert!(engine.laid[1].texts[0].width <= 150.0 + 0.01);
    // the text below where it may start, from the left of the text
    let (body_page, body_x, body_y, _) = engine.caret(at[3], false).unwrap();
    assert_eq!(body_page, 1);
    assert!((300.0..320.0).contains(&body_y));
    assert!((body_x - engine.settings.margins.left).abs() < 0.01);
}

#[test]
fn takes_no_room_in_the_flow() {
    // the text starts at the top of the page when it may
    let (items, at) = letter_document(&[], &[(60.0, 400.0, &["Ann"])], 0.0, &["Dear Ann,"]);
    let engine = engine(items);
    let (_, _, y, _) = engine.caret(at[1], false).unwrap();
    assert!(y < engine.settings.content_top() + 20.0);
}

#[test]
fn hits_the_text_in_a_frame() {
    let (items, at) = letter_document(
        &[],
        &[(300.0, 100.0, &["Monday"])],
        100.0,
        &["Dear Ann, how are you?"],
    );
    let engine = engine(items);
    let (page, x, y, height) = engine.caret(at[0], false).unwrap();
    let hit = engine.hit(page, x + 1.0, y + height / 2.0);
    assert!(matches!(hit, Some(Hit::Text(pos)) if pos == at[0] || pos == at[0] + 1));
}
