//! Local favourite-games list (mirrors the original's local FavGames store).

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::store::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorite {
    pub place_id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub job_id: String,
}

fn path() -> AppResult<std::path::PathBuf> {
    Ok(data_dir()?.join("favorites.json"))
}

pub fn load() -> Vec<Favorite> {
    match path().and_then(|p| Ok(std::fs::read(p)?)) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn save(list: &[Favorite]) -> AppResult<()> {
    std::fs::write(path()?, serde_json::to_vec_pretty(list)?)?;
    Ok(())
}
