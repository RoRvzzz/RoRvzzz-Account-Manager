//! Shared launch pipeline used by both the `launch_game` command and the
//! auto-relauncher, so behaviour (shuffle, close-previous, VIP, FPS) matches.

use crate::error::AppResult;
use crate::fps;
use crate::platform;
use crate::roblox;
use crate::settings::Settings;

pub async fn launch(
    cookie: &str,
    tracker: &str,
    place_id: i64,
    job_id: &str,
    settings: &Settings,
) -> AppResult<()> {
    if settings.close_previous {
        platform::close_instances_for_tracker(tracker);
    }

    let mut job = job_id.trim().to_string();
    if job.is_empty() && settings.shuffle_job_id {
        job = roblox::random_job_id(place_id, settings.shuffle_lowest)
            .await
            .unwrap_or_default();
    }

    let csrf = roblox::csrf_token(cookie).await?;
    let ticket = roblox::auth_ticket(cookie, &csrf).await?;

    let link_code = job
        .split("privateServerLinkCode=")
        .nth(1)
        .map(|s| s.split(['&', ' ']).next().unwrap_or("").to_string())
        .filter(|s| !s.is_empty());

    let uri = if let Some(code) = link_code {
        let access = roblox::private_access_code(cookie, place_id, &code).await?;
        roblox::build_private_uri(&ticket, place_id, &access, &code, tracker)
    } else {
        roblox::build_launch_uri(&ticket, place_id, &job, tracker)
    };

    if settings.fps_unlock {
        fps::apply(true, settings.fps_value);
    }

    platform::open_uri(&uri)
}
