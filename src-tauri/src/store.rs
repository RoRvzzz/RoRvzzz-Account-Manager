//! Account model + encrypted persistence + shared application state.

use std::path::PathBuf;
use std::sync::Mutex;

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

use crate::crypto;
use crate::error::{AppError, AppResult};
use crate::settings::Settings;

/// A single Roblox account. The `.ROBLOSECURITY` cookie is the sensitive part
/// and is never sent to the frontend (see [`AccountView`]).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub user_id: i64,
    pub username: String,
    #[serde(default)]
    pub display_name: String,
    /// `.ROBLOSECURITY` cookie value.
    pub cookie: String,
    #[serde(default)]
    pub alias: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_group")]
    pub group: String,
    /// Stable per-account browser tracker id used when launching.
    #[serde(default)]
    pub browser_tracker_id: String,
    #[serde(default)]
    pub last_use: Option<String>,
    /// Saved launch target for this account.
    #[serde(default)]
    pub saved_place_id: Option<i64>,
    #[serde(default)]
    pub saved_job_id: String,
    /// Account password (only known if the user stored it). Never sent to the UI.
    #[serde(default)]
    pub password: String,
    /// Automatically relaunch this account if it leaves the game (Presence API).
    #[serde(default)]
    pub auto_relaunch: bool,
    /// Manual sort order within the list.
    #[serde(default)]
    pub order: i64,
}

fn default_group() -> String {
    "Default".to_string()
}

/// What the frontend is allowed to see — no cookie.
#[derive(Debug, Clone, Serialize)]
pub struct AccountView {
    pub user_id: i64,
    pub username: String,
    pub display_name: String,
    pub alias: String,
    pub description: String,
    pub group: String,
    pub last_use: Option<String>,
    pub saved_place_id: Option<i64>,
    pub saved_job_id: String,
    pub auto_relaunch: bool,
    pub order: i64,
    pub has_password: bool,
}

impl From<&Account> for AccountView {
    fn from(a: &Account) -> Self {
        AccountView {
            user_id: a.user_id,
            username: a.username.clone(),
            display_name: a.display_name.clone(),
            alias: a.alias.clone(),
            description: a.description.clone(),
            group: a.group.clone(),
            last_use: a.last_use.clone(),
            saved_place_id: a.saved_place_id,
            saved_job_id: a.saved_job_id.clone(),
            auto_relaunch: a.auto_relaunch,
            order: a.order,
            has_password: !a.password.is_empty(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AccountsFile {
    #[serde(default)]
    pub accounts: Vec<Account>,
}

/// Global mutable state managed by Tauri.
pub struct AppState {
    pub inner: Mutex<StateInner>,
}

pub struct StateInner {
    pub accounts: Vec<Account>,
    /// Password used to (de)crypt the accounts file. Defaults to empty so the
    /// app works out of the box; the user can set a master password later.
    pub password: String,
    pub loaded: bool,
    pub settings: Settings,
    /// Raw HANDLE (as isize) of the held Roblox singleton mutex, if any.
    pub mutex_handle: Option<isize>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            inner: Mutex::new(StateInner {
                accounts: Vec::new(),
                password: String::new(),
                loaded: false,
                settings: Settings::default(),
                mutex_handle: None,
            }),
        }
    }
}

pub fn data_dir() -> AppResult<PathBuf> {
    let dirs = ProjectDirs::from("com", "ram", "RobloxAccountManager")
        .ok_or_else(|| AppError::msg("could not resolve a data directory"))?;
    let dir = dirs.data_dir().to_path_buf();
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn accounts_path() -> AppResult<PathBuf> {
    Ok(data_dir()?.join("accounts.dat"))
}

/// Load and decrypt the accounts file with the given password.
pub fn load_accounts(password: &str) -> AppResult<Vec<Account>> {
    let path = accounts_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read(&path)?;
    let plain = crypto::decrypt(&data, password)?;
    let file: AccountsFile = serde_json::from_slice(&plain)?;
    Ok(file.accounts)
}

/// Encrypt and atomically write the accounts file.
pub fn save_accounts(accounts: &[Account], password: &str) -> AppResult<()> {
    let file = AccountsFile {
        accounts: accounts.to_vec(),
    };
    let plain = serde_json::to_vec(&file)?;
    let sealed = crypto::encrypt(&plain, password)?;

    let path = accounts_path()?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &sealed)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}
