//! Standalone performance probe: 测量 Tauri 窗口 API 的开销。
//! 运行：cd src-tauri && cargo run --release --bin perf_probe

use std::time::Instant;
use tauri::Manager;
#[allow(unused_imports)]
use tauri::App;

fn bench<F: FnMut()>(label: &str, iters: u32, mut f: F) {
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
        "{label:52} n={iters:<4} mean={mean:6.2}ms p50={p50:6.2}ms p99={p99:6.2}ms max={max:6.2}ms"
    );
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = tauri::WebviewWindowBuilder::new(app, "probe", Default::default())
                .title("Perf Probe")
                .inner_size(100.0, 100.0)
                .visible(false)
                .build()?;

            println!("\n=== Display Topology Query Costs (release build) ===\n");

            bench("window.cursor_position()", 300, || {
                let _ = window.cursor_position();
            });
            bench("window.available_monitors()", 300, || {
                let _ = window.available_monitors();
            });
            bench("window.primary_monitor()", 300, || {
                let _ = window.primary_monitor();
            });
            bench("ALL 3 (wrap_overlay 每次 show 的开销)", 150, || {
                let _ = window.cursor_position();
                let _ = window.available_monitors();
                let _ = window.primary_monitor();
            });
            bench("window.outer_position()", 300, || {
                let _ = window.outer_position();
            });
            bench("window.scale_factor()", 300, || {
                let _ = window.scale_factor();
            });
            bench("window.set_position()", 100, || {
                let _ = window.set_position(tauri::LogicalPosition::new(0.0, 0.0));
            });
            bench("window.set_size()", 100, || {
                let _ = window.set_size(tauri::LogicalSize::new(100.0, 100.0));
            });

            println!("\n=== cursor_tracker 每 tick 的真实开销 ===\n");
            bench("cursor_in_points (placement helper)", 300, || {
                let _ = aispur::overlay_placement::cursor_in_points(&window);
            });

            println!("\n=== macOS 安全门 API ===\n");
            #[cfg(target_os = "macos")]
            {
                bench("active_app_is_safe() [osascript]", 15, || {
                    let _ = aispur::target_window::active_app_is_safe();
                });
                bench("app_under_cursor() [CGWindowList]", 60, || {
                    let _ = aispur::target_window::app_under_cursor(800.0, 400.0);
                });
            }

            #[cfg(target_os = "macos")]
            {
                println!("\n=== 前台应用判定对照（新实现 vs osascript 真值）===\n");
                let native = aispur::target_window::debug_frontmost_owner_name();
                let truth = std::process::Command::new("osascript")
                    .args([
                        "-e",
                        "tell application \"System Events\" to get name of first application process whose frontmost is true",
                    ])
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
                println!("CGWindowList 首个 layer-0 窗口 owner : {native:?}");
                aispur::target_window::debug_dump_window_list(12);
                println!("osascript frontmost process        : {truth:?}");
                println!("active_app_is_safe()               : {}", aispur::target_window::active_app_is_safe());
            }

            println!();
            std::process::exit(0);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|_app, _event| {});
}
