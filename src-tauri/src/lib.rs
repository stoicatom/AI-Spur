pub mod config;
pub mod macro_sender;
pub mod shortcut;

// Re-export commonly used types for integration tests
pub use config::Config;
pub use macro_sender::{EnigoSender, FakeMacroSender, MacroSender};
