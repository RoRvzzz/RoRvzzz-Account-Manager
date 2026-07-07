//! Recently launched games (local, most-recent-first, capped).

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::store::data_dir;

const MAX: usize = 15;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recent {
    pub place_id: i64,
    #[serde(default)]
    pub name: String,
}

fn path() -> AppResult<std::path::PathBuf> {
    Ok(data_dir()?.join("recents.json"))
}

pub fn load() -> Vec<Recent> {
    match path().and_then(|p| Ok(std::fs::read(p)?)) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn push(place_id: i64, name: String) -> AppResult<Vec<Recent>> {
    let mut list = load();
    list.retain(|r| r.place_id != place_id);
    list.insert(0, Recent { place_id, name });
    list.truncate(MAX);
    std::fs::write(path()?, serde_json::to_vec_pretty(&list)?)?;
    Ok(list)
}
