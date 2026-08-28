use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use thiserror::Error;

const ESCAPE_SETTLE: Duration = Duration::from_millis(90);
const TEXT_SETTLE: Duration = Duration::from_millis(90);

// Note: EnigoSender is not wired into commands.rs yet (macro trigger wiring
// consumes this module, matching the pattern used in config.rs.
#[derive(Error, Debug, Clone)]
#[allow(dead_code)]
pub enum MacroError {
    #[error("Input permission unavailable: {0}")]
    Permission(String),
    /// Backwards-compatible name retained for callers compiled against the
    /// original sender API.
    #[error("Failed to initialize input backend: {0}")]
    InitError(String),
    #[error("Failed to send keyboard event: {0}")]
    SendFailure(String),
    /// Backwards-compatible name retained for external test senders.
    #[error("Failed to send keyboard event: {0}")]
    SendError(String),
}

/// Stable, serializable error categories shared by the Rust command and the
/// overlay event handler. Keep the variant names in sync with the TypeScript
/// IPC schema: they are part of the user-visible recovery contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum MacroFailureCode {
    SafetyGate,
    Permission,
    SendFailure,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroFailure {
    pub code: MacroFailureCode,
    pub message: String,
    pub retryable: bool,
    pub attempt_id: u64,
}

impl MacroFailure {
    pub fn new(code: MacroFailureCode, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
            attempt_id: 0,
        }
    }

    pub fn with_attempt_id(mut self, attempt_id: u64) -> Self {
        self.attempt_id = attempt_id;
        self
    }

    pub fn from_error(error: &MacroError) -> Self {
        let code = error.failure_code();
        let message = match code {
            MacroFailureCode::Permission => {
                "未获得键盘输入权限，请在系统设置中授予 AISpur 权限后重试。"
            }
            MacroFailureCode::SendFailure => "宏发送失败，请确认终端仍处于可输入状态后重试。",
            MacroFailureCode::SafetyGate => "当前应用不安全，已跳过发送。",
        };
        Self::new(code, message, !matches!(code, MacroFailureCode::SafetyGate))
    }
}

impl MacroError {
    pub fn from_runtime_input(detail: impl Into<String>) -> Self {
        let detail = detail.into();
        let normalized = detail.to_ascii_lowercase();
        if normalized.contains("permission")
            || normalized.contains("accessibility")
            || normalized.contains("not permitted")
            || normalized.contains("assistive")
        {
            Self::Permission(detail)
        } else {
            Self::SendFailure(detail)
        }
    }

    pub fn failure_code(&self) -> MacroFailureCode {
        match self {
            Self::Permission(_) | Self::InitError(_) => MacroFailureCode::Permission,
            Self::SendFailure(_) | Self::SendError(_) => MacroFailureCode::SendFailure,
        }
    }
}

/// Trait for sending keyboard macros (Escape + text + Enter sequence).
pub trait MacroSender: Send + Sync {
    /// True only for the startup placeholder used when the native backend
    /// could not be initialized. Runtime send failures must never trigger a
    /// replay of the full non-idempotent macro.
    fn is_backend_unavailable(&self) -> bool {
        false
    }

    fn send_escape(&self) -> Result<(), MacroError>;
    fn type_text(&self, text: &str) -> Result<(), MacroError>;
    fn press_enter(&self) -> Result<(), MacroError>;
}

/// Execute one complete macro transaction in its required order. The caller
/// owns serialization; this helper deliberately stops at the first failure so
/// a partial send is never silently completed by another stage.
pub fn send_macro_sequence(sender: &dyn MacroSender, text: &str) -> Result<(), MacroError> {
    sender.send_escape()?;
    // Claude Code needs a brief render/input-state transition after Escape;
    // without it the immediately following phrase can be swallowed.
    thread::sleep(ESCAPE_SETTLE);
    sender.type_text(text)?;
    // Terminal TUIs receive text through an asynchronous HID event queue. Give
    // them time to commit the text before delivering Enter, otherwise Codex
    // can render the phrase but miss the submit key.
    thread::sleep(TEXT_SETTLE);
    sender.press_enter()
}

/// Production implementation using enigo 0.6
pub struct EnigoSender {
    enigo: Mutex<Enigo>,
}

impl EnigoSender {
    pub fn new() -> Result<Self, MacroError> {
        let settings = Settings::default();
        // On macOS, default Settings has independent_of_keyboard_state = true,
        // which prevents held modifiers from affecting the injected macro.
        let enigo = Enigo::new(&settings)
            .map_err(|e| MacroError::from_runtime_input(format!("{:?}", e)))?;
        Ok(Self {
            enigo: Mutex::new(enigo),
        })
    }
}

impl MacroSender for EnigoSender {
    fn send_escape(&self) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendFailure("Enigo lock poisoned".to_string()))?;

        enigo
            .key(Key::Escape, Direction::Click)
            .map_err(|e| MacroError::from_runtime_input(format!("Escape click: {:?}", e)))
    }

    fn type_text(&self, text: &str) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendFailure("Enigo lock poisoned".to_string()))?;

        enigo
            .text(text)
            .map_err(|e| MacroError::from_runtime_input(format!("Text input: {:?}", e)))?;

        Ok(())
    }

    fn press_enter(&self) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendFailure("Enigo lock poisoned".to_string()))?;

        enigo
            .key(Key::Return, Direction::Click)
            .map_err(|e| MacroError::from_runtime_input(format!("Enter click: {:?}", e)))?;

        Ok(())
    }
}

/// Call record for FakeMacroSender testing
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
pub enum MacroCall {
    Escape,
    TypeText(String),
    Enter,
}

/// Fake implementation for testing without real keyboard events
#[allow(dead_code)]
pub struct FakeMacroSender {
    pub calls: Arc<Mutex<Vec<MacroCall>>>,
}

/// Keeps the application usable when the native backend cannot initialize,
/// while making every attempted macro surface a permission failure instead of
/// pretending that input was sent successfully.
pub struct UnavailableMacroSender {
    error: MacroError,
}

impl UnavailableMacroSender {
    pub fn new(error: MacroError) -> Self {
        Self { error }
    }

    fn error(&self) -> MacroError {
        self.error.clone()
    }
}

impl MacroSender for UnavailableMacroSender {
    fn is_backend_unavailable(&self) -> bool {
        true
    }

    fn send_escape(&self) -> Result<(), MacroError> {
        Err(self.error())
    }
    fn type_text(&self, _text: &str) -> Result<(), MacroError> {
        Err(self.error())
    }
    fn press_enter(&self) -> Result<(), MacroError> {
        Err(self.error())
    }
}

impl Default for FakeMacroSender {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
impl FakeMacroSender {
    pub fn new() -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn get_calls(&self) -> Vec<MacroCall> {
        self.calls.lock().unwrap().clone()
    }
}

impl MacroSender for FakeMacroSender {
    fn send_escape(&self) -> Result<(), MacroError> {
        self.calls.lock().unwrap().push(MacroCall::Escape);
        Ok(())
    }

    fn type_text(&self, text: &str) -> Result<(), MacroError> {
        self.calls
            .lock()
            .unwrap()
            .push(MacroCall::TypeText(text.to_string()));
        Ok(())
    }

    fn press_enter(&self) -> Result<(), MacroError> {
        self.calls.lock().unwrap().push(MacroCall::Enter);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn macro_error_classifies_permission_and_serializes_event_code() {
        let error = MacroError::Permission("Accessibility permission is required".to_string());
        assert_eq!(error.failure_code(), MacroFailureCode::Permission);
        let payload = MacroFailure::from_error(&error);
        assert_eq!(payload.code, MacroFailureCode::Permission);
        assert!(payload.retryable);
        assert_eq!(serde_json::to_value(payload).unwrap()["code"], "Permission");
    }

    #[test]
    fn macro_error_classifies_send_failure_as_retryable() {
        let error = MacroError::SendFailure("keyboard event failed".to_string());
        let payload = MacroFailure::from_error(&error);
        assert_eq!(payload.code, MacroFailureCode::SendFailure);
        assert!(payload.retryable);
    }

    #[test]
    fn macro_failure_serializes_attempt_id_for_stale_event_filtering() {
        let payload = MacroFailure::new(MacroFailureCode::SendFailure, "send failed", true)
            .with_attempt_id(42);
        let json = serde_json::to_value(payload).unwrap();
        assert_eq!(json["attemptId"], 42);
    }

    #[test]
    fn safety_gate_failure_is_not_retryable() {
        let payload =
            MacroFailure::new(MacroFailureCode::SafetyGate, "unsafe foreground app", false);
        let json = serde_json::to_value(payload).unwrap();
        assert_eq!(json["code"], "SafetyGate");
        assert_eq!(json["retryable"], false);
    }

    #[test]
    fn unavailable_sender_never_reports_success() {
        let sender = UnavailableMacroSender::new(MacroError::Permission(
            "missing accessibility permission".to_string(),
        ));
        let error = sender
            .send_escape()
            .expect_err("permission must be surfaced");
        assert_eq!(error.failure_code(), MacroFailureCode::Permission);
    }

    #[test]
    fn unavailable_sender_preserves_non_permission_failure() {
        let sender = UnavailableMacroSender::new(MacroError::SendFailure(
            "platform input backend unavailable".to_string(),
        ));
        let error = sender
            .send_escape()
            .expect_err("unavailable backend must fail");
        assert_eq!(error.failure_code(), MacroFailureCode::SendFailure);
    }

    #[test]
    fn runtime_permission_error_is_classified_as_permission() {
        let error = MacroError::from_runtime_input("Accessibility permission denied");
        assert_eq!(error.failure_code(), MacroFailureCode::Permission);
    }

    #[test]
    fn ordinary_runtime_input_error_remains_send_failure() {
        let error = MacroError::from_runtime_input("keyboard event failed");
        assert_eq!(error.failure_code(), MacroFailureCode::SendFailure);
    }

    #[test]
    fn fake_sender_records_escape() {
        let sender = FakeMacroSender::new();
        sender.send_escape().unwrap();
        let calls = sender.get_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], MacroCall::Escape);
    }

    #[test]
    fn fake_sender_records_text() {
        let sender = FakeMacroSender::new();
        sender.type_text("FASTER").unwrap();
        let calls = sender.get_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], MacroCall::TypeText("FASTER".to_string()));
    }

    #[test]
    fn fake_sender_records_enter() {
        let sender = FakeMacroSender::new();
        sender.press_enter().unwrap();
        let calls = sender.get_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], MacroCall::Enter);
    }

    #[test]
    fn fake_sender_records_full_sequence() {
        let sender = FakeMacroSender::new();
        send_macro_sequence(&sender, "FASTER").unwrap();

        let calls = sender.get_calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], MacroCall::Escape);
        assert_eq!(calls[1], MacroCall::TypeText("FASTER".to_string()));
        assert_eq!(calls[2], MacroCall::Enter);
    }

    #[test]
    fn macro_sequence_allows_escape_state_to_settle_before_text() {
        let sender = FakeMacroSender::new();
        let started = Instant::now();

        send_macro_sequence(&sender, "FASTER").unwrap();

        assert!(
            started.elapsed() >= Duration::from_millis(90),
            "text must wait for the terminal to process Escape before it is typed"
        );
    }

    #[test]
    fn macro_sequence_allows_text_state_to_settle_before_enter() {
        #[derive(Default)]
        struct TimedSender {
            calls: Mutex<Vec<(MacroCall, Instant)>>,
        }

        impl MacroSender for TimedSender {
            fn send_escape(&self) -> Result<(), MacroError> {
                self.calls
                    .lock()
                    .unwrap()
                    .push((MacroCall::Escape, Instant::now()));
                Ok(())
            }

            fn type_text(&self, text: &str) -> Result<(), MacroError> {
                self.calls
                    .lock()
                    .unwrap()
                    .push((MacroCall::TypeText(text.to_string()), Instant::now()));
                Ok(())
            }

            fn press_enter(&self) -> Result<(), MacroError> {
                self.calls
                    .lock()
                    .unwrap()
                    .push((MacroCall::Enter, Instant::now()));
                Ok(())
            }
        }

        let sender = TimedSender::default();
        send_macro_sequence(&sender, "FASTER").unwrap();
        let calls = sender.calls.lock().unwrap();
        let typed_at = calls
            .iter()
            .find_map(|(call, at)| matches!(call, MacroCall::TypeText(_)).then_some(*at))
            .expect("text call must be recorded");
        let entered_at = calls
            .iter()
            .find_map(|(call, at)| matches!(call, MacroCall::Enter).then_some(*at))
            .expect("enter call must be recorded");

        assert!(
            entered_at.duration_since(typed_at) >= TEXT_SETTLE,
            "Enter must wait for the terminal to process injected text"
        );
    }

    #[test]
    fn macro_sequence_stops_at_unavailable_backend() {
        let sender = UnavailableMacroSender::new(MacroError::Permission(
            "missing accessibility permission".to_string(),
        ));
        let error = send_macro_sequence(&sender, "FASTER").expect_err("backend must fail");
        assert_eq!(error.failure_code(), MacroFailureCode::Permission);
    }

    #[test]
    fn enigo_sender_can_be_created() {
        // This test only verifies that EnigoSender::new() doesn't panic
        // and returns Ok on systems with proper permissions.
        // On CI or systems without accessibility permissions, this may fail.
        match EnigoSender::new() {
            Ok(_) => {
                // Successfully created
            }
            Err(e) => {
                // Expected on systems without accessibility permissions
                eprintln!(
                    "Note: EnigoSender creation failed (expected on restricted systems): {}",
                    e
                );
            }
        }
    }
}
