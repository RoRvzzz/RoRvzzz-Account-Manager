//! Minimal local HTTP API (localhost only). Lets other tools list accounts and
//! launch games with a simple request, mirroring the original's Local Web API.
//!
//!   GET /accounts                              -> JSON array of accounts
//!   GET /launch?account=<id|name>&placeId=&jobId=  -> launch that account

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::store::AppState;

#[derive(Clone)]
pub struct WebApiManager {
    running: Arc<AtomicBool>,
}

impl WebApiManager {
    pub fn new() -> Self {
        WebApiManager {
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn stop(mgr: &WebApiManager) {
    mgr.running.store(false, Ordering::SeqCst);
}

/// (Re)start the server on `port`. No-op-safe to call repeatedly.
pub fn start(app: AppHandle, mgr: WebApiManager, port: u16) {
    stop(&mgr);
    std::thread::sleep(Duration::from_millis(100)); // let an old loop exit
    mgr.running.store(true, Ordering::SeqCst);

    let running = mgr.running.clone();
    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(s) => s,
            Err(_) => {
                running.store(false, Ordering::SeqCst);
                return;
            }
        };
        while running.load(Ordering::SeqCst) {
            match server.recv_timeout(Duration::from_millis(500)) {
                Ok(Some(req)) => handle(&app, req),
                Ok(None) => continue,
                Err(_) => break,
            }
        }
    });
}

fn query<'a>(url: &'a str, key: &str) -> Option<String> {
    let q = url.split('?').nth(1)?;
    for pair in q.split('&') {
        let mut it = pair.splitn(2, '=');
        if it.next() == Some(key) {
            return it.next().map(|v| v.replace("%20", " "));
        }
    }
    None
}

fn handle(app: &AppHandle, req: tiny_http::Request) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/");

    let (status, body) = match path {
        "/accounts" => (200, accounts_json(app)),
        "/launch" => (200, do_launch(app, &url)),
        _ => (404, "{\"error\":\"not found\"}".to_string()),
    };

    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .unwrap();
    let response = tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(header);
    let _ = req.respond(response);
}

fn accounts_json(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let guard = state.inner.lock().unwrap();
    let list: Vec<serde_json::Value> = guard
        .accounts
        .iter()
        .map(|a| {
            serde_json::json!({
                "userId": a.user_id,
                "username": a.username,
                "alias": a.alias,
                "group": a.group,
            })
        })
        .collect();
    serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string())
}

fn do_launch(app: &AppHandle, url: &str) -> String {
    let Some(account) = query(url, "account") else {
        return "{\"error\":\"missing account\"}".to_string();
    };
    let place_id: i64 = query(url, "placeId")
        .and_then(|p| p.parse().ok())
        .unwrap_or(0);
    let job_id = query(url, "jobId").unwrap_or_default();
    if place_id == 0 {
        return "{\"error\":\"missing placeId\"}".to_string();
    }

    let state = app.state::<AppState>();
    let (cookie, tracker, settings) = {
        let guard = state.inner.lock().unwrap();
        let acc = guard.accounts.iter().find(|a| {
            a.user_id.to_string() == account
                || a.username.eq_ignore_ascii_case(&account)
                || a.alias.eq_ignore_ascii_case(&account)
        });
        match acc {
            Some(a) => (
                a.cookie.clone(),
                a.browser_tracker_id.clone(),
                guard.settings.clone(),
            ),
            None => return "{\"error\":\"account not found\"}".to_string(),
        }
    };

    tauri::async_runtime::spawn(async move {
        let _ = crate::launcher::launch(&cookie, &tracker, place_id, &job_id, &settings).await;
    });

    "{\"ok\":true}".to_string()
}
