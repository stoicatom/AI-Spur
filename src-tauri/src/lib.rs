pub mod config;
pub mod macro_sender;
pub mod shortcut;
pub mod skins;
pub mod sounds;
pub mod usage;

// Re-export commonly used types for integration tests
pub use config::Config;
pub use macro_sender::{EnigoSender, FakeMacroSender, MacroSender};
pub use skins::{SkinManifest, SkinSounds, SkinVisuals};
