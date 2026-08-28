//! Integration tests for overlay placement across multi-monitor layouts.
//!
//! These pin the coordinate-space contract of [`aispur::overlay_placement`]:
//! cursor values are physical (primary-scaled), monitor geometry is physical
//! (each monitor's own scale), and the placement output must be in a single
//! global desktop point space. Before this module existed the overlay had zero
//! multi-display coverage — the window was created at 1920x1080 and never
//! moved.

use aispur::overlay_placement::{MonitorGeom, cursor_to_points, pick_monitor, resolve_placement};

fn monitor(pos_x: f64, pos_y: f64, width: f64, height: f64, scale: f64) -> MonitorGeom {
    MonitorGeom {
        pos_x,
        pos_y,
        width,
        height,
        scale,
    }
}

#[test]
fn single_monitor_full_cover() {
    let monitors = vec![monitor(0.0, 0.0, 1920.0, 1080.0, 1.0)];
    let p = resolve_placement(100.0, 100.0, 1.0, &monitors, 0).expect("one monitor");
    assert_eq!((p.origin_x, p.origin_y), (0.0, 0.0));
    assert_eq!((p.width, p.height), (1920.0, 1080.0));
    assert_eq!((p.cursor_x, p.cursor_y), (100.0, 100.0));
}

#[test]
fn single_monitor_cursor_centered() {
    // 1920x1080 @ 1.0, cursor at the middle — physical == points.
    let monitors = vec![monitor(0.0, 0.0, 1920.0, 1080.0, 1.0)];
    let p = resolve_placement(960.0, 540.0, 1.0, &monitors, 0).unwrap();
    assert_eq!((p.origin_x, p.origin_y), (0.0, 0.0));
    assert_eq!((p.width, p.height), (1920.0, 1080.0));
    assert_eq!((p.cursor_x, p.cursor_y), (960.0, 540.0));
}

#[test]
fn two_monitors_side_by_side_cursor_right() {
    // Primary 0..1920, secondary 1920..3840, both @ 1.0.
    let monitors = vec![
        monitor(0.0, 0.0, 1920.0, 1080.0, 1.0),
        monitor(1920.0, 0.0, 1920.0, 1080.0, 1.0),
    ];
    let p = resolve_placement(2190.0, 540.0, 1.0, &monitors, 0).expect("secondary");
    assert_eq!(p.origin_x, 1920.0);
    assert_eq!(p.cursor_x, 270.0);
}

#[test]
fn secondary_left_negative_origin() {
    // Secondary on the left: -1920..0. Cursor at -1500 physical.
    let monitors = vec![
        monitor(0.0, 0.0, 1920.0, 1080.0, 1.0),
        monitor(-1920.0, 0.0, 1920.0, 1080.0, 1.0),
    ];
    let p = resolve_placement(-700.0, 50.0, 1.0, &monitors, 1).expect("left secondary");
    assert_eq!(p.origin_x, -1920.0);
    assert_eq!((p.cursor_x, p.cursor_y), (1220.0, 50.0));
}

#[test]
fn mixed_dpi_primary_2x_secondary_1x_cursor_on_secondary() {
    // Primary 4K @ 2.0 (logical 1920x1080, physical 3840x2160), secondary
    // 1920x1080 @ 1.0 placed to its right. macOS tiles displays in one
    // physical space, so the secondary's physical origin is the primary's
    // *logical* width (1920), and its logical rect spans 1920..3840 points.
    let monitors = vec![
        monitor(0.0, 0.0, 3840.0, 2160.0, 2.0), // logical 0..1920 × 0..1080
        monitor(1920.0, 0.0, 1920.0, 1080.0, 1.0), // logical 1920..3840 × 0..1080
    ];
    // Cursor physical (4340, 100) — expressed in the primary's scale units.
    // /2.0 → points (2170, 50), inside the secondary's [1920,3840) × [0,1080)
    // rect → secondary wins, local x = 2170-1920 = 250.
    let p = resolve_placement(4340.0, 100.0, 2.0, &monitors, 0).expect("secondary");
    assert_eq!(p.origin_x, 1920.0);
    assert_eq!(p.width, 1920.0);
    assert_eq!((p.cursor_x, p.cursor_y), (250.0, 50.0));
    // The old code path divided by the window's own scale factor — on a 1.0
    // window that yields (4340, 100), which would place the whip 4340 px from
    // a 1920-wide image. The test pins the primary-scale treatment.
    assert!(p.cursor_x < p.width);
}

#[test]
fn mixed_dpi_cursor_on_primary_2x() {
    // Cursor physically at (1920, 1080) → points (960, 540) → primary.
    let monitors = vec![
        monitor(0.0, 0.0, 3840.0, 2160.0, 2.0),
        monitor(1920.0, 0.0, 1920.0, 1080.0, 1.0),
    ];
    let p = resolve_placement(1920.0, 1080.0, 2.0, &monitors, 0).unwrap();
    assert_eq!((p.origin_x, p.origin_y), (0.0, 0.0));
    assert_eq!((p.width, p.height), (1920.0, 1080.0));
    assert_eq!((p.cursor_x, p.cursor_y), (960.0, 540.0));
}

#[test]
fn cursor_on_secondary_never_divided_by_secondary_scale() {
    // The critical mixed-DPI invariant: the cursor's physical value is
    // primary-scaled. A buggy implementation that divided the cursor by the
    // *secondary's* scale (the old `(cursor - origin) / window_scale` did
    // exactly this when the window sat on the secondary) would judge a cursor
    // physically inside the secondary as outside it and fall back to the
    // primary. Secondary here is 2.0: logical 2880 wide; its logical rect sits
    // at 1920..4800, which in physical (primary-scale) units is 3840..9600.
    let monitors = vec![
        monitor(0.0, 0.0, 3840.0, 2160.0, 2.0), // logical 0..1920 × 0..1080
        monitor(3840.0, 0.0, 5760.0, 2140.0, 2.0), // logical 1920..4800 × 0..1070
    ];
    // Physical (6160, 300) → /2.0 → (3080, 150) points, inside the
    // secondary's [1920,4800) × [0,1070) rect.
    let p = resolve_placement(6160.0, 300.0, 2.0, &monitors, 0).unwrap();
    assert_eq!(p.origin_x, 1920.0);
    assert_eq!(p.width, 2880.0);
    assert_eq!(p.height, 1070.0);
    assert_eq!(p.cursor_x, 1160.0); // (6160/2) - 1920
    assert_eq!(p.cursor_y, 150.0);
}

#[test]
fn cursor_not_on_any_monitor_falls_back_to_primary() {
    let monitors = vec![
        monitor(0.0, 0.0, 1920.0, 1080.0, 1.0),
        monitor(1920.0, 0.0, 1920.0, 1080.0, 1.0),
    ];
    // Point far outside every rect (e.g. a lost / transient display layout).
    let picked = pick_monitor(-100000.0, -100000.0, &monitors, 0).expect("fallback");
    assert_eq!((picked.pos_x, picked.pos_y), (0.0, 0.0));
    // Placement resolution: same fallback to the primary.
    let p = resolve_placement(3000.0, 50000.0, 1.0, &monitors, 0).unwrap();
    assert_eq!((p.origin_x, p.origin_y), (0.0, 0.0));
    assert_eq!((p.width, p.height), (1920.0, 1080.0));
}

#[test]
fn primary_index_out_of_bounds_falls_back_to_first_monitor() {
    let monitors = vec![monitor(10.0, 20.0, 100.0, 100.0, 1.0)];
    let p = resolve_placement(50.0, 60.0, 1.0, &monitors, 7).unwrap();
    assert_eq!(p.origin_x, 10.0);
    assert_eq!(p.width, 100.0);
}

#[test]
fn empty_universe_yields_none() {
    assert!(resolve_placement(1.0, 1.0, 1.0, &[], 0).is_none());
}

#[test]
fn zero_scale_is_treated_as_one() {
    // A monitor whose scale query returned 0 (broken driver) must not divide
    // by zero or produce NaN geometry.
    let monitors = vec![monitor(0.0, 0.0, 1920.0, 1080.0, 0.0)];
    let p = resolve_placement(960.0, 540.0, 0.0, &monitors, 0).unwrap();
    assert_eq!(p.width, 1920.0);
    assert_eq!(p.cursor_x, 960.0);
    assert!(p.cursor_x.is_finite());
}

#[test]
fn cursor_to_points_uses_primary_scale() {
    assert_eq!(cursor_to_points(3840.0, 2160.0, 2.0), (1920.0, 1080.0));
    assert_eq!(cursor_to_points(100.0, 100.0, 1.0), (100.0, 100.0));
    // Guarded scales fall back to 1.0 (no division by zero / negatives).
    assert_eq!(cursor_to_points(100.0, 200.0, 0.0), (100.0, 200.0));
    assert_eq!(cursor_to_points(100.0, 200.0, -1.0), (100.0, 200.0));
}
