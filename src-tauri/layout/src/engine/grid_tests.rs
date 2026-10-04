//! The bands of grids: columns of items side by side.

use super::test_support::{engine, grid_document, heading, LONG};
use super::Hit;

#[test]
fn lays_out_columns_side_by_side() {
    let (items, at) = grid_document(&["Intro"], &[&[LONG, "b"], &["c"]], &["After"]);
    let engine = engine(items);
    let (page, left_x, left_y, _) = engine.caret(at[0][0], false).unwrap();
    let (other_page, right_x, right_y, _) = engine.caret(at[1][0], false).unwrap();
    assert_eq!((page, other_page), (0, 0));
    // both from the top of the band, the second column to the right
    assert_eq!(left_y, right_y);
    let width = engine.settings.content_width();
    assert!((right_x - left_x - (width + 12.0) / 2.0).abs() < 0.01);
    // each in the width of its column
    let column = (width - 12.0) / 2.0;
    assert!(engine.laid[1].texts[0].width <= column + 0.01);
    assert!(engine.laid[1].height() > engine.laid[3].height());
    // what follows below the longer column
    let (_, _, b_y, b_height) = engine.caret(at[0][1], false).unwrap();
    let after = engine.items[4].from();
    let (_, after_x, after_y, _) = engine.caret(after, false).unwrap();
    assert!(after_y >= b_y + b_height);
    assert_eq!(after_x, left_x);
}

#[test]
fn goes_on_over_pages_in_each_column() {
    let long: Vec<&str> = vec![LONG; 30];
    let (items, at) = grid_document(&[], &[&long, &[LONG]], &["After"]);
    let engine = engine(items);
    assert!(engine.pages.len() > 1);
    // a page's fragments come in the order of the items
    for page in &engine.pages {
        let items: Vec<usize> = engine.frags[page.start..page.end]
            .iter()
            .map(|frag| frag.item)
            .collect();
        assert!(items.windows(2).all(|pair| pair[0] <= pair[1]));
    }
    // every line of the first column can be found, whichever page it is on
    for &pos in &at[0] {
        assert!(engine.caret(pos, false).is_some());
        let end = pos + LONG.len() as u32;
        assert!(engine.caret(end, false).is_some());
    }
    let (last_page, ..) = engine.caret(*at[0].last().unwrap(), false).unwrap();
    let (other_page, ..) = engine.caret(at[1][0], false).unwrap();
    assert_eq!(other_page, 0);
    let after = engine.items.last().unwrap().from();
    assert_eq!(engine.caret(after, false).unwrap().0, last_page);
}

#[test]
fn starts_its_columns_on_one_page() {
    // the first column starts with a heading, which is kept with what
    // follows it: wherever the band starts, its columns start together
    let mut moved = false;
    for count in 1..24 {
        let filler: Vec<&str> = vec![LONG; count];
        let (mut items, at) = grid_document(&filler, &[&["Heading", LONG], &["c"]], &[]);
        let first = items.iter().position(|item| item.column.is_some()).unwrap();
        let column = items[first].column.clone();
        items[first] = heading(at[0][0], 2, "Heading");
        items[first].column = column;
        let engine = engine(items);
        let (page, _, heading_y, _) = engine.caret(at[0][0], false).unwrap();
        let (other_page, _, y, _) = engine.caret(at[1][0], false).unwrap();
        assert_eq!(page, other_page, "after {count} paragraphs");
        // the heading has its space above, unless it starts the page
        assert!(y <= heading_y + 30.0, "after {count} paragraphs");
        let last = engine.items[first - 1].to();
        moved |= engine.caret(last, false).unwrap().0 < page;
    }
    assert!(moved);
}

#[test]
fn moves_up_and_down_in_its_column() {
    let (items, at) = grid_document(&["Intro"], &[&["a", "b"], &["c"]], &["After"]);
    let engine = engine(items);
    let goal = |pos: u32| engine.caret(pos, false).unwrap().1;
    // the item the caret lands in
    let item = |found: Option<(Hit, bool)>| match found {
        Some((Hit::Text(pos), _)) => engine.item_at(pos),
        _ => None,
    };
    let down = |pos: u32| item(engine.vertical(pos, false, true, goal(pos)));
    let at_item = |pos: u32| engine.item_at(pos);
    let after = engine.items.last().unwrap().from();
    assert_eq!(down(at[0][0]), at_item(at[0][1]));
    // past the other column, to what follows the band
    assert_eq!(down(at[0][1]), at_item(after));
    assert_eq!(down(at[1][0]), at_item(after));
    // into the column under the goal
    let up = |goal: f32| item(engine.vertical(after, false, false, goal));
    assert_eq!(up(goal(at[1][0])), at_item(at[1][0]));
    assert_eq!(up(goal(at[0][0])), at_item(at[0][1]));
    let intro = engine.items[0].from();
    let into = item(engine.vertical(intro, false, true, goal(at[1][0])));
    assert_eq!(into, at_item(at[1][0]));
}

#[test]
fn hits_the_column_under_the_point() {
    let (items, at) = grid_document(&["Intro"], &[&["a"], &["c"]], &["After"]);
    let engine = engine(items);
    let (page, x, y, height) = engine.caret(at[1][0], false).unwrap();
    let hit = engine.hit(page, x + 2.0, y + height / 2.0);
    assert!(matches!(hit, Some(Hit::Text(pos)) if pos == at[1][0] || pos == at[1][0] + 1));
}

#[test]
fn keeps_a_band_whole_when_only_one_of_its_items_is_sent_again() {
    // as the webview sends an edit: the picture added to the first column,
    // the second column moved by the engine, not sent again
    let (items, at) = grid_document(&["Intro"], &[&["a"], &["c"]], &["After"]);
    let mut engine = engine(items.clone());
    let mut picture = items[1].clone();
    picture.content = crate::model::Content::Image {
        pos: at[0][0],
        src: "photo.png".into(),
        width: 200.0,
        height: 150.0,
        alt: String::new(),
    };
    engine.update(1, 1, vec![picture], 1 - 3);
    let (page, _, first_y, _) = engine.caret(at[0][0], false).unwrap();
    let (other_page, _, y, _) = engine.caret(at[1][0] - 2, false).unwrap();
    assert_eq!((page, other_page), (0, 0));
    assert!((y - first_y).abs() < 0.01, "{y} and {first_y}");
}
