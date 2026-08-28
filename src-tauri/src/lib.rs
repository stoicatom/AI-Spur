pub mod config;
pub mod macro_sender;
pub mod overlay_placement;
pub mod pack_edit;
pub mod pack_icons;
pub mod packs;
pub mod shortcut;
pub mod skins;
pub mod sounds;
pub mod usage;

// Performance-critical modules exposed for benchmarking
#[cfg(target_os = "macos")]
pub mod target_window;

// Re-export commonly used types for integration tests
pub use config::Config;
pub use macro_sender::{
    EnigoSender, FakeMacroSender, MacroError, MacroFailure, MacroFailureCode, MacroSender,
    UnavailableMacroSender, send_macro_sequence,
};
pub use packs::{MaterialPack, PackManifest, SoundRecipe};
pub use skins::{SkinManifest, SkinSounds, SkinVisuals};
