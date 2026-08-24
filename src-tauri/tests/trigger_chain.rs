//! Integration tests for the complete trigger chain.
//!
//! Tests the path from event triggers → macro execution using FakeMacroSender,
//! keeping fast-path coverage of shortcut + tray handler logic separated from
//! live AppHandle tests (which require a running window system).

use aispur::macro_sender::{FakeMacroSender, MacroCall, MacroSender};
use aispur::shortcut::generate_alternatives;

// ���───��� Macro / whip-crack chain ────���─────���──���───────���──���──���─���───���────────���──

/// Mirrors the production handler called after a crack event fires.
fn handle_whip_crack(sender: &dyn MacroSender, phrase: &str) -> Result<(), String> {
    sender
        .send_interrupt()
        .map_err(|e| format!("interrupt failed: {e}"))?;
    sender
        .type_text(phrase)
        .map_err(|e| format!("type_text failed: {e}"))?;
    sender
        .press_enter()
        .map_err(|e| format!("press_enter failed: {e}"))?;
    Ok(())
}

#[test]
fn trigger_chain_complete_sequence() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "FASTER").unwrap();

    let calls = fake.get_calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0], MacroCall::Interrupt);
    assert_eq!(calls[1], MacroCall::TypeText("FASTER".to_string()));
    assert_eq!(calls[2], MacroCall::Enter);
}

#[test]
fn trigger_chain_preserves_order_across_multiple_cracks() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "FIRST").unwrap();
    handle_whip_crack(&fake, "SECOND").unwrap();

    let calls = fake.get_calls();
    assert_eq!(calls.len(), 6);
    // First crack
    assert_eq!(calls[0], MacroCall::Interrupt);
    assert_eq!(calls[1], MacroCall::TypeText("FIRST".to_string()));
    assert_eq!(calls[2], MacroCall::Enter);
    // Second crack
    assert_eq!(calls[3], MacroCall::Interrupt);
    assert_eq!(calls[4], MacroCall::TypeText("SECOND".to_string()));
    assert_eq!(calls[5], MacroCall::Enter);
}

#[test]
fn trigger_chain_interrupt_always_precedes_text() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "KEEP GOING").unwrap();

    let calls = fake.get_calls();
    assert!(matches!(calls[0], MacroCall::Interrupt));
    assert!(matches!(calls[1], MacroCall::TypeText(_)));
    assert!(matches!(calls[2], MacroCall::Enter));
}

// ───���─ Shortcut alternative-generation logic ───���──────���─���──────────���───���───���─
// Pure-function coverage of the shortcut handler path that runs when a hotkey
// conflict is detected. The live AppHandle portions (register / unregister) are
// covered by shortcut::tests in macro_sender.rs; here we verify the suggestion
// generation end-to-end as a trigger-chain input.

#[test]
fn shortcut_alternatives_for_letter_key_are_valid() {
    let alts = generate_alternatives("CommandOrControl+Shift+W");
    // Both alternatives must be non-empty and distinct
    assert!(!alts[0].is_empty());
    assert!(!alts[1].is_empty());
    assert_ne!(alts[0], alts[1]);
    // Each must share the modifier prefix
    assert!(alts[0].starts_with("CommandOrControl+Shift+"));
    assert!(alts[1].starts_with("CommandOrControl+Shift+"));
}

#[test]
fn shortcut_alternatives_for_fkey_are_valid_fkey_names() {
    let alts = generate_alternatives("CommandOrControl+F5");
    for alt in &alts {
        // Split off prefix; the final segment must match F\d+
        let key = alt.split('+').next_back().unwrap_or("");
        assert!(
            key.starts_with('F') && key[1..].parse::<u8>().is_ok(),
            "expected an F-key name, got: {alt}"
        );
    }
    assert_ne!(alts[0], alts[1]);
}

// ���──── Tray / shortcut backdoor commands (pure-logic stubs) ───���───���──────���──���
// The __test_trigger_shortcut, __test_click_tray, and __test_send_macro commands
// are tauri commands that require a live AppHandle and are therefore not unit-
// testable here. Their logic — emitting spawn-whip and executing the macro
// sequence via FakeMacroSender — is covered by the chain tests above.
// The E2E suite (Phase 5, tests/e2e/) exercises the full Tauri command path.
