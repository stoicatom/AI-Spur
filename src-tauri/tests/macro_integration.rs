use aispur::macro_sender::{FakeMacroSender, MacroCall, MacroSender};

/// Simulates the complete whip crack handler logic:
/// 1. Send interrupt (Ctrl+C)
/// 2. Type the phrase
/// 3. Press Enter
fn handle_whip_crack(sender: &dyn MacroSender, phrase: &str) -> Result<(), String> {
    sender
        .send_interrupt()
        .map_err(|e| format!("Interrupt failed: {}", e))?;
    sender
        .type_text(phrase)
        .map_err(|e| format!("Type text failed: {}", e))?;
    sender
        .press_enter()
        .map_err(|e| format!("Press enter failed: {}", e))?;
    Ok(())
}

#[test]
fn whip_crack_sends_complete_sequence() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "FASTER").unwrap();

    let calls = fake.get_calls();
    assert_eq!(calls.len(), 3, "Expected 3 calls: interrupt, text, enter");
    assert_eq!(calls[0], MacroCall::Interrupt);
    assert_eq!(calls[1], MacroCall::TypeText("FASTER".to_string()));
    assert_eq!(calls[2], MacroCall::Enter);
}

#[test]
fn whip_crack_preserves_call_order() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "KEEP GOING").unwrap();

    let calls = fake.get_calls();
    // Verify exact order: interrupt must come first, enter must be last
    assert!(matches!(calls[0], MacroCall::Interrupt));
    assert!(matches!(calls[2], MacroCall::Enter));
    assert!(matches!(calls[1], MacroCall::TypeText(ref t) if t == "KEEP GOING"));
}

#[test]
fn whip_crack_handles_unicode_phrases() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "加油 ❤️").unwrap();

    let calls = fake.get_calls();
    assert_eq!(calls[1], MacroCall::TypeText("加油 ❤️".to_string()));
}

#[test]
fn multiple_whip_cracks_accumulate_calls() {
    let fake = FakeMacroSender::new();
    handle_whip_crack(&fake, "FIRST").unwrap();
    handle_whip_crack(&fake, "SECOND").unwrap();

    let calls = fake.get_calls();
    assert_eq!(calls.len(), 6);
    assert_eq!(calls[0], MacroCall::Interrupt);
    assert_eq!(calls[1], MacroCall::TypeText("FIRST".to_string()));
    assert_eq!(calls[2], MacroCall::Enter);
    assert_eq!(calls[3], MacroCall::Interrupt);
    assert_eq!(calls[4], MacroCall::TypeText("SECOND".to_string()));
    assert_eq!(calls[5], MacroCall::Enter);
}
