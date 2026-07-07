//! OS-specific helpers: the Roblox singleton mutex (multi-instance) and
//! terminating a specific account's previous client.

use crate::error::{AppError, AppResult};

/// Open an arbitrary URI/protocol with the OS default handler.
pub fn open_uri(uri: &str) -> AppResult<()> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| AppError::msg(format!("failed to launch Roblox: {e}")))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| AppError::msg(format!("failed to launch Roblox: {e}")))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| AppError::msg(format!("failed to launch Roblox: {e}")))?;
    }
    Ok(())
}

/// Hold or release the Roblox singleton mutex. While held, additional Roblox
/// clients are allowed to run. `handle` stores the raw HANDLE as an isize so it
/// can live in shared state.
#[cfg(windows)]
pub fn set_multi_instance(enable: bool, handle: &mut Option<isize>) {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HANDLE};
    use windows::Win32::System::Threading::CreateMutexW;

    if enable {
        if handle.is_none() {
            unsafe {
                if let Ok(h) =
                    CreateMutexW(None, BOOL::from(true), &HSTRING::from("ROBLOX_singletonMutex"))
                {
                    *handle = Some(h.0 as isize);
                }
            }
        }
    } else if let Some(h) = handle.take() {
        unsafe {
            let _ = CloseHandle(HANDLE(h as *mut core::ffi::c_void));
        }
    }
}

#[cfg(not(windows))]
pub fn set_multi_instance(_enable: bool, _handle: &mut Option<isize>) {}

/// Kill any `RobloxPlayerBeta` process launched with the given browser-tracker
/// id (`-b <tracker>` on its command line).
pub fn close_instances_for_tracker(tracker: &str) {
    use sysinfo::{ProcessesToUpdate, System};

    if tracker.is_empty() {
        return;
    }

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let needle = format!("-b {tracker}");
    for process in sys.processes().values() {
        if !is_roblox(process) {
            continue;
        }
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        if cmd.contains(&needle) {
            process.kill();
        }
    }
}

fn is_roblox(process: &sysinfo::Process) -> bool {
    let name = process.name().to_string_lossy().to_ascii_lowercase();
    // Win32 client + Microsoft Store (UWP) client
    name.contains("robloxplayerbeta") || name.contains("windows10universal")
}

/// Kill any Roblox client using less than `min_mb` megabytes of memory.
/// Used by the watcher to close crashed / stuck clients.
pub fn close_low_memory(min_mb: u64) -> usize {
    use sysinfo::{ProcessesToUpdate, System};

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let min_bytes = min_mb.saturating_mul(1024 * 1024);
    let mut killed = 0;
    for process in sys.processes().values() {
        if is_roblox(process) && process.memory() > 0 && process.memory() < min_bytes {
            if process.kill() {
                killed += 1;
            }
        }
    }
    killed
}
