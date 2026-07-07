//! FPS unlocker via Roblox's ClientAppSettings.json (writes the target-FPS
//! FastFlag into every installed client version's ClientSettings folder).

use std::path::PathBuf;

fn version_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(local).join("Roblox").join("Versions"));
    }
    roots.push(PathBuf::from(
        r"C:\Program Files (x86)\Roblox\Versions",
    ));
    roots
}

/// Write (or clear) the FPS-unlock FastFlag across all installed clients.
/// `value` of 0 (or `enabled == false`) restores the default by writing `{}`.
pub fn apply(enabled: bool, value: u32) {
    let contents = if enabled && value > 0 {
        format!("{{\n  \"DFIntTaskSchedulerTargetFps\": {value}\n}}")
    } else {
        "{}".to_string()
    };

    for root in version_roots() {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir = entry.path();
            // only version folders that actually contain the player
            if !dir.join("RobloxPlayerBeta.exe").exists() {
                continue;
            }
            let settings_dir = dir.join("ClientSettings");
            if std::fs::create_dir_all(&settings_dir).is_ok() {
                let _ = std::fs::write(
                    settings_dir.join("ClientAppSettings.json"),
                    &contents,
                );
            }
        }
    }
}
