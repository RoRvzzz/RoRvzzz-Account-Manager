# RoRvzzz Account Manager

[![release](https://github.com/RoRvzzz/RoRvzzz-Account-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/RoRvzzz/RoRvzzz-Account-Manager/actions/workflows/release.yml)
[![ci](https://github.com/RoRvzzz/RoRvzzz-Account-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/RoRvzzz/RoRvzzz-Account-Manager/actions/workflows/ci.yml)

A fast, modern Roblox account manager built with **Rust + Tauri v2** and a
**React + TypeScript + Tailwind CSS** UI. Frameless, dark, and lightweight.

Due to a revival and full rewrite of my [ruststrap](https://github.com/RoRvzzz/RustStrap) coming I will likely not be adding any more bootstrapping features past version control and exploiting syncing.


## Download

Grab the latest Windows installer (`.msi` or NSIS `-setup.exe`) from the
[Releases](https://github.com/RoRvzzz/RoRvzzz-Account-Manager/releases) page.

> Unsigned build - Windows SmartScreen may warn on first run
> (*More info → Run anyway*).

## Features

- **Cookie / bulk / browser login** - add accounts by `.ROBLOSECURITY` cookie,
  paste many at once, or sign in through a real Roblox login window.
- **Encrypted storage** - accounts are sealed with XChaCha20-Poly1305 (Argon2
  key) on-device; optional master password.
- **Launching** - CSRF + auth-ticket flow, shuffle to random servers, VIP /
  private-server links, close-previous-instance, multi-instance Roblox, FPS
  unlocker.
- **Utilities** - server browser, game search, favorites, universe viewer,
  outfit browser + wear, follow a user, Roblox watcher.
- **Account actions** - change display name / follow privacy / password /
  email, Quick Log In, copy cookie/password.
- **Automation** - auto-relaunch via the Presence API, background watcher,
  local HTTP API.
- **Organisation** - groups (numeric-prefix sorting), drag-to-reorder, per-
  account saved Place/Job, recent games, notes.
- **Theme editor**, live presence & robux, tooltips, and more.

## Development

```bash
npm install
npm run app        # tauri dev - desktop window with hot reload
```

Verify pieces independently:

```bash
npm run build                        # tsc + vite (frontend)
cargo check --manifest-path src-tauri/Cargo.toml
```

## Release a build

```bash
git tag v1.0.0
git push origin v1.0.0     # triggers the release workflow -> GitHub Release
```

## Architecture

```
src/                  React + TS + Tailwind frontend
  App.tsx             main window
  components/         title bar, account rows, modals
  api.ts              typed wrappers over Tauri invoke
src-tauri/src/
  crypto.rs           Argon2 + XChaCha20-Poly1305 file encryption
  store.rs            account model + encrypted persistence
  roblox.rs           async Roblox API client
  launcher.rs         shared launch pipeline
  nexus.rs            Nexus websocket proxy (account control)
  webapi.rs           local HTTP API
  watcher.rs          background watcher + auto-relauncher
  commands.rs         Tauri command surface
```

Cookies stay in the Rust process the frontend only ever receives a
cookie-free view of each account.

## Info
- This project is greatly inspired by icewolf's RAM, https://github.com/ic3w0lf22/Roblox-Account-Manager
- Credit to focats rblx swap for the UI inspo: https://github.com/focat69/rblxswap/
- https://discord.gg/macrostack for support

## Disclaimer

For managing your own accounts. Use responsibly and in line with Roblox's
Terms of Service.
