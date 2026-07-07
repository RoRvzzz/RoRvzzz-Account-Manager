//! Roblox deployment downloader — a Rust port of latte-soft/rdd.
//!
//! Fetches a specific Roblox client version from the setup CDN and assembles a
//! single zip (extracting Windows package blobs to their proper roots). Runs in
//! the backend, so there's no browser CORS restriction on mirrors.

use std::io::{Cursor, Read, Write};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

const HOST: &str = "https://setup.rbxcdn.com";

fn log(app: &AppHandle, msg: impl Into<String>) {
    let _ = app.emit("deploy-log", msg.into());
}

fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("RoRvzzz-Account-Manager")
        .build()
        .map_err(Into::into)
}

/// Windows package -> extraction root mapping (player).
fn player_roots(name: &str) -> Option<&'static str> {
    Some(match name {
        "RobloxApp.zip" | "redist.zip" | "WebView2.zip" => "",
        "shaders.zip" => "shaders/",
        "ssl.zip" => "ssl/",
        "WebView2RuntimeInstaller.zip" => "WebView2RuntimeInstaller/",
        "content-avatar.zip" => "content/avatar/",
        "content-configs.zip" => "content/configs/",
        "content-fonts.zip" => "content/fonts/",
        "content-sky.zip" => "content/sky/",
        "content-sounds.zip" => "content/sounds/",
        "content-textures2.zip" => "content/textures/",
        "content-models.zip" => "content/models/",
        "content-platform-fonts.zip" => "PlatformContent/pc/fonts/",
        "content-platform-dictionaries.zip" => "PlatformContent/pc/shared_compression_dictionaries/",
        "content-terrain.zip" => "PlatformContent/pc/terrain/",
        "content-textures3.zip" => "PlatformContent/pc/textures/",
        "extracontent-luapackages.zip" => "ExtraContent/LuaPackages/",
        "extracontent-translations.zip" => "ExtraContent/translations/",
        "extracontent-models.zip" => "ExtraContent/models/",
        "extracontent-textures.zip" => "ExtraContent/textures/",
        "extracontent-places.zip" => "ExtraContent/places/",
        _ => return None,
    })
}

/// Windows package -> extraction root mapping (studio).
fn studio_roots(name: &str) -> Option<&'static str> {
    Some(match name {
        "RobloxStudio.zip" | "redist.zip" | "Libraries.zip" | "LibrariesQt5.zip"
        | "WebView2.zip" | "WebView2RuntimeInstaller.zip" => "",
        "RibbonConfig.zip" => "RibbonConfig/",
        "shaders.zip" => "shaders/",
        "ssl.zip" => "ssl/",
        "Qml.zip" => "Qml/",
        "Plugins.zip" => "Plugins/",
        "StudioFonts.zip" => "StudioFonts/",
        "BuiltInPlugins.zip" => "BuiltInPlugins/",
        "ApplicationConfig.zip" => "ApplicationConfig/",
        "BuiltInStandalonePlugins.zip" => "BuiltInStandalonePlugins/",
        "content-qt_translations.zip" => "content/qt_translations/",
        "content-sky.zip" => "content/sky/",
        "content-fonts.zip" => "content/fonts/",
        "content-avatar.zip" => "content/avatar/",
        "content-models.zip" => "content/models/",
        "content-sounds.zip" => "content/sounds/",
        "content-configs.zip" => "content/configs/",
        "content-api-docs.zip" => "content/api_docs/",
        "content-textures2.zip" => "content/textures/",
        "content-studio_svg_textures.zip" => "content/studio_svg_textures/",
        "content-platform-fonts.zip" => "PlatformContent/pc/fonts/",
        "content-platform-dictionaries.zip" => "PlatformContent/pc/shared_compression_dictionaries/",
        "content-terrain.zip" => "PlatformContent/pc/terrain/",
        "content-textures3.zip" => "PlatformContent/pc/textures/",
        "extracontent-translations.zip" => "ExtraContent/translations/",
        "extracontent-luapackages.zip" => "ExtraContent/LuaPackages/",
        "extracontent-textures.zip" => "ExtraContent/textures/",
        "extracontent-scripts.zip" => "ExtraContent/scripts/",
        "extracontent-models.zip" => "ExtraContent/models/",
        "studiocontent-models.zip" => "StudioContent/models/",
        "studiocontent-textures.zip" => "StudioContent/textures/",
        _ => return None,
    })
}

#[derive(Debug, Serialize)]
pub struct ClientVersion {
    pub version: String,
    pub client_version_upload: String,
    pub bootstrapper_version: String,
}

/// Look up the current version for a binary type on a channel.
pub async fn client_version(binary_type: &str, channel: &str) -> AppResult<ClientVersion> {
    let ch = if channel.is_empty() { "LIVE" } else { channel };
    let url = format!(
        "https://clientsettings.roblox.com/v2/client-version/{binary_type}/channel/{ch}"
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg("failed to fetch client version"));
    }
    let v: serde_json::Value = resp.json().await?;
    let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    Ok(ClientVersion {
        version: get("version"),
        client_version_upload: get("clientVersionUpload"),
        bootstrapper_version: get("bootstrapperVersion"),
    })
}

fn blob_dir(binary_type: &str, arch: &str) -> String {
    match binary_type {
        "MacPlayer" | "MacStudio" => {
            if arch == "arm64" {
                "/mac/arm64/".into()
            } else {
                "/mac/".into()
            }
        }
        _ => "/".into(),
    }
}

/// Download & assemble a deployment, returning the saved file path.
pub async fn download_deployment(
    app: &AppHandle,
    channel: &str,
    binary_type: &str,
    arch: &str,
    version: &str,
    dest_dir: &std::path::Path,
    compress: bool,
) -> AppResult<std::path::PathBuf> {
    let channel = if channel.is_empty() { "LIVE" } else { channel };
    let mut version = version.trim().to_lowercase();
    if !version.starts_with("version-") {
        version = format!("version-{version}");
    }

    let channel_path = if channel.eq_ignore_ascii_case("LIVE") {
        HOST.to_string()
    } else {
        format!("{HOST}/channel/{}", channel.to_lowercase())
    };
    let version_path = format!("{channel_path}{}{version}-", blob_dir(binary_type, arch));

    let out_name = format!("{channel}-{binary_type}-{version}.zip");
    let out_path = dest_dir.join(&out_name);
    let c = client()?;

    // Mac: a single archive
    if binary_type == "MacPlayer" || binary_type == "MacStudio" {
        let zip_name = if binary_type == "MacPlayer" {
            "RobloxPlayer.zip"
        } else {
            "RobloxStudioApp.zip"
        };
        log(app, format!("[+] Downloading {zip_name}…"));
        let bytes = c.get(format!("{version_path}{zip_name}")).send().await?.bytes().await?;
        std::fs::write(&out_path, &bytes)?;
        log(app, format!("[+] Saved {out_name}"));
        return Ok(out_path);
    }

    // Windows: fetch the package manifest (fall back to channel/common)
    log(app, format!("[+] Fetching rbxPkgManifest for {version}@{channel}…"));
    let mut vpath = version_path.clone();
    let mut manifest = c.get(format!("{vpath}rbxPkgManifest.txt")).send().await?;
    if !manifest.status().is_success() {
        vpath = format!("{HOST}/channel/common{}{version}-", blob_dir(binary_type, arch));
        manifest = c.get(format!("{vpath}rbxPkgManifest.txt")).send().await?;
    }
    if !manifest.status().is_success() {
        return Err(AppError::msg("failed to fetch rbxPkgManifest (bad version/channel?)"));
    }
    let body = manifest.text().await?;
    let lines: Vec<String> = body.lines().map(|l| l.trim().to_string()).collect();
    if lines.first().map(|s| s.as_str()) != Some("v0") {
        return Err(AppError::msg("unknown rbxPkgManifest format (expected v0)"));
    }

    let is_studio = lines.iter().any(|l| l == "RobloxStudio.zip");
    let is_player = lines.iter().any(|l| l == "RobloxApp.zip");
    if binary_type == "WindowsStudio64" && !is_studio {
        return Err(AppError::msg("manifest is not a Studio build"));
    }
    if binary_type == "WindowsPlayer" && !is_player {
        return Err(AppError::msg("manifest is not a Player build"));
    }
    let root_of = if is_studio { studio_roots } else { player_roots };

    // Assemble the output zip on disk
    let file = std::fs::File::create(&out_path)?;
    let mut out = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(if compress {
            zip::CompressionMethod::Deflated
        } else {
            zip::CompressionMethod::Stored
        });

    out.start_file("AppSettings.xml", opts)
        .map_err(|e| AppError::msg(e.to_string()))?;
    out.write_all(
        b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Settings>\n\t<ContentFolder>content</ContentFolder>\n\t<BaseUrl>http://www.roblox.com</BaseUrl>\n</Settings>\n",
    )?;

    let packages: Vec<&String> = lines.iter().filter(|l| l.ends_with(".zip")).collect();
    let total = packages.len();
    for (i, pkg) in packages.iter().enumerate() {
        log(app, format!("[+] ({}/{total}) {pkg}", i + 1));
        let data = c.get(format!("{vpath}{pkg}")).send().await?.bytes().await?;

        match root_of(pkg) {
            None => {
                // unknown package — drop at root
                out.start_file(pkg.as_str(), opts)
                    .map_err(|e| AppError::msg(e.to_string()))?;
                out.write_all(&data)?;
            }
            Some(root) => {
                let mut archive = zip::ZipArchive::new(Cursor::new(&data))
                    .map_err(|e| AppError::msg(e.to_string()))?;
                for j in 0..archive.len() {
                    let mut entry = archive.by_index(j).map_err(|e| AppError::msg(e.to_string()))?;
                    let name = entry.name().replace('\\', "/");
                    if name.ends_with('/') {
                        continue;
                    }
                    let mut buf = Vec::with_capacity(entry.size() as usize);
                    entry.read_to_end(&mut buf)?;
                    out.start_file(format!("{root}{name}"), opts)
                        .map_err(|e| AppError::msg(e.to_string()))?;
                    out.write_all(&buf)?;
                }
            }
        }
    }

    out.finish().map_err(|e| AppError::msg(e.to_string()))?;
    log(app, format!("[+] Done — saved {out_name}"));
    Ok(out_path)
}
