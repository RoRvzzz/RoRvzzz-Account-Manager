import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import Modal from "./Modal";
import { toast } from "../toast";

type Phase = "available" | "downloading" | "ready" | "error";

/**
 * Checks for updates on startup (and on the "ram:check-updates" event from
 * Settings). Shows a prompt when a newer signed release is available.
 */
export default function UpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [pct, setPct] = useState(0);

  async function runCheck(manual: boolean) {
    try {
      const u = await check();
      if (u) {
        setUpdate(u);
        setPhase("available");
      } else if (manual) {
        toast("You're on the latest version");
      }
    } catch (e) {
      // silent on startup; only surface for manual checks
      if (manual) toast(`Update check failed: ${e}`, "err");
    }
  }

  useEffect(() => {
    runCheck(false);
    const onManual = () => runCheck(true);
    window.addEventListener("ram:check-updates", onManual);
    return () => window.removeEventListener("ram:check-updates", onManual);
  }, []);

  async function install() {
    if (!update) return;
    setPhase("downloading");
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total) setPct(Math.min(100, Math.round((got / total) * 100)));
        } else if (e.event === "Finished") setPct(100);
      });
      setPhase("ready");
    } catch (e) {
      toast(`Update failed: ${e}`, "err");
      setPhase("error");
    }
  }

  if (!update) return null;

  return (
    <Modal
      title="Update available"
      onClose={phase === "downloading" ? () => {} : () => setUpdate(null)}
      maxWidth="380px"
    >
      <p className="text-[0.85rem] text-main">
        Version <span className="font-semibold text-white">{update.version}</span>{" "}
        is available{" "}
        <span className="text-dim">(you have {update.currentVersion})</span>.
      </p>

      {update.body && (
        <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-black/20 p-2.5 text-[0.72rem] leading-relaxed text-dim">
          {update.body}
        </pre>
      )}

      {phase === "downloading" && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[0.7rem] text-dim">
            <span>Downloading…</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-good transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {phase === "ready" ? (
          <button
            onClick={() => relaunch()}
            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15"
          >
            Restart to apply
          </button>
        ) : (
          <>
            <button
              onClick={() => setUpdate(null)}
              disabled={phase === "downloading"}
              className="rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222] disabled:opacity-40"
            >
              Later
            </button>
            <button
              onClick={install}
              disabled={phase === "downloading"}
              className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15 disabled:opacity-40"
            >
              {phase === "downloading" ? "Updating…" : "Update now"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
