use crate::config::Config;
use tauri::{AppHandle, Emitter, Manager};

/// YYYY-MM-DD date string for "today" in UTC. UTC keeps the rollover consistent
/// across platforms without pulling in TZ-aware date plumbing.
pub fn today_utc_date() -> String {
    use time::OffsetDateTime;
    OffsetDateTime::now_utc().date().to_string()
}

/// Decide the next "today" count given the last recorded use date.
///
/// `None` means the counts belong to the same day and the caller should keep
/// accumulating; `Some(n)` is the rollover value — n=1 for a new day's first use.
pub fn rollover_today_count(
    last_date: &Option<String>,
    today: &str,
    current_today: u32,
) -> Option<u32> {
    if last_date.as_deref() == Some(today) || (current_today == 0 && last_date.is_none()) {
        None // same day OR pristine: keep accumulating
    } else {
        Some(1) // new day: this is the first use, discard yesterday
    }
}

/// Advance the usage counters for one trigger on `today`.
///
/// Split out of the command so the day-rollover behaviour is unit-testable
/// without a Tauri runtime (R-ARCH-008).
pub fn apply_increment(config: &mut Config, today: &str) {
    match rollover_today_count(&config.last_usage_date, today, config.today_usage_count) {
        Some(next) => config.today_usage_count = next,
        None => config.today_usage_count += 1,
    }
    config.last_usage_date = Some(today.to_string());
    config.usage_count += 1;
}

/// Pick a random phrase from the configured list using wall-clock entropy.
///
/// `None` is returned when `phrases` is empty; callers surface that as an
/// error.  Split out so the selection logic is unit-testable (R-ARCH-008).
pub fn pick_phrase(phrases: &[String]) -> Option<String> {
    if phrases.is_empty() {
        return None;
    }
    let idx = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        (now % phrases.len() as u128) as usize
    };
    Some(phrases[idx].clone())
}

/// Push the authoritative config snapshot to the settings window.
///
/// Emission failure is logged, never propagated: the write already succeeded,
/// and a missing settings window is the normal case for a tray-resident app.
pub fn emit_config_updated(app: &AppHandle, config: &Config) {
    if let Some(w) = app.get_webview_window("settings") {
        if let Err(e) = w.emit("config-updated", config) {
            eprintln!("[ipc] could not emit config-updated: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── rollover_today_count ──────────────────────────────────────────────

    #[test]
    fn same_day_keeps_accumulating() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-13".into()), "2026-08-13", 5),
            None
        );
    }

    #[test]
    fn new_day_resets_to_one() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-12".into()), "2026-08-13", 14),
            Some(1)
        );
    }

    #[test]
    fn missing_last_date_is_a_fresh_day_when_counter_is_zero() {
        assert_eq!(rollover_today_count(&None, "2026-08-13", 0), None);
    }

    #[test]
    fn missing_last_date_with_existing_count_resets() {
        assert_eq!(rollover_today_count(&None, "2026-08-13", 3), Some(1));
    }

    #[test]
    fn future_date_is_treated_as_new_day() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-20".into()), "2026-08-13", 7),
            Some(1)
        );
    }

    // ── apply_increment ───────────────────────────────────────────────────

    #[test]
    fn apply_increment_same_day_accumulates() {
        let mut cfg = Config {
            last_usage_date: Some("2026-08-13".into()),
            today_usage_count: 5,
            usage_count: 42,
            ..Default::default()
        };
        apply_increment(&mut cfg, "2026-08-13");
        assert_eq!(cfg.today_usage_count, 6);
        assert_eq!(cfg.usage_count, 43);
        assert_eq!(cfg.last_usage_date.as_deref(), Some("2026-08-13"));
    }

    #[test]
    fn apply_increment_new_day_resets_today() {
        let mut cfg = Config {
            last_usage_date: Some("2026-08-12".into()),
            today_usage_count: 99,
            usage_count: 200,
            ..Default::default()
        };
        apply_increment(&mut cfg, "2026-08-13");
        assert_eq!(cfg.today_usage_count, 1);
        assert_eq!(cfg.usage_count, 201);
    }

    #[test]
    fn apply_increment_pristine_first_use() {
        let mut cfg = Config::default();
        assert_eq!(cfg.last_usage_date, None);
        assert_eq!(cfg.today_usage_count, 0);
        apply_increment(&mut cfg, "2026-08-13");
        assert_eq!(cfg.today_usage_count, 1);
        assert_eq!(cfg.usage_count, 1);
    }

    // ── pick_phrase ───────────────────────────────────────────────────────

    #[test]
    fn pick_phrase_empty_returns_none() {
        assert_eq!(pick_phrase(&[]), None);
    }

    #[test]
    fn pick_phrase_returns_item_from_list() {
        let phrases = vec!["A".into(), "B".into(), "C".into()];
        assert!(pick_phrase(&phrases).is_some());
    }
}
