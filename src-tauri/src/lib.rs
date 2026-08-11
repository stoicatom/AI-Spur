pub mod config;
pub mod macro_sender;

// Re-export commonly used types for integration tests
pub use config::Config;
pub use macro_sender::{EnigoSender, FakeMacroSender, MacroSender};
