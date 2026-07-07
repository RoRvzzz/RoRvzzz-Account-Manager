import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { ConnectedAccount } from "../types";

type Tab = "control" | "help";

const input =
  "rounded-lg border border-line bg-transparent px-3 py-2 text-[0.78rem] outline-none focus:border-white/20";
const btn =
  "rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[0.76rem] font-medium transition hover:bg-white/15 disabled:opacity-40";

export default function ControlPanelModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("control");
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(5242);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [placeId, setPlaceId] = useState("");
  const [jobId, setJobId] = useState("");
  const [command, setCommand] = useState("");
  const [script, setScript] = useState('print("Hello from Nexus!")');
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.nexusStatus().then((s) => {
      setRunning(s.running);
      setPort(s.port || 5242);
      setAccounts(s.accounts);
    });
    const unlisteners = [
      listen<ConnectedAccount[]>("nexus-accounts", (e) => setAccounts(e.payload)),
      listen<string>("nexus-log", (e) =>
        setLog((prev) => [...prev.slice(-200), e.payload])
      ),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((f) => f()));
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const targets = () => [...selected];

  async function toggleServer() {
    try {
      if (running) {
        await api.nexusStop();
        setRunning(false);
        toast("Nexus stopped");
      } else {
        await api.nexusStart(port);
        setRunning(true);
        toast(`Nexus listening on :${port}`);
      }
    } catch (e) {
      toast(String(e), "err");
    }
  }

  function toggleSel(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function send(fn: () => Promise<number>, label: string) {
    try {
      const n = await fn();
      toast(n ? `${label} → ${n} client(s)` : "No connected clients matched", n ? "ok" : "err");
    } catch (e) {
      toast(String(e), "err");
    }
  }

  return (
    <Modal title="Account Control" onClose={onClose} maxWidth="760px">
      <div className="mb-4 flex items-center gap-1">
        {(["control", "help"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[0.74rem] font-medium capitalize transition ${
              tab === t ? "bg-white/[0.08] text-white" : "text-dim hover:text-main"
            }`}
          >
            {t === "control" ? "Control Panel" : "Help"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-[0.72rem] ${
              running ? "text-good" : "text-dim"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${running ? "bg-good" : "bg-dim"}`}
            />
            {running ? "Running" : "Stopped"}
          </span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(+e.target.value || 5242)}
            disabled={running}
            className={`${input} w-20`}
          />
          <button onClick={toggleServer} className={btn}>
            {running ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {tab === "control" ? (
        <div className="flex gap-4">
          {/* connected accounts */}
          <div className="w-56 shrink-0">
            <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-dim">
              Connected ({accounts.length})
            </div>
            <div className="h-[320px] space-y-1 overflow-y-auto rounded-lg border border-line bg-darker/50 p-1.5">
              {accounts.length === 0 && (
                <div className="p-3 text-center text-[0.7rem] text-dim">
                  No clients connected. Load Nexus.lua in your executor.
                </div>
              )}
              {accounts.map((a) => (
                <label
                  key={a.username}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.username)}
                    onChange={() => toggleSel(a.username)}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[0.74rem]">{a.username}</div>
                    <div className="truncate font-mono text-[0.6rem] text-dim">
                      {a.job_id}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-1 text-[0.62rem] text-dim">
              None selected = broadcast to all
            </div>
          </div>

          {/* controls */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <input
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value.replace(/\D/g, ""))}
                placeholder="Place ID"
                className={`${input} w-24 shrink-0`}
              />
              <input
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="Job ID"
                className={`${input} min-w-0 flex-1`}
              />
              <button
                className={`${btn} shrink-0`}
                onClick={() =>
                  send(
                    () => api.nexusTeleport(targets(), parseInt(placeId, 10) || 0, jobId),
                    "Teleport"
                  )
                }
              >
                Teleport
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Raw command"
                className={`${input} min-w-0 flex-1`}
              />
              <button
                className={`${btn} shrink-0`}
                onClick={() => send(() => api.nexusCommand(targets(), command), "Command")}
              >
                Send
              </button>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              spellCheck={false}
              className="input-good h-24 w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-[0.74rem] outline-none focus:border-white/20"
            />
            <div className="flex justify-end">
              <button
                className={btn}
                onClick={() => send(() => api.nexusExecute(targets(), script), "Execute")}
              >
                Execute
              </button>
            </div>
            <div
              ref={logRef}
              className="h-24 overflow-y-auto rounded-lg border border-line bg-darker/50 p-2 font-mono text-[0.66rem] leading-relaxed text-dim"
            >
              {log.length === 0 ? (
                <span className="text-dim/60">Logs from connected clients appear here…</span>
              ) : (
                log.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </div>
        </div>
      ) : (
        <HelpTab />
      )}
    </Modal>
  );
}

function HelpTab() {
  const [lua, setLua] = useState("");
  useEffect(() => {
    api.nexusLua().then(setLua);
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-[0.78rem] leading-relaxed text-dim">
        Nexus is a proxy, not an executor. Start the server above, then run the
        script below in your own executor while in-game. Connected clients show
        up on the left and can be controlled / scripted.
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[0.72rem] font-semibold text-white">Nexus.lua</span>
        <button
          className="rounded-md border border-line bg-panel px-3 py-1 text-[0.68rem] hover:bg-[#222]"
          onClick={() => {
            navigator.clipboard.writeText(lua);
            toast("Nexus.lua copied");
          }}
        >
          Copy
        </button>
      </div>
      <pre className="h-[240px] overflow-auto rounded-lg border border-line bg-transparent p-3 font-mono text-[0.62rem] leading-relaxed text-dim">
        {lua}
      </pre>
    </div>
  );
}
