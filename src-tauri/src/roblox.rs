//! Thin async wrapper around the Roblox web APIs the manager needs.
//! Ported from the endpoints used in the original C# `Account` class.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
    (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .map_err(Into::into)
}

fn cookie_header(cookie: &str) -> String {
    format!(".ROBLOSECURITY={cookie}")
}

#[derive(Debug, Deserialize)]
pub struct AuthenticatedUser {
    pub id: i64,
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
}

/// Validate a `.ROBLOSECURITY` cookie and return the account it belongs to.
pub async fn authenticated_user(cookie: &str) -> AppResult<AuthenticatedUser> {
    let resp = client()?
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(AppError::msg(
            "invalid or expired cookie (authentication failed)",
        ));
    }
    Ok(resp.json::<AuthenticatedUser>().await?)
}

#[derive(Debug, Deserialize)]
struct Currency {
    robux: i64,
}

pub async fn robux(cookie: &str) -> AppResult<i64> {
    let resp = client()?
        .get("https://economy.roblox.com/v1/user/currency")
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch robux balance"));
    }
    Ok(resp.json::<Currency>().await?.robux)
}

/// POST to the auth-ticket endpoint without a token; Roblox replies 403 and
/// hands back a fresh `x-csrf-token` header.
pub async fn csrf_token(cookie: &str) -> AppResult<String> {
    let resp = client()?
        .post("https://auth.roblox.com/v1/authentication-ticket/")
        .header("Cookie", cookie_header(cookie))
        .header("Origin", "https://www.roblox.com")
        .header("Referer", "https://www.roblox.com/")
        .header("Content-Type", "application/json")
        .send()
        .await?;

    resp.headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::msg("account session expired (no x-csrf-token)"))
}

/// Exchange a valid csrf token for a one-time authentication ticket.
///
/// Roblox rotates the CSRF token aggressively: a request can be rejected with a
/// 403 that carries a *fresh* `x-csrf-token`. We retry once with that token,
/// which fixes the intermittent "no x-csrf-token" failures on older sessions.
pub async fn auth_ticket(cookie: &str, csrf: &str) -> AppResult<String> {
    let c = client()?;
    let mut token = csrf.to_string();

    for _ in 0..2 {
        let resp = c
            .post("https://auth.roblox.com/v1/authentication-ticket/")
            .header("Cookie", cookie_header(cookie))
            .header("X-CSRF-TOKEN", &token)
            .header("Origin", "https://www.roblox.com")
            .header("Referer", "https://www.roblox.com/games/4924922222/Brookhaven-RP")
            .header("Content-Type", "application/json")
            .send()
            .await?;

        if let Some(ticket) = resp
            .headers()
            .get("rbx-authentication-ticket")
            .and_then(|v| v.to_str().ok())
        {
            if !ticket.is_empty() {
                return Ok(ticket.to_string());
            }
        }

        // token rotated — grab the new one and try again
        match resp.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()) {
            Some(fresh) if fresh != token => token = fresh.to_string(),
            _ => break,
        }
    }

    Err(AppError::msg(
        "failed to get authentication ticket (the account's session has likely expired — re-add its cookie)",
    ))
}

/// POST with automatic CSRF retry: if the first call is rejected with a 403 and
/// a fresh token, retry once. `token` is updated to whatever ends up valid.
async fn csrf_post(
    c: &reqwest::Client,
    url: &str,
    cookie: &str,
    token: &mut String,
    body: serde_json::Value,
) -> AppResult<reqwest::Response> {
    let resp = c
        .post(url)
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &*token)
        .json(&body)
        .send()
        .await?;

    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        if let Some(fresh) = resp.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()) {
            *token = fresh.to_string();
            return Ok(c
                .post(url)
                .header("Cookie", cookie_header(cookie))
                .header("X-CSRF-TOKEN", &*token)
                .json(&body)
                .send()
                .await?);
        }
    }
    Ok(resp)
}

#[derive(Debug, Deserialize)]
pub struct Presence {
    #[serde(rename = "userPresenceType")]
    pub user_presence_type: i64,
    #[serde(rename = "lastLocation", default)]
    pub last_location: String,
    #[serde(rename = "placeId")]
    pub place_id: Option<i64>,
    #[serde(rename = "userId")]
    pub user_id: i64,
}

#[derive(Debug, Deserialize)]
struct PresenceResponse {
    #[serde(rename = "userPresences")]
    user_presences: Vec<Presence>,
}

pub async fn presence(cookie: &str, user_ids: &[i64]) -> AppResult<Vec<Presence>> {
    let resp = client()?
        .post("https://presence.roblox.com/v1/presence/users")
        .header("Cookie", cookie_header(cookie))
        .json(&serde_json::json!({ "userIds": user_ids }))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch presence"));
    }
    Ok(resp.json::<PresenceResponse>().await?.user_presences)
}

#[derive(Debug, Deserialize)]
pub struct Thumbnail {
    #[serde(rename = "targetId")]
    pub target_id: i64,
    #[serde(rename = "imageUrl", default)]
    pub image_url: String,
}

#[derive(Debug, Deserialize)]
struct ThumbnailResponse {
    data: Vec<Thumbnail>,
}

/// Batch-fetch avatar-headshot thumbnails. Returns CDN image URLs keyed by user
/// id. Public endpoint — no cookie required.
pub async fn thumbnails(user_ids: &[i64]) -> AppResult<Vec<Thumbnail>> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = user_ids
        .iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let url = format!(
        "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={ids}&size=150x150&format=Png&isCircular=false"
    );

    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch thumbnails"));
    }
    Ok(resp.json::<ThumbnailResponse>().await?.data)
}

/* ── Game info (Place ID → universe → details + icon) ────────────────── */

#[derive(Debug, Deserialize)]
struct UniverseIdResponse {
    #[serde(rename = "universeId")]
    universe_id: i64,
}

#[derive(Debug, Deserialize)]
struct GameCreator {
    #[serde(default)]
    name: String,
    #[serde(rename = "type", default)]
    creator_type: String,
}

#[derive(Debug, Deserialize)]
struct GameDetail {
    #[serde(default)]
    name: String,
    #[serde(default)]
    creator: Option<GameCreator>,
    #[serde(default)]
    playing: i64,
    #[serde(default)]
    visits: i64,
    #[serde(rename = "maxPlayers", default)]
    max_players: i64,
    #[serde(rename = "rootPlaceId", default)]
    root_place_id: i64,
}

#[derive(Debug, Deserialize)]
struct GamesResponse {
    data: Vec<GameDetail>,
}

/// Aggregated, frontend-friendly info about a place.
#[derive(Debug, Serialize)]
pub struct GameInfo {
    pub place_id: i64,
    pub universe_id: i64,
    pub name: String,
    pub creator: String,
    pub creator_type: String,
    pub playing: i64,
    pub visits: i64,
    pub max_players: i64,
    pub image_url: String,
}

async fn universe_id(place_id: i64) -> AppResult<i64> {
    let url = format!("https://apis.roblox.com/universes/v1/places/{place_id}/universe");
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("could not resolve universe for that Place ID"));
    }
    Ok(resp.json::<UniverseIdResponse>().await?.universe_id)
}

async fn game_icon(universe_id: i64) -> AppResult<String> {
    let url = format!(
        "https://thumbnails.roblox.com/v1/games/icons?universeIds={universe_id}&size=150x150&format=Png&isCircular=false"
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(String::new());
    }
    let parsed = resp.json::<ThumbnailResponse>().await?;
    Ok(parsed
        .data
        .into_iter()
        .next()
        .map(|t| t.image_url)
        .unwrap_or_default())
}

pub async fn game_info(place_id: i64) -> AppResult<GameInfo> {
    let universe = universe_id(place_id).await?;

    let details_url = format!("https://games.roblox.com/v1/games?universeIds={universe}");
    let resp = client()?.get(details_url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch game details"));
    }
    let detail = resp
        .json::<GamesResponse>()
        .await?
        .data
        .into_iter()
        .next()
        .ok_or_else(|| AppError::msg("no game found for that Place ID"))?;

    let image_url = game_icon(universe).await.unwrap_or_default();
    let creator = detail.creator.unwrap_or(GameCreator {
        name: String::new(),
        creator_type: String::new(),
    });

    Ok(GameInfo {
        place_id: if detail.root_place_id != 0 {
            detail.root_place_id
        } else {
            place_id
        },
        universe_id: universe,
        name: detail.name,
        creator: creator.name,
        creator_type: creator.creator_type,
        playing: detail.playing,
        visits: detail.visits,
        max_players: detail.max_players,
        image_url,
    })
}

#[derive(Debug, Deserialize)]
struct Server {
    id: String,
    #[serde(default)]
    playing: i64,
    #[serde(rename = "maxPlayers", default)]
    max_players: i64,
}

#[derive(Debug, Deserialize)]
struct ServersResponse {
    data: Vec<Server>,
}

/// Pick a public server's Job ID for a place. With `lowest`, chooses the
/// emptiest joinable server; otherwise a random non-full one.
pub async fn random_job_id(place_id: i64, lowest: bool) -> AppResult<String> {
    let url = format!(
        "https://games.roblox.com/v1/games/{place_id}/servers/Public?limit=100"
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(String::new());
    }

    let mut servers: Vec<Server> = resp
        .json::<ServersResponse>()
        .await?
        .data
        .into_iter()
        .filter(|s| s.max_players == 0 || s.playing < s.max_players)
        .collect();

    if servers.is_empty() {
        return Ok(String::new());
    }

    if lowest {
        servers.sort_by_key(|s| s.playing);
        Ok(servers.first().map(|s| s.id.clone()).unwrap_or_default())
    } else {
        use rand::seq::SliceRandom;
        Ok(servers
            .choose(&mut rand::thread_rng())
            .map(|s| s.id.clone())
            .unwrap_or_default())
    }
}

/* ── Server browser ──────────────────────────────────────────────────── */

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerInfo {
    pub id: String,
    #[serde(default)]
    pub playing: i64,
    #[serde(rename = "maxPlayers", default)]
    pub max_players: i64,
    #[serde(default)]
    pub ping: i64,
    #[serde(default)]
    pub fps: f64,
}

#[derive(Debug, Serialize)]
pub struct ServerPage {
    pub servers: Vec<ServerInfo>,
    pub next_cursor: String,
}

#[derive(Debug, Deserialize)]
struct RawServerPage {
    data: Vec<ServerInfo>,
    #[serde(rename = "nextPageCursor", default)]
    next_page_cursor: Option<String>,
}

pub async fn list_servers(place_id: i64, cursor: &str) -> AppResult<ServerPage> {
    let url = format!(
        "https://games.roblox.com/v1/games/{place_id}/servers/Public?limit=100&cursor={cursor}"
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to list servers"));
    }
    let raw = resp.json::<RawServerPage>().await?;
    Ok(ServerPage {
        servers: raw.data,
        next_cursor: raw.next_page_cursor.unwrap_or_default(),
    })
}

/* ── Games browser ───────────────────────────────────────────────────── */

#[derive(Debug, Serialize)]
pub struct GameCard {
    pub place_id: i64,
    pub name: String,
    pub player_count: i64,
    pub image_url: String,
}

struct ListGame {
    place_id: i64,
    name: String,
    player_count: i64,
}

/// Pull place id / name / player count from a JSON object regardless of the
/// exact casing Roblox uses across its several "games list" endpoints.
fn parse_list_game(v: &serde_json::Value) -> Option<ListGame> {
    let obj = v.as_object()?;
    let get_i64 = |keys: &[&str]| -> i64 {
        for k in keys {
            if let Some(n) = obj.get(*k).and_then(|x| x.as_i64()) {
                return n;
            }
        }
        0
    };
    let get_str = |keys: &[&str]| -> String {
        for k in keys {
            if let Some(s) = obj.get(*k).and_then(|x| x.as_str()) {
                return s.to_string();
            }
        }
        String::new()
    };

    let place_id = get_i64(&["placeId", "PlaceId", "PlaceID", "rootPlaceId"]);
    if place_id == 0 {
        return None;
    }
    Some(ListGame {
        place_id,
        name: get_str(&["name", "Name"]),
        player_count: get_i64(&["playerCount", "PlayerCount", "playing", "Playing"]),
    })
}

fn gen_session_id() -> String {
    use rand::RngCore;
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

/// Search games by keyword via Roblox's current omni-search API. (The legacy
/// `games/list` endpoints now return non-JSON, so we parse from text and walk
/// the result groups leniently.)
pub async fn browse_games(keyword: &str) -> AppResult<Vec<GameCard>> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://apis.roblox.com/search-api/omni-search?searchQuery={}&pageToken=&sessionId={}&pageType=all",
        urlencode(kw),
        gen_session_id()
    );

    let text = client()?
        .get(&url)
        .header("Referer", "https://www.roblox.com/")
        .send()
        .await?
        .text()
        .await?;

    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| AppError::msg("games search returned an unexpected response"))?;

    // walk searchResults[*].games / .contents collecting game objects
    let mut raw: Vec<serde_json::Value> = Vec::new();
    if let Some(results) = value.get("searchResults").and_then(|r| r.as_array()) {
        for group in results {
            for key in ["games", "contents"] {
                if let Some(arr) = group.get(key).and_then(|g| g.as_array()) {
                    raw.extend(arr.iter().cloned());
                }
            }
        }
    }
    let games: Vec<ListGame> = raw.iter().filter_map(parse_list_game).collect();

    if games.is_empty() {
        return Ok(Vec::new());
    }

    // fetch icons for the returned places in one batch
    let ids = games
        .iter()
        .map(|g| g.place_id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let icon_url = format!(
        "https://thumbnails.roblox.com/v1/places/gameicons?placeIds={ids}&size=150x150&format=Png&isCircular=false"
    );
    let mut icons = std::collections::HashMap::new();
    if let Ok(resp) = client()?.get(icon_url).send().await {
        if let Ok(parsed) = resp.json::<serde_json::Value>().await {
            if let Some(arr) = parsed.get("data").and_then(|d| d.as_array()) {
                for t in arr {
                    if let (Some(id), Some(u)) = (
                        t.get("targetId").and_then(|v| v.as_i64()),
                        t.get("imageUrl").and_then(|v| v.as_str()),
                    ) {
                        icons.insert(id, u.to_string());
                    }
                }
            }
        }
    }

    Ok(games
        .into_iter()
        .filter(|g| g.place_id != 0)
        .map(|g| GameCard {
            image_url: icons.get(&g.place_id).cloned().unwrap_or_default(),
            place_id: g.place_id,
            name: g.name,
            player_count: g.player_count,
        })
        .collect())
}

/* ── Universe places ─────────────────────────────────────────────────── */

#[derive(Debug, Serialize)]
pub struct PlaceCard {
    pub place_id: i64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct UniversePlace {
    id: i64,
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct UniversePlacesResp {
    data: Vec<UniversePlace>,
    #[serde(rename = "nextPageCursor", default)]
    next_page_cursor: Option<String>,
}

/// Resolve a Place ID to its universe id.
pub async fn place_universe_id(place_id: i64) -> AppResult<i64> {
    universe_id(place_id).await
}

pub async fn universe_places(universe: i64) -> AppResult<Vec<PlaceCard>> {
    let mut out = Vec::new();
    let mut cursor = String::new();
    loop {
        let url = format!(
            "https://develop.roblox.com/v1/universes/{universe}/places?sortOrder=Asc&limit=100&cursor={cursor}"
        );
        let resp = client()?.get(url).send().await?;
        if !resp.status().is_success() {
            break;
        }
        let page = resp.json::<UniversePlacesResp>().await?;
        for p in page.data {
            out.push(PlaceCard {
                place_id: p.id,
                name: p.name,
            });
        }
        match page.next_page_cursor {
            Some(c) if !c.is_empty() && out.len() < 500 => cursor = c,
            _ => break,
        }
    }
    Ok(out)
}

/* ── Outfits ─────────────────────────────────────────────────────────── */

#[derive(Debug, Serialize)]
pub struct Outfit {
    pub id: i64,
    pub name: String,
    pub image_url: String,
}

#[derive(Debug, Deserialize)]
struct RawOutfit {
    id: i64,
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct OutfitsResp {
    data: Vec<RawOutfit>,
}

pub async fn list_outfits(user_id: i64) -> AppResult<Vec<Outfit>> {
    let url = format!(
        "https://avatar.roblox.com/v1/users/{user_id}/outfits?page=1&itemsPerPage=50"
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch outfits"));
    }
    let outfits = resp.json::<OutfitsResp>().await?.data;
    if outfits.is_empty() {
        return Ok(Vec::new());
    }

    let ids = outfits
        .iter()
        .map(|o| o.id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let thumb_url = format!(
        "https://thumbnails.roblox.com/v1/users/outfits?userOutfitIds={ids}&size=150x150&format=Png&isCircular=false"
    );
    let mut thumbs = std::collections::HashMap::new();
    if let Ok(resp) = client()?.get(thumb_url).send().await {
        if let Ok(parsed) = resp.json::<serde_json::Value>().await {
            if let Some(arr) = parsed.get("data").and_then(|d| d.as_array()) {
                for t in arr {
                    if let (Some(id), Some(u)) = (
                        t.get("targetId").and_then(|v| v.as_i64()),
                        t.get("imageUrl").and_then(|v| v.as_str()),
                    ) {
                        thumbs.insert(id, u.to_string());
                    }
                }
            }
        }
    }

    Ok(outfits
        .into_iter()
        .map(|o| Outfit {
            image_url: thumbs.get(&o.id).cloned().unwrap_or_default(),
            id: o.id,
            name: o.name,
        })
        .collect())
}

/// Wear an outfit: fetch its details then apply assets/colors/scales.
pub async fn wear_outfit(cookie: &str, outfit_id: i64) -> AppResult<()> {
    let details_url = format!("https://avatar.roblox.com/v1/outfits/{outfit_id}/details");
    let details: serde_json::Value = client()?
        .get(details_url)
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?
        .json()
        .await?;

    let mut token = csrf_token(cookie).await?;
    let c = client()?;

    if let Some(assets) = details.get("assets") {
        let body = serde_json::json!({ "assets": assets });
        csrf_post(
            &c,
            "https://avatar.roblox.com/v2/avatar/set-wearing-assets",
            cookie,
            &mut token,
            body,
        )
        .await?;
    }
    if let Some(colors) = details.get("bodyColors") {
        csrf_post(
            &c,
            "https://avatar.roblox.com/v1/avatar/set-body-colors",
            cookie,
            &mut token,
            colors.clone(),
        )
        .await?;
    }
    if let Some(scale) = details.get("scale") {
        csrf_post(
            &c,
            "https://avatar.roblox.com/v1/avatar/set-scales",
            cookie,
            &mut token,
            scale.clone(),
        )
        .await?;
    }
    Ok(())
}

/* ── Follow user ─────────────────────────────────────────────────────── */

#[derive(Debug, Deserialize)]
struct UsernameLookup {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct UsernameLookupResp {
    data: Vec<UsernameLookup>,
}

pub async fn user_id_from_name(username: &str) -> AppResult<i64> {
    let body = serde_json::json!({ "usernames": [username], "excludeBannedUsers": false });
    let resp = client()?
        .post("https://users.roblox.com/v1/usernames/users")
        .json(&body)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to resolve username"));
    }
    resp.json::<UsernameLookupResp>()
        .await?
        .data
        .into_iter()
        .next()
        .map(|u| u.id)
        .ok_or_else(|| AppError::msg("no user found with that username"))
}

/// Launch URI that follows a user into their current game.
pub fn build_follow_uri(ticket: &str, target_user_id: i64, browser_tracker_id: &str) -> String {
    let launch_time = chrono::Utc::now().timestamp_millis();
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&browserTrackerId={bt}&userId={uid}",
        bt = browser_tracker_id,
        uid = target_user_id
    );
    let encoded = urlencode(&place_launcher);
    format!(
        "roblox-player:1+launchmode:play+gameinfo:{ticket}+launchtime:{lt}+placelauncherurl:{enc}+browsertrackerid:{bt}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp",
        ticket = ticket, lt = launch_time, enc = encoded, bt = browser_tracker_id
    )
}

/// Build the `roblox-player:` launch URI used by the modern (URI-protocol) join.
pub fn build_launch_uri(
    ticket: &str,
    place_id: i64,
    job_id: &str,
    browser_tracker_id: &str,
) -> String {
    let launch_time = chrono::Utc::now().timestamp_millis();

    let place_launcher = if job_id.is_empty() {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&browserTrackerId={bt}&placeId={pid}&isPlayTogetherGame=false",
            bt = browser_tracker_id,
            pid = place_id
        )
    } else {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGameJob&browserTrackerId={bt}&placeId={pid}&gameId={job}&isPlayTogetherGame=false",
            bt = browser_tracker_id,
            pid = place_id,
            job = job_id
        )
    };

    let encoded = urlencode(&place_launcher);

    format!(
        "roblox-player:1+launchmode:play+gameinfo:{ticket}+launchtime:{lt}+placelauncherurl:{enc}+browsertrackerid:{bt}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp",
        ticket = ticket,
        lt = launch_time,
        enc = encoded,
        bt = browser_tracker_id
    )
}

/* ── Account utilities ───────────────────────────────────────────────── */

async fn error_body(resp: reqwest::Response) -> String {
    resp.text().await.unwrap_or_default()
}

pub async fn set_display_name(cookie: &str, user_id: i64, name: &str) -> AppResult<()> {
    let csrf = csrf_token(cookie).await?;
    let resp = client()?
        .patch(format!(
            "https://users.roblox.com/v1/users/{user_id}/display-names"
        ))
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({ "newDisplayName": name }))
        .send()
        .await?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(AppError::msg(format!(
            "display name change failed: {}",
            error_body(resp).await
        )))
    }
}

/// `privacy`: All | Followers | Following | Friends | NoOne
pub async fn set_follow_privacy(cookie: &str, privacy: &str) -> AppResult<()> {
    let csrf = csrf_token(cookie).await?;
    let resp = client()?
        .post("https://www.roblox.com/account/settings/follow-me-privacy")
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Referer", "https://www.roblox.com/my/account")
        .form(&[("FollowMePrivacy", privacy)])
        .send()
        .await?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(AppError::msg("failed to change follow privacy"))
    }
}

/// Returns the rotated `.ROBLOSECURITY` cookie if Roblox issued a new one.
pub async fn change_password(
    cookie: &str,
    current: &str,
    new: &str,
) -> AppResult<Option<String>> {
    let csrf = csrf_token(cookie).await?;
    let resp = client()?
        .post("https://auth.roblox.com/v2/user/passwords/change")
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({ "currentPassword": current, "newPassword": new }))
        .send()
        .await?;
    if resp.status().is_success() {
        let new_cookie = resp
            .cookies()
            .find(|c| c.name() == ".ROBLOSECURITY")
            .map(|c| c.value().to_string());
        Ok(new_cookie)
    } else {
        Err(AppError::msg(format!(
            "password change failed: {}",
            error_body(resp).await
        )))
    }
}

pub async fn change_email(cookie: &str, password: &str, email: &str) -> AppResult<()> {
    let csrf = csrf_token(cookie).await?;
    let resp = client()?
        .post("https://accountsettings.roblox.com/v1/email")
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({ "password": password, "emailAddress": email }))
        .send()
        .await?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(AppError::msg("failed to change email (password may be wrong)"))
    }
}

/// Quick Log In: authorise a 6-digit device code shown on another device.
pub async fn quick_login(cookie: &str, code: &str) -> AppResult<()> {
    if code.len() != 6 {
        return Err(AppError::msg("code must be 6 characters"));
    }
    let csrf = csrf_token(cookie).await?;
    let c = client()?;

    let enter = c
        .post("https://apis.roblox.com/auth-token-service/v1/login/enterCode")
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await?;
    if !enter.status().is_success() {
        return Err(AppError::msg("invalid or expired code"));
    }

    let validate = c
        .post("https://apis.roblox.com/auth-token-service/v1/login/validateCode")
        .header("Cookie", cookie_header(cookie))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await?;
    if validate.status().is_success() {
        Ok(())
    } else {
        Err(AppError::msg("failed to confirm login"))
    }
}

/// Resolve a VIP/private server's access code from its link code by loading the
/// game page as the account (mirrors the original ParseAccessCode).
pub async fn private_access_code(
    cookie: &str,
    place_id: i64,
    link_code: &str,
) -> AppResult<String> {
    let url = format!(
        "https://www.roblox.com/games/{place_id}?privateServerLinkCode={link_code}"
    );
    let body = client()?
        .get(url)
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?
        .text()
        .await?;

    let re = regex::Regex::new(
        r"Roblox\.GameLauncher\.joinPrivateGame\(\d+\s*,\s*'([\w-]+)'",
    )
    .unwrap();
    re.captures(&body)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| AppError::msg("could not resolve the private server (bad link or no access)"))
}

/// Launch URI for a private (VIP) server.
pub fn build_private_uri(
    ticket: &str,
    place_id: i64,
    access_code: &str,
    link_code: &str,
    browser_tracker_id: &str,
) -> String {
    let launch_time = chrono::Utc::now().timestamp_millis();
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestPrivateGame&placeId={pid}&accessCode={ac}&linkCode={lc}",
        pid = place_id,
        ac = access_code,
        lc = link_code
    );
    let encoded = urlencode(&place_launcher);
    format!(
        "roblox-player:1+launchmode:play+gameinfo:{ticket}+launchtime:{lt}+placelauncherurl:{enc}+browsertrackerid:{bt}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp",
        ticket = ticket, lt = launch_time, enc = encoded, bt = browser_tracker_id
    )
}

/// Extract `(place_id, link_code)` from a VIP link pasted into the Place ID box.
pub fn parse_vip_link(input: &str) -> Option<(i64, String)> {
    let place_re = regex::Regex::new(r"games/(\d+)").ok()?;
    let code_re = regex::Regex::new(r"privateServerLinkCode=([\w-]+)").ok()?;
    let place = place_re
        .captures(input)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok())?;
    let code = code_re
        .captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())?;
    Some((place, code))
}

/// Minimal percent-encoding for the placelauncherurl query.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
