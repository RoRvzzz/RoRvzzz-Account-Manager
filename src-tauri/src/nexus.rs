//! Nexus proxy — a WebSocket server that in-game Lua clients (Nexus.lua)
//! connect to, so the account control panel can drive them.
//!
//! Protocol (matches the original):
//!   * client connects to  ws://localhost:<port>/Nexus?name=&id=&jobId=
//!   * server → client:     space-separated text, e.g. `execute <lua>`
//!   * client → server:     JSON `{ "Name": "...", "Payload": { ... } }`

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::oneshot;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;

use crate::error::{AppError, AppResult};

pub struct Client {
    pub user_id: i64,
    pub job_id: String,
    pub sender: UnboundedSender<String>,
}

#[derive(Default)]
pub struct NexusInner {
    pub running: bool,
    pub port: u16,
    pub clients: HashMap<String, Client>,
    pub shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
pub struct NexusManager {
    pub inner: Arc<Mutex<NexusInner>>,
}

impl NexusManager {
    pub fn new() -> Self {
        NexusManager {
            inner: Arc::new(Mutex::new(NexusInner::default())),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct ConnectedAccount {
    pub username: String,
    pub user_id: i64,
    pub job_id: String,
}

fn emit_accounts(app: &AppHandle, mgr: &NexusManager) {
    let list: Vec<ConnectedAccount> = {
        let guard = mgr.inner.lock().unwrap();
        guard
            .clients
            .iter()
            .map(|(name, c)| ConnectedAccount {
                username: name.clone(),
                user_id: c.user_id,
                job_id: c.job_id.clone(),
            })
            .collect()
    };
    let _ = app.emit("nexus-accounts", list);
}

pub fn start(app: AppHandle, mgr: NexusManager, port: u16) -> AppResult<()> {
    {
        let guard = mgr.inner.lock().unwrap();
        if guard.running {
            return Err(AppError::msg("Nexus is already running"));
        }
    }

    let (tx, rx) = oneshot::channel();
    {
        let mut guard = mgr.inner.lock().unwrap();
        guard.running = true;
        guard.port = port;
        guard.shutdown = Some(tx);
    }

    let app2 = app.clone();
    let mgr2 = mgr.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_server(app2.clone(), mgr2.clone(), port, rx).await {
            let _ = app2.emit("nexus-log", format!("[server] {e}"));
        }
        let mut guard = mgr2.inner.lock().unwrap();
        guard.running = false;
        guard.clients.clear();
    });

    Ok(())
}

pub fn stop(mgr: &NexusManager) {
    let mut guard = mgr.inner.lock().unwrap();
    if let Some(tx) = guard.shutdown.take() {
        let _ = tx.send(());
    }
    guard.running = false;
    guard.clients.clear();
}

async fn run_server(
    app: AppHandle,
    mgr: NexusManager,
    port: u16,
    mut shutdown: oneshot::Receiver<()>,
) -> AppResult<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| AppError::msg(format!("could not bind port {port}: {e}")))?;

    let _ = app.emit("nexus-log", format!("[server] listening on :{port}"));

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accepted = listener.accept() => {
                if let Ok((stream, _)) = accepted {
                    tauri::async_runtime::spawn(handle_conn(app.clone(), mgr.clone(), stream));
                }
            }
        }
    }
    Ok(())
}

async fn handle_conn(app: AppHandle, mgr: NexusManager, stream: tokio::net::TcpStream) {
    // capture the request URI so we can read the ?name=&id=&jobId= query
    let mut uri = String::new();
    let ws = tokio_tungstenite::accept_hdr_async(stream, |req: &Request, resp: Response| {
        uri = req.uri().to_string();
        Ok(resp)
    })
    .await;

    let Ok(ws) = ws else { return };

    let parsed = url::Url::parse(&format!("ws://localhost{uri}")).ok();
    let mut name = String::new();
    let mut user_id = 0i64;
    let mut job_id = "UNKNOWN".to_string();
    if let Some(u) = parsed {
        for (k, v) in u.query_pairs() {
            match k.as_ref() {
                "name" => name = v.to_string(),
                "id" => user_id = v.parse().unwrap_or(0),
                "jobId" => job_id = v.to_string(),
                _ => {}
            }
        }
    }

    if name.is_empty() {
        return;
    }

    let (mut write, mut read) = ws.split();
    let (tx, mut rx) = unbounded_channel::<String>();

    {
        let mut guard = mgr.inner.lock().unwrap();
        guard.clients.insert(
            name.clone(),
            Client {
                user_id,
                job_id: job_id.clone(),
                sender: tx,
            },
        );
    }
    let _ = app.emit("nexus-log", format!("{name} connected"));
    emit_accounts(&app, &mgr);

    // writer task: forward outbound messages to the socket
    let writer = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // reader loop: handle client → server JSON commands
    while let Some(Ok(msg)) = read.next().await {
        if let Message::Text(text) = msg {
            handle_client_message(&app, &name, &text);
        }
    }

    writer.abort();
    {
        let mut guard = mgr.inner.lock().unwrap();
        guard.clients.remove(&name);
    }
    let _ = app.emit("nexus-log", format!("{name} disconnected"));
    emit_accounts(&app, &mgr);
}

fn handle_client_message(app: &AppHandle, name: &str, text: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return;
    };
    let cmd = value.get("Name").and_then(|v| v.as_str()).unwrap_or("");
    let payload = value.get("Payload");

    match cmd {
        "ping" => {}
        "Log" | "Echo" => {
            let content = payload
                .and_then(|p| p.get("Content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let _ = app.emit("nexus-log", format!("{name}: {content}"));
        }
        _ => {}
    }
}

/// Send a raw text message to the named clients (empty = broadcast to all).
pub fn send_to(mgr: &NexusManager, targets: &[String], message: &str) -> usize {
    let guard = mgr.inner.lock().unwrap();
    let mut sent = 0;
    if targets.is_empty() {
        for c in guard.clients.values() {
            if c.sender.send(message.to_string()).is_ok() {
                sent += 1;
            }
        }
    } else {
        for t in targets {
            if let Some(c) = guard.clients.get(t) {
                if c.sender.send(message.to_string()).is_ok() {
                    sent += 1;
                }
            }
        }
    }
    sent
}
