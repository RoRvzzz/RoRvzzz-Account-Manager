mod commands;
mod crypto;
mod error;
mod favorites;
mod fps;
mod launcher;
mod nexus;
mod platform;
mod recents;
mod roblox;
mod settings;
mod store;
mod watcher;
mod webapi;

use nexus::NexusManager;
use store::AppState;
use webapi::WebApiManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .manage(NexusManager::new())
        .manage(WebApiManager::new())
        .setup(|app| {
            // Best-effort initial load with the default (empty) password so the
            // account list is populated immediately. If the file was saved under
            // a real master password, the frontend calls `unlock` with it.
            use tauri::Manager;
            let state = app.state::<AppState>();
            let loaded_settings = settings::load();
            if let Ok(accounts) = store::load_accounts("") {
                let mut guard = state.inner.lock().unwrap();
                guard.accounts = accounts;
                guard.loaded = true;
                // apply persisted multi-instance setting on startup
                if loaded_settings.multi_roblox {
                    platform::set_multi_instance(true, &mut guard.mutex_handle);
                }
                // apply persisted FPS + web API on startup
                if loaded_settings.fps_unlock {
                    fps::apply(true, loaded_settings.fps_value);
                }
                if loaded_settings.web_api_enabled {
                    webapi::start(
                        app.handle().clone(),
                        app.state::<WebApiManager>().inner().clone(),
                        loaded_settings.web_api_port,
                    );
                }
                guard.settings = loaded_settings;
            }
            // background watcher + auto-relauncher (act only while enabled)
            watcher::spawn(app.handle().clone());
            watcher::spawn_relauncher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::unlock,
            commands::list_accounts,
            commands::add_account,
            commands::add_accounts_bulk,
            commands::open_login_window,
            commands::check_login,
            commands::close_login_window,
            commands::remove_account,
            commands::save_launch,
            commands::set_auto_relaunch,
            commands::reorder_accounts,
            commands::reveal_password,
            commands::set_account_password,
            commands::get_recents,
            commands::add_recent,
            commands::set_display_name,
            commands::set_follow_privacy,
            commands::change_password,
            commands::change_email,
            commands::quick_login,
            commands::update_account,
            commands::get_robux,
            commands::get_presences,
            commands::get_thumbnails,
            commands::get_game_info,
            commands::launch_game,
            commands::reveal_cookie,
            commands::set_password,
            commands::get_settings,
            commands::save_settings,
            commands::follow_user,
            commands::list_servers,
            commands::browse_games,
            commands::parse_vip_link,
            commands::get_universe_id,
            commands::get_universe_places,
            commands::list_outfits,
            commands::wear_outfit,
            commands::get_favorites,
            commands::add_favorite,
            commands::remove_favorite,
            commands::nexus_status,
            commands::nexus_start,
            commands::nexus_stop,
            commands::nexus_execute,
            commands::nexus_teleport,
            commands::nexus_command,
            commands::nexus_lua,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
