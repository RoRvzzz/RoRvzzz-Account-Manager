//! Background Roblox watcher. Runs continuously; acts only while enabled in
//! settings. Currently enforces the "close if memory is low" rule (the most
//! portable of the original watcher's checks) on the configured interval.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::platform;
use crate::roblox;
use crate::store::AppState;

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let (enabled, interval, close_mem, mem_mb) = {
                let state = app.state::<AppState>();
                let guard = state.inner.lock().unwrap();
                let s = &guard.settings;
                (
                    s.watcher_enabled,
                    s.watcher_scan_interval.max(1),
                    s.watcher_close_memory,
                    s.watcher_memory_mb,
                )
            };

            if enabled && close_mem {
                let killed = platform::close_low_memory(mem_mb);
                if killed > 0 {
                    let _ = app.emit(
                        "watcher-log",
                        format!("closed {killed} Roblox client(s) below {mem_mb} MB"),
                    );
                }
            }

            tokio::time::sleep(Duration::from_secs(interval)).await;
        }
    });
}

/// Auto-relaunch accounts flagged `auto_relaunch` that are no longer in-game,
/// using the Presence API (no executor needed). Runs every 30s with a per-
/// account cooldown so it can't spam-launch.
pub fn spawn_relauncher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut cooldown: HashMap<i64, Instant> = HashMap::new();

        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            // (user_id, cookie, tracker, place_id, job_id)
            let (probe_cookie, targets, settings) = {
                let state = app.state::<AppState>();
                let guard = state.inner.lock().unwrap();
                let targets: Vec<(i64, String, String, i64, String)> = guard
                    .accounts
                    .iter()
                    .filter(|a| a.auto_relaunch && a.saved_place_id.is_some())
                    .map(|a| {
                        (
                            a.user_id,
                            a.cookie.clone(),
                            a.browser_tracker_id.clone(),
                            a.saved_place_id.unwrap(),
                            a.saved_job_id.clone(),
                        )
                    })
                    .collect();
                let probe = guard.accounts.first().map(|a| a.cookie.clone());
                (probe, targets, guard.settings.clone())
            };

            if targets.is_empty() {
                continue;
            }
            let Some(probe_cookie) = probe_cookie else {
                continue;
            };

            let ids: Vec<i64> = targets.iter().map(|t| t.0).collect();
            let presences = roblox::presence(&probe_cookie, &ids).await.unwrap_or_default();
            let in_game: HashSet<i64> = presences
                .iter()
                .filter(|p| p.user_presence_type == 2)
                .map(|p| p.user_id)
                .collect();

            for (uid, cookie, tracker, place, job) in targets {
                if in_game.contains(&uid) {
                    continue;
                }
                if cooldown
                    .get(&uid)
                    .map_or(false, |t| t.elapsed() < Duration::from_secs(90))
                {
                    continue;
                }
                cooldown.insert(uid, Instant::now());
                let _ = crate::launcher::launch(&cookie, &tracker, place, &job, &settings).await;
                let _ = app.emit("watcher-log", format!("auto-relaunched {uid}"));
            }
        }
    });
}
