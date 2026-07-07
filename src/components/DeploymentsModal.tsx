import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";

const BINARY_TYPES = [
  "WindowsPlayer",
  "WindowsStudio64",
  "MacPlayer",
  "MacStudio",
] as const;

const ARCHS: Record<string, string[]> = {
  WindowsPlayer: ["x86-64"],
  WindowsStudio64: ["x86-64"],
  MacPlayer: ["arm64", "x86-64"],
  MacStudio: ["arm64", "x86-64"],
};

const input =
  "rounded-lg border border-line bg-transparent px-3 py-2 text-[0.8rem] outline-none focus:border-white/20";
const btn =
  "rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[0.78rem] font-medium transition hover:bg-white/15 disabled:opacity-40";
const label = "mb-1 block text-[0.72rem] font-semibold text-dim";

export default function DeploymentsModal({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState("LIVE");
  const [binaryType, setBinaryType] = useState<string>("WindowsPlayer");
  const [arch, setArch] = useState("x86-64");
  const [version, setVersion] = useState("");
  const [compress, setCompress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const un = listen<string>("deploy-log", (e) =>
      setLog((prev) => [...prev.slice(-400), e.payload])
    );
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    setArch(ARCHS[binaryType][0]);
  }, [binaryType]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  async function fetchVersion() {
    try {
      const v = await api.getClientVersion(binaryType, channel || "LIVE");
      setVersion(v.client_version_upload);
      toast(`Current: ${v.version} (${v.client_version_upload})`);
    } catch (e) {
      toast(String(e), "err");
    }
  }

  async function download() {
    if (!version.trim()) {
      toast("Enter or fetch a version hash first", "err");
      return;
    }
    setBusy(true);
    setLog([]);
    try {
      const path = await api.downloadDeployment(
        channel || "LIVE",
        binaryType,
        arch,
        version.trim(),
        compress
      );
      toast("Saved to Downloads");
      setLog((prev) => [...prev, `Saved: ${path}`]);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Roblox Versions" onClose={onClose} maxWidth="560px">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Channel</label>
          <input
            className={`${input} w-full`}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="LIVE"
          />
        </div>
        <div>
          <label className={label}>Binary type</label>
          <select
            className={`${input} w-full`}
            value={binaryType}
            onChange={(e) => setBinaryType(e.target.value)}
          >
            {BINARY_TYPES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Architecture</label>
          <select
            className={`${input} w-full`}
            value={arch}
            onChange={(e) => setArch(e.target.value)}
          >
            {ARCHS[binaryType].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Version hash</label>
          <div className="flex gap-1.5">
            <input
              className={`${input} min-w-0 flex-1`}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="version-xxxxxxxx (blank = current)"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-[0.76rem] text-dim">
          <input
            type="checkbox"
            checked={compress}
            onChange={(e) => setCompress(e.target.checked)}
          />
          Compress zip (smaller, slower)
        </label>
        <button className={btn} onClick={fetchVersion} disabled={busy}>
          Get current version
        </button>
      </div>

      <div
        ref={logRef}
        className="mt-3 h-40 overflow-y-auto rounded-lg border border-line bg-black/20 p-2 font-mono text-[0.66rem] leading-relaxed text-dim"
      >
        {log.length === 0 ? (
          <span className="text-dim/60">
            Downloads a full client deployment zip to your Downloads folder.
          </span>
        ) : (
          log.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222]"
        >
          Close
        </button>
        <button onClick={download} disabled={busy} className={btn}>
          {busy ? "Downloading…" : "Download deployment"}
        </button>
      </div>
    </Modal>
  );
}
