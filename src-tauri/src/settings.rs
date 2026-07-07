//! Persistent app settings (plain JSON, next to the encrypted accounts file).
//! Mirrors the subset of the original Roblox Account Manager options that are
//! meaningfully portable to this rewrite.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::store::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    // ── Display ──────────────────────────────────────────────
    pub hide_usernames: bool,
    pub disable_images: bool,
    pub show_presence: bool,
    /// Presence/robux refresh interval in seconds.
    pub presence_rate: u64,

    // ── Launching ────────────────────────────────────────────
    /// Hold the Roblox singleton mutex so multiple clients can run.
    pub multi_roblox: bool,
    /// Join a random public server when no Job ID is given.
    pub shuffle_job_id: bool,
    /// When shuffling, prefer the lowest-population server.
    pub shuffle_lowest: bool,
    /// Kill this account's previous client before launching again.
    pub close_previous: bool,
    /// Launch / target the Microsoft Store (UWP) Roblox client.
    pub use_uwp: bool,

    // ── Nexus ────────────────────────────────────────────────
    pub nexus_port: u16,

    // ── Watcher ──────────────────────────────────────────────
    pub watcher_enabled: bool,
    pub watcher_scan_interval: u64, // seconds
    pub watcher_close_memory: bool,
    pub watcher_memory_mb: u64,
    pub watcher_close_title: bool,
    pub watcher_window_title: String,
    pub watcher_save_positions: bool,
    pub watcher_ignore_existing: bool,

    // ── Misc / developer ─────────────────────────────────────
    pub developer_mode: bool,
    pub fps_unlock: bool,
    pub fps_value: u32,
    pub web_api_enabled: bool,
    pub web_api_port: u16,

    // ── Theme (hex colors; applied at runtime by the UI) ─────
    pub theme_base: String,
    pub theme_panel: String,
    pub theme_main: String,
    pub theme_good: String,
    pub theme_bad: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hide_usernames: false,
            disable_images: false,
            show_presence: true,
            presence_rate: 60,
            multi_roblox: false,
            shuffle_job_id: false,
            shuffle_lowest: false,
            close_previous: false,
            use_uwp: false,
            nexus_port: 5242,
            watcher_enabled: false,
            watcher_scan_interval: 6,
            watcher_close_memory: false,
            watcher_memory_mb: 200,
            watcher_close_title: false,
            watcher_window_title: "Roblox".to_string(),
            watcher_save_positions: false,
            watcher_ignore_existing: true,
            developer_mode: false,
            fps_unlock: false,
            fps_value: 240,
            web_api_enabled: false,
            web_api_port: 7963,
            theme_base: "#101010".to_string(),
            theme_panel: "#191919".to_string(),
            theme_main: "#f0f0f0".to_string(),
            theme_good: "#4ade80".to_string(),
            theme_bad: "#f87171".to_string(),
        }
    }
}

fn settings_path() -> AppResult<std::path::PathBuf> {
    Ok(data_dir()?.join("settings.json"))
}

pub fn load() -> Settings {
    let Ok(path) = settings_path() else {
        return Settings::default();
    };
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> AppResult<()> {
    let path = settings_path()?;
    std::fs::write(&path, serde_json::to_vec_pretty(settings)?)?;
    Ok(())
}
