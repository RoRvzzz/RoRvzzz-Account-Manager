//! Tauri command surface exposed to the React frontend.
//!
//! Note: the shared state uses a std `Mutex`, so we never hold the lock across
//! an `.await`. The pattern throughout is: lock → copy what we need → unlock →
//! do async I/O → lock again to persist the result.

use rand::Rng;
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::deploy::{self, ClientVersion};
use crate::favorites::{self, Favorite};
use crate::fps;
use crate::nexus::{self, ConnectedAccount, NexusManager};
use crate::recents;
use crate::webapi::{self, WebApiManager};
use crate::platform;
use crate::roblox;
use crate::settings::{self, Settings};
use crate::store::{save_accounts, Account, AccountView, AppState};

const LOGIN_LABEL: &str = "roblox-login";

/// Persist the current in-memory accounts using the active password.
fn persist(state: &AppState) -> AppResult<()> {
    let guard = state.inner.lock().unwrap();
    save_accounts(&guard.accounts, &guard.password)
}

fn new_tracker_id() -> String {
    let mut rng = rand::thread_rng();
    format!(
        "{}{}",
        rng.gen_range(100000..175000),
        rng.gen_range(100000..900000)
    )
}

/// Build an [`Account`] from a validated authenticated-user response.
fn account_from_cookie(cookie: String, user: roblox::AuthenticatedUser) -> Account {
    Account {
        user_id: user.id,
        username: user.name,
        display_name: user.display_name,
        cookie,
        alias: String::new(),
        description: String::new(),
        group: "Default".to_string(),
        browser_tracker_id: new_tracker_id(),
        last_use: Some(chrono::Utc::now().to_rfc3339()),
        saved_place_id: None,
        saved_job_id: String::new(),
        password: String::new(),
        auto_relaunch: false,
        order: 0,
    }
}

/// Insert or update an account in the shared state, returning its view.
fn upsert(state: &AppState, account: Account) -> AccountView {
    let view = AccountView::from(&account);
    let mut guard = state.inner.lock().unwrap();
    if let Some(existing) = guard.accounts.iter_mut().find(|a| a.user_id == account.user_id) {
        existing.cookie = account.cookie;
        existing.username = account.username;
        existing.display_name = account.display_name;
        existing.last_use = account.last_use;
    } else {
        guard.accounts.push(account);
    }
    view
}

/// Load accounts from disk with the given (possibly empty) password.
#[tauri::command]
pub fn unlock(password: String, state: State<'_, AppState>) -> AppResult<Vec<AccountView>> {
    let accounts = crate::store::load_accounts(&password)?;
    let mut guard = state.inner.lock().unwrap();
    guard.accounts = accounts;
    guard.password = password;
    guard.loaded = true;
    Ok(guard.accounts.iter().map(AccountView::from).collect())
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> Vec<AccountView> {
    let guard = state.inner.lock().unwrap();
    guard.accounts.iter().map(AccountView::from).collect()
}

/// Add an account from a `.ROBLOSECURITY` cookie: validate it, dedupe by
/// user id, store, and return the resulting account.
#[tauri::command]
pub async fn add_account(
    cookie: String,
    state: State<'_, AppState>,
) -> AppResult<AccountView> {
    let cookie = cookie.trim().to_string();
    if cookie.is_empty() {
        return Err(AppError::msg("cookie is empty"));
    }

    let user = roblox::authenticated_user(&cookie).await?;
    let account = account_from_cookie(cookie, user);
    let view = upsert(&state, account);
    persist(&state)?;
    Ok(view)
}

#[derive(Serialize)]
pub struct BulkResult {
    pub added: Vec<AccountView>,
    pub failed: usize,
}

/// Add many accounts at once from a list of cookies (one per line upstream).
#[tauri::command]
pub async fn add_accounts_bulk(
    cookies: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<BulkResult> {
    let mut validated: Vec<Account> = Vec::new();
    let mut failed = 0usize;

    for raw in cookies {
        let cookie = raw.trim().to_string();
        if cookie.is_empty() {
            continue;
        }
        match roblox::authenticated_user(&cookie).await {
            Ok(user) => validated.push(account_from_cookie(cookie, user)),
            Err(_) => failed += 1,
        }
    }

    let added: Vec<AccountView> = validated
        .into_iter()
        .map(|acc| upsert(&state, acc))
        .collect();

    if !added.is_empty() {
        persist(&state)?;
    }
    Ok(BulkResult { added, failed })
}

/// Open a real Roblox login window. After the user signs in we can read the
/// `.ROBLOSECURITY` cookie from this webview (see [`check_login`]).
#[tauri::command]
pub async fn open_login_window(app: AppHandle) -> AppResult<()> {
    if let Some(win) = app.get_webview_window(LOGIN_LABEL) {
        let _ = win.set_focus();
        return Ok(());
    }

    let url = "https://www.roblox.com/login"
        .parse()
        .map_err(|_| AppError::msg("bad login url"))?;

    WebviewWindowBuilder::new(&app, LOGIN_LABEL, WebviewUrl::External(url))
        .title("Log in to Roblox")
        .inner_size(500.0, 720.0)
        .center()
        .build()
        .map_err(|e| AppError::msg(format!("failed to open login window: {e}")))?;
    Ok(())
}

/// Poll the login window's cookies. Returns the account once the user has
/// signed in, otherwise `None`. The frontend calls this on an interval.
#[tauri::command]
pub async fn check_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<AccountView>> {
    let Some(win) = app.get_webview_window(LOGIN_LABEL) else {
        return Ok(None);
    };

    let cookies = win
        .cookies()
        .map_err(|e| AppError::msg(format!("could not read cookies: {e}")))?;

    let security = cookies
        .iter()
        .find(|c| c.name() == ".ROBLOSECURITY")
        .map(|c| c.value().to_string());

    let Some(cookie) = security else {
        return Ok(None);
    };

    // A valid session token; validate then store.
    match roblox::authenticated_user(&cookie).await {
        Ok(user) => {
            let account = account_from_cookie(cookie, user);
            let view = upsert(&state, account);
            persist(&state)?;
            let _ = win.close();
            Ok(Some(view))
        }
        Err(_) => Ok(None),
    }
}

/// Close the login window if it's open (user cancelled).
#[tauri::command]
pub fn close_login_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window(LOGIN_LABEL) {
        let _ = win.close();
    }
}

#[tauri::command]
pub fn remove_account(user_id: i64, state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state.inner.lock().unwrap();
        guard.accounts.retain(|a| a.user_id != user_id);
    }
    persist(&state)
}

#[tauri::command]
pub fn update_account(
    user_id: i64,
    alias: Option<String>,
    description: Option<String>,
    group: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<AccountView> {
    let view = {
        let mut guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter_mut()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;

        if let Some(a) = alias {
            acc.alias = a.chars().take(50).collect();
        }
        if let Some(d) = description {
            acc.description = d.chars().take(5000).collect();
        }
        if let Some(g) = group {
            acc.group = if g.trim().is_empty() {
                "Default".into()
            } else {
                g
            };
        }
        AccountView::from(&*acc)
    };
    persist(&state)?;
    Ok(view)
}

/// Save a launch target (Place/Job) onto an account.
#[tauri::command]
pub fn save_launch(
    user_id: i64,
    place_id: Option<i64>,
    job_id: String,
    state: State<'_, AppState>,
) -> AppResult<AccountView> {
    let view = {
        let mut guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter_mut()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;
        acc.saved_place_id = place_id;
        acc.saved_job_id = job_id;
        AccountView::from(&*acc)
    };
    persist(&state)?;
    Ok(view)
}

#[tauri::command]
pub fn set_auto_relaunch(
    user_id: i64,
    enabled: bool,
    state: State<'_, AppState>,
) -> AppResult<AccountView> {
    let view = {
        let mut guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter_mut()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;
        acc.auto_relaunch = enabled;
        AccountView::from(&*acc)
    };
    persist(&state)?;
    Ok(view)
}

/// Apply a new manual order given the account ids top-to-bottom.
#[tauri::command]
pub fn reorder_accounts(ordered_ids: Vec<i64>, state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state.inner.lock().unwrap();
        for (i, id) in ordered_ids.iter().enumerate() {
            if let Some(acc) = guard.accounts.iter_mut().find(|a| a.user_id == *id) {
                acc.order = i as i64;
            }
        }
    }
    persist(&state)
}

#[tauri::command]
pub fn reveal_password(user_id: i64, state: State<'_, AppState>) -> AppResult<String> {
    let guard = state.inner.lock().unwrap();
    guard
        .accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .map(|a| a.password.clone())
        .ok_or_else(|| AppError::msg("account not found"))
}

#[tauri::command]
pub fn set_account_password(
    user_id: i64,
    password: String,
    state: State<'_, AppState>,
) -> AppResult<AccountView> {
    let view = {
        let mut guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter_mut()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;
        acc.password = password;
        AccountView::from(&*acc)
    };
    persist(&state)?;
    Ok(view)
}

#[tauri::command]
pub fn get_recents() -> Vec<recents::Recent> {
    recents::load()
}

#[tauri::command]
pub fn add_recent(place_id: i64, name: String) -> AppResult<Vec<recents::Recent>> {
    recents::push(place_id, name)
}

#[tauri::command]
pub async fn get_robux(user_id: i64, state: State<'_, AppState>) -> AppResult<i64> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::robux(&cookie).await
}

#[derive(Serialize)]
pub struct PresenceView {
    pub user_id: i64,
    pub presence_type: i64,
    pub last_location: String,
    pub place_id: Option<i64>,
}

/// Fetch presence for every stored account (uses the first account's cookie).
#[tauri::command]
pub async fn get_presences(state: State<'_, AppState>) -> AppResult<Vec<PresenceView>> {
    let (cookie, ids) = {
        let guard = state.inner.lock().unwrap();
        let ids: Vec<i64> = guard.accounts.iter().map(|a| a.user_id).collect();
        let cookie = guard.accounts.first().map(|a| a.cookie.clone());
        (cookie, ids)
    };

    let Some(cookie) = cookie else {
        return Ok(Vec::new());
    };
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let presences = roblox::presence(&cookie, &ids).await?;
    Ok(presences
        .into_iter()
        .map(|p| PresenceView {
            user_id: p.user_id,
            presence_type: p.user_presence_type,
            last_location: p.last_location,
            place_id: p.place_id,
        })
        .collect())
}

#[derive(Serialize)]
pub struct ThumbView {
    pub user_id: i64,
    pub image_url: String,
}

/// Fetch avatar-headshot thumbnail URLs for every stored account.
#[tauri::command]
pub async fn get_thumbnails(state: State<'_, AppState>) -> AppResult<Vec<ThumbView>> {
    let ids: Vec<i64> = {
        let guard = state.inner.lock().unwrap();
        guard.accounts.iter().map(|a| a.user_id).collect()
    };

    let thumbs = roblox::thumbnails(&ids).await?;
    Ok(thumbs
        .into_iter()
        .filter(|t| !t.image_url.is_empty())
        .map(|t| ThumbView {
            user_id: t.target_id,
            image_url: t.image_url,
        })
        .collect())
}

/// Look up game info for a Place ID (name, creator, players, icon).
#[tauri::command]
pub async fn get_game_info(place_id: i64) -> AppResult<roblox::GameInfo> {
    roblox::game_info(place_id).await
}

/// Launch a game for an account. `job_id` may be empty for a random server.
#[tauri::command]
pub async fn launch_game(
    user_id: i64,
    place_id: i64,
    job_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let (cookie, mut tracker, settings) = {
        let guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;
        (
            acc.cookie.clone(),
            acc.browser_tracker_id.clone(),
            guard.settings.clone(),
        )
    };

    if tracker.is_empty() {
        tracker = new_tracker_id();
    }

    crate::launcher::launch(&cookie, &tracker, place_id, &job_id, &settings).await?;

    // persist tracker + last use
    {
        let mut guard = state.inner.lock().unwrap();
        if let Some(acc) = guard.accounts.iter_mut().find(|a| a.user_id == user_id) {
            acc.browser_tracker_id = tracker;
            acc.last_use = Some(chrono::Utc::now().to_rfc3339());
        }
    }
    persist(&state)?;

    Ok("Launched".to_string())
}

/// Reveal a cookie so the frontend can copy it to the clipboard.
#[tauri::command]
pub fn reveal_cookie(user_id: i64, state: State<'_, AppState>) -> AppResult<String> {
    cookie_for(&state, user_id)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.inner.lock().unwrap().settings.clone()
}

/// Persist settings and apply side effects (multi-instance, FPS, web API).
#[tauri::command]
pub fn save_settings(
    new: Settings,
    app: AppHandle,
    state: State<'_, AppState>,
    webapi_mgr: State<'_, WebApiManager>,
) -> AppResult<Settings> {
    {
        let mut guard = state.inner.lock().unwrap();
        let was_multi = guard.settings.multi_roblox;
        if new.multi_roblox != was_multi {
            platform::set_multi_instance(new.multi_roblox, &mut guard.mutex_handle);
        }
        guard.settings = new.clone();
    }
    settings::save(&new)?;
    fps::apply(new.fps_unlock, new.fps_value);
    if new.web_api_enabled {
        webapi::start(app, (*webapi_mgr).clone(), new.web_api_port);
    } else {
        webapi::stop(&webapi_mgr);
    }
    Ok(new)
}

/// Re-encrypt the accounts file under a new master password.
#[tauri::command]
pub fn set_password(new_password: String, state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state.inner.lock().unwrap();
        guard.password = new_password;
    }
    persist(&state)
}

/* ── Follow a user into their game ───────────────────────────────────── */

#[tauri::command]
pub async fn follow_user(
    user_id: i64,
    username: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let (cookie, mut tracker) = {
        let guard = state.inner.lock().unwrap();
        let acc = guard
            .accounts
            .iter()
            .find(|a| a.user_id == user_id)
            .ok_or_else(|| AppError::msg("account not found"))?;
        (acc.cookie.clone(), acc.browser_tracker_id.clone())
    };
    if tracker.is_empty() {
        tracker = new_tracker_id();
    }

    let target_id = roblox::user_id_from_name(username.trim()).await?;
    let csrf = roblox::csrf_token(&cookie).await?;
    let ticket = roblox::auth_ticket(&cookie, &csrf).await?;
    let uri = roblox::build_follow_uri(&ticket, target_id, &tracker);
    platform::open_uri(&uri)?;
    Ok("Following".to_string())
}

/* ── Utilities: servers / games / universe / outfits ─────────────────── */

#[tauri::command]
pub async fn list_servers(place_id: i64, cursor: String) -> AppResult<roblox::ServerPage> {
    roblox::list_servers(place_id, cursor.trim()).await
}

#[tauri::command]
pub async fn browse_games(keyword: String) -> AppResult<Vec<roblox::GameCard>> {
    roblox::browse_games(&keyword).await
}

#[derive(Serialize)]
pub struct VipLink {
    pub place_id: i64,
    pub link_code: String,
}

/// Parse a pasted VIP/private-server link into a place id + link code.
#[tauri::command]
pub fn parse_vip_link(input: String) -> Option<VipLink> {
    roblox::parse_vip_link(&input).map(|(place_id, link_code)| VipLink {
        place_id,
        link_code,
    })
}

#[tauri::command]
pub async fn get_universe_id(place_id: i64) -> AppResult<i64> {
    roblox::place_universe_id(place_id).await
}

#[tauri::command]
pub async fn get_universe_places(universe_id: i64) -> AppResult<Vec<roblox::PlaceCard>> {
    roblox::universe_places(universe_id).await
}

#[tauri::command]
pub async fn list_outfits(username: String) -> AppResult<Vec<roblox::Outfit>> {
    let user_id = roblox::user_id_from_name(username.trim()).await?;
    roblox::list_outfits(user_id).await
}

#[tauri::command]
pub async fn wear_outfit(
    user_id: i64,
    outfit_id: i64,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::wear_outfit(&cookie, outfit_id).await
}

/* ── Favourites (local) ──────────────────────────────────────────────── */

#[tauri::command]
pub fn get_favorites() -> Vec<Favorite> {
    favorites::load()
}

#[tauri::command]
pub fn add_favorite(place_id: i64, name: String, job_id: String) -> AppResult<Vec<Favorite>> {
    let mut list = favorites::load();
    if !list.iter().any(|f| f.place_id == place_id) {
        list.push(Favorite {
            place_id,
            name,
            job_id,
        });
        favorites::save(&list)?;
    }
    Ok(list)
}

#[tauri::command]
pub fn remove_favorite(place_id: i64) -> AppResult<Vec<Favorite>> {
    let mut list = favorites::load();
    list.retain(|f| f.place_id != place_id);
    favorites::save(&list)?;
    Ok(list)
}

/* ── Nexus proxy / account control ───────────────────────────────────── */

#[derive(Serialize)]
pub struct NexusStatus {
    pub running: bool,
    pub port: u16,
    pub accounts: Vec<ConnectedAccount>,
}

#[tauri::command]
pub fn nexus_status(mgr: State<'_, NexusManager>) -> NexusStatus {
    let guard = mgr.inner.lock().unwrap();
    NexusStatus {
        running: guard.running,
        port: guard.port,
        accounts: guard
            .clients
            .iter()
            .map(|(name, c)| ConnectedAccount {
                username: name.clone(),
                user_id: c.user_id,
                job_id: c.job_id.clone(),
            })
            .collect(),
    }
}

#[tauri::command]
pub fn nexus_start(
    port: u16,
    app: AppHandle,
    mgr: State<'_, NexusManager>,
) -> AppResult<()> {
    nexus::start(app, (*mgr).clone(), port)
}

#[tauri::command]
pub fn nexus_stop(mgr: State<'_, NexusManager>) {
    nexus::stop(&mgr);
}

#[tauri::command]
pub fn nexus_execute(
    targets: Vec<String>,
    script: String,
    mgr: State<'_, NexusManager>,
) -> usize {
    nexus::send_to(&mgr, &targets, &format!("execute {script}"))
}

#[tauri::command]
pub fn nexus_teleport(
    targets: Vec<String>,
    place_id: i64,
    job_id: String,
    mgr: State<'_, NexusManager>,
) -> usize {
    let msg = format!("teleport {place_id} {}", job_id.trim());
    nexus::send_to(&mgr, &targets, msg.trim())
}

#[tauri::command]
pub fn nexus_command(
    targets: Vec<String>,
    message: String,
    mgr: State<'_, NexusManager>,
) -> usize {
    nexus::send_to(&mgr, &targets, &message)
}

/* ── Roblox version / deployment downloader ──────────────────────────── */

#[tauri::command]
pub async fn get_client_version(
    binary_type: String,
    channel: String,
) -> AppResult<ClientVersion> {
    deploy::client_version(&binary_type, &channel).await
}

/// Download & assemble a Roblox deployment into the user's Downloads folder.
#[tauri::command]
pub async fn download_deployment(
    app: AppHandle,
    channel: String,
    binary_type: String,
    arch: String,
    version: String,
    compress: bool,
) -> AppResult<String> {
    let dest = directories::UserDirs::new()
        .and_then(|d| d.download_dir().map(|p| p.to_path_buf()))
        .unwrap_or(std::env::temp_dir());

    let path = deploy::download_deployment(
        &app,
        &channel,
        &binary_type,
        &arch,
        &version,
        &dest,
        compress,
    )
    .await?;
    Ok(path.to_string_lossy().to_string())
}

/// The Nexus.lua client script, for the Help tab (load in your executor).
#[tauri::command]
pub fn nexus_lua() -> &'static str {
    include_str!("../resources/Nexus.lua")
}

/* ── Account utilities (change identity / login) ─────────────────────── */

#[tauri::command]
pub async fn set_display_name(
    user_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::set_display_name(&cookie, user_id, name.trim()).await
}

#[tauri::command]
pub async fn set_follow_privacy(
    user_id: i64,
    privacy: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::set_follow_privacy(&cookie, &privacy).await
}

#[tauri::command]
pub async fn change_password(
    user_id: i64,
    current: String,
    new: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    let rotated = roblox::change_password(&cookie, &current, &new).await?;
    {
        let mut guard = state.inner.lock().unwrap();
        if let Some(acc) = guard.accounts.iter_mut().find(|a| a.user_id == user_id) {
            acc.password = new;
            if let Some(new_cookie) = rotated {
                acc.cookie = new_cookie;
            }
        }
    }
    persist(&state)
}

#[tauri::command]
pub async fn change_email(
    user_id: i64,
    password: String,
    email: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::change_email(&cookie, &password, email.trim()).await
}

#[tauri::command]
pub async fn quick_login(
    user_id: i64,
    code: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let cookie = cookie_for(&state, user_id)?;
    roblox::quick_login(&cookie, code.trim()).await
}

fn cookie_for(state: &AppState, user_id: i64) -> AppResult<String> {
    let guard = state.inner.lock().unwrap();
    guard
        .accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .map(|a| a.cookie.clone())
        .ok_or_else(|| AppError::msg("account not found"))
}

