//! Performance measurement probe for hot-path bottleneck identification.
//!
//! Run in **release** mode only (debug is 10-100x slower and misleading):
//!   cd src-tauri && cargo test --release --test perf_probe -- --ignored --nocapture
//!
//! Measures:
//! 1. macOS system API costs (osascript, CGWindowListCopyWindowInfo)
//! 2. Display topology queries (available_monitors, primary_monitor)
//! 3. Cursor queries (cursor_position)
//!
//! These are the suspected bottlenecks from the 5 recent fixes:
//! - overlay_placement::wrap_overlay() calls all 3 display queries every show()
//! - cursor_tracker polls cursor + available_monitors() every 16ms (60fps)
//! - trigger_macro calls osascript + CGWindowList on every trigger

use std::time::Instant;

/// Microbenchmark harness: run `f` for `iters`, collect samples, print stats.
fn bench<F: FnMut()>(label: &str, iters: u32, mut f: F) {
    // Single warm-up
    f();
    let mut samples = Vec::new();
    for _ in 0..iters {
        let t = Instant::now();
        f();
        samples.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mean: f64 = samples.iter().sum::<f64>() / samples.len() as f64;
    let p50 = samples[samples.len() / 2];
    let p99 = samples[((samples.len() as f64 * 0.99) as usize).min(samples.len() - 1)];
    let max = samples[samples.len() - 1];
    println!(
        "{label:48} n={iters:<4} mean={mean:7.2}ms p50={p50:7.2}ms p99={p99:7.2}ms max={max:7.2}ms"
    );
}

#[test]
#[ignore]
#[cfg(target_os = "macos")]
fn probe_macos_system_apis() {
    println!("\n=== macOS System API Costs (release build) ===");
    println!("Budget: trigger_macro安全门 < 20ms, cursor_tracker每tick < 2ms\n");

    bench("active_app_is_safe() [osascript System Events]", 20, || {
        let _ = aispur::target_window::active_app_is_safe();
    });

    bench(
        "app_under_cursor() [CGWindowListCopyWindowInfo]",
        50,
        || {
            let _ = aispur::target_window::app_under_cursor(800.0, 400.0);
        },
    );

    println!();
}

#[test]
#[ignore]
fn probe_display_topology_queries() {
    use tauri::Manager;
    println!("\n=== Display Topology Query Costs ===");
    println!("这些 API 在 wrap_overlay() (每次show前) 和 cursor_tracker (每16ms) 中调用\n");

    // Need a Tauri window to call these APIs
    tauri::Builder::default()
        .setup(|app| {
            // Create a hidden test window
            let window = tauri::WebviewWindowBuilder::new(app, "perf-test", Default::default())
                .title("Perf Test")
                .inner_size(100.0, 100.0)
                .visible(false)
                .build()?;

            bench("window.cursor_position()", 200, || {
                let _ = window.cursor_position();
            });

            bench("window.available_monitors()", 200, || {
                let _ = window.available_monitors();
            });

            bench("window.primary_monitor()", 200, || {
                let _ = window.primary_monitor();
            });

            bench("ALL 3 queries (wrap_overlay pattern)", 100, || {
                let _ = window.cursor_position();
                let _ = window.available_monitors();
                let _ = window.primary_monitor();
            });

            bench("cursor_in_points (cursor_tracker pattern)", 200, || {
                let _ = aispur::overlay_placement::cursor_in_points(&window);
            });

            println!("\n显示器拓扑枚举频次分析:");
            println!("  - wrap_overlay: 每次快捷键/托盘触发 → 1次/触发");
            println!("  - cursor_tracker: 60fps推送 → 60次/秒");
            println!("  - 如果 available_monitors() >1ms，60fps时每秒累计 >60ms 在枚举显示器\n");

            app.exit(0);
            Ok(())
        })
        .build(tauri::tauri_build_context!())
        .expect("error while building tauri app")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {}
        });
}
