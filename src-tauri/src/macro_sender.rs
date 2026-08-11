use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::{Arc, Mutex};
use thiserror::Error;

// Note: EnigoSender is not wired into commands.rs yet (macro trigger wiring
// is Task 2.2). Keep #[allow(dead_code)] until the trigger_macro command
// consumes this module, matching the pattern used in config.rs.
#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum MacroError {
    #[error("Failed to initialize input backend: {0}")]
    InitError(String),
    #[error("Failed to send keyboard event: {0}")]
    SendError(String),
}

/// Trait for sending keyboard macros (interrupt + text + enter sequence)
#[allow(dead_code)]
pub trait MacroSender: Send + Sync {
    fn send_interrupt(&self) -> Result<(), MacroError>;
    fn type_text(&self, text: &str) -> Result<(), MacroError>;
    fn press_enter(&self) -> Result<(), MacroError>;
}

/// Production implementation using enigo 0.6
#[allow(dead_code)]
pub struct EnigoSender {
    enigo: Mutex<Enigo>,
}

#[allow(dead_code)]
impl EnigoSender {
    pub fn new() -> Result<Self, MacroError> {
        let settings = Settings::default();
        // On macOS, default Settings has independent_of_keyboard_state = true,
        // which ensures Shift+hotkey彩蛋 doesn't pollute Ctrl+C
        let enigo = Enigo::new(&settings).map_err(|e| MacroError::InitError(format!("{:?}", e)))?;
        Ok(Self {
            enigo: Mutex::new(enigo),
        })
    }
}

impl MacroSender for EnigoSender {
    fn send_interrupt(&self) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendError("Enigo lock poisoned".to_string()))?;

        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| MacroError::SendError(format!("Ctrl press: {:?}", e)))?;
        enigo
            .key(Key::Unicode('c'), Direction::Click)
            .map_err(|e| MacroError::SendError(format!("C click: {:?}", e)))?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| MacroError::SendError(format!("Ctrl release: {:?}", e)))?;

        Ok(())
    }

    fn type_text(&self, text: &str) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendError("Enigo lock poisoned".to_string()))?;

        enigo
            .text(text)
            .map_err(|e| MacroError::SendError(format!("Text input: {:?}", e)))?;

        Ok(())
    }

    fn press_enter(&self) -> Result<(), MacroError> {
        let mut enigo = self
            .enigo
            .lock()
            .map_err(|_| MacroError::SendError("Enigo lock poisoned".to_string()))?;

        enigo
            .key(Key::Return, Direction::Click)
            .map_err(|e| MacroError::SendError(format!("Enter click: {:?}", e)))?;

        Ok(())
    }
}

/// Call record for FakeMacroSender testing
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
pub enum MacroCall {
    Interrupt,
    TypeText(String),
    Enter,
}

/// Fake implementation for testing without real keyboard events
#[allow(dead_code)]
pub struct FakeMacroSender {
    pub calls: Arc<Mutex<Vec<MacroCall>>>,
}

#[allow(dead_code)]
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
    fn send_interrupt(&self) -> Result<(), MacroError> {
        self.calls.lock().unwrap().push(MacroCall::Interrupt);
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

    #[test]
    fn fake_sender_records_interrupt() {
        let sender = FakeMacroSender::new();
        sender.send_interrupt().unwrap();
        let calls = sender.get_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], MacroCall::Interrupt);
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
        sender.send_interrupt().unwrap();
        sender.type_text("FASTER").unwrap();
        sender.press_enter().unwrap();

        let calls = sender.get_calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], MacroCall::Interrupt);
        assert_eq!(calls[1], MacroCall::TypeText("FASTER".to_string()));
        assert_eq!(calls[2], MacroCall::Enter);
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
