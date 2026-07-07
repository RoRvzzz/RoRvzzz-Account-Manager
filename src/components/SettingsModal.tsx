import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { Settings } from "../types";

type Tab = "display" | "launching" | "misc" | "theme" | "security" | "about";

export default function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const [tab, setTab] = useState<Tab>("display");
  const [s, setS] = useState<Settings | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings().then(setS);
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      const saved = await api.saveSettings(s);
      if (pw) await api.setPassword(pw);
      onSaved(saved);
      toast("Settings saved");
      onClose();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} maxWidth="460px">
      <div className="mb-4 flex gap-1">
        {(
          ["display", "launching", "misc", "theme", "security", "about"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[0.75rem] font-medium capitalize transition ${
              tab === t ? "bg-white/[0.08] text-white" : "text-dim hover:text-main"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!s ? (
        <div className="py-8 text-center text-sm text-dim">Loading…</div>
      ) : (
        <div className="min-h-[188px]">
          {tab === "display" && (
            <div className="space-y-1">
              <Toggle
                label="Hide usernames"
                desc="Show only the alias for each account"
                checked={s.hide_usernames}
                onChange={(v) => set("hide_usernames", v)}
              />
              <Toggle
                label="Disable avatar images"
                desc="Skip loading headshots (faster, less bandwidth)"
                checked={s.disable_images}
                onChange={(v) => set("disable_images", v)}
              />
              <Toggle
                label="Show presence"
                desc="Fetch online / in-game status"
                checked={s.show_presence}
                onChange={(v) => set("show_presence", v)}
              />
              <Row label="Refresh rate" desc="How often to poll presence & robux">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={10}
                    value={s.presence_rate}
                    onChange={(e) =>
                      set("presence_rate", Math.max(10, +e.target.value || 60))
                    }
                    className="w-16 rounded-md border border-line bg-transparent px-2 py-1 text-right text-[0.8rem] outline-none focus:border-white/20"
                  />
                  <span className="text-[0.72rem] text-dim">sec</span>
                </div>
              </Row>
            </div>
          )}

          {tab === "launching" && (
            <div className="space-y-1">
              <Toggle
                label="Multi-instance Roblox"
                desc="Allow several Roblox clients to run at once"
                checked={s.multi_roblox}
                onChange={(v) => set("multi_roblox", v)}
              />
              <Toggle
                label="Join random server"
                desc="Shuffle to a public server when no Job ID is set"
                checked={s.shuffle_job_id}
                onChange={(v) => set("shuffle_job_id", v)}
              />
              <Toggle
                label="Prefer emptiest server"
                desc="When shuffling, pick the lowest-population server"
                checked={s.shuffle_lowest}
                onChange={(v) => set("shuffle_lowest", v)}
                disabled={!s.shuffle_job_id}
              />
              <Toggle
                label="Close previous instance"
                desc="Kill this account's last client before relaunching"
                checked={s.close_previous}
                onChange={(v) => set("close_previous", v)}
              />
              <Toggle
                label="Microsoft Store (UWP) client"
                desc="Also target the UWP Roblox app when closing clients"
                checked={s.use_uwp}
                onChange={(v) => set("use_uwp", v)}
              />
            </div>
          )}

          {tab === "misc" && (
            <div className="space-y-1">
              <Toggle
                label="FPS unlocker"
                desc="Write the target-FPS FastFlag to ClientAppSettings"
                checked={s.fps_unlock}
                onChange={(v) => set("fps_unlock", v)}
              />
              <Row label="Target FPS" desc="0 = default (60)">
                <input
                  type="number"
                  min={0}
                  value={s.fps_value}
                  onChange={(e) => set("fps_value", Math.max(0, +e.target.value))}
                  className="w-20 rounded-md border border-line bg-transparent px-2 py-1 text-right text-[0.8rem] outline-none focus:border-white/20"
                />
              </Row>
              <Toggle
                label="Developer mode"
                desc="Reveal advanced tools"
                checked={s.developer_mode}
                onChange={(v) => set("developer_mode", v)}
              />
              <Toggle
                label="Local web API"
                desc="HTTP server to list & launch accounts"
                checked={s.web_api_enabled}
                onChange={(v) => set("web_api_enabled", v)}
              />
              <Row label="Web API port" desc="localhost only">
                <input
                  type="number"
                  value={s.web_api_port}
                  onChange={(e) => set("web_api_port", +e.target.value || 7963)}
                  className="w-24 rounded-md border border-line bg-transparent px-2 py-1 text-right text-[0.8rem] outline-none focus:border-white/20"
                />
              </Row>
              {s.web_api_enabled && (
                <p className="pt-1 text-[0.66rem] leading-relaxed text-dim">
                  Try{" "}
                  <span className="font-mono text-main">
                    http://127.0.0.1:{s.web_api_port}/accounts
                  </span>{" "}
                  and{" "}
                  <span className="font-mono text-main">
                    /launch?account=&lt;name&gt;&amp;placeId=&lt;id&gt;
                  </span>
                </p>
              )}
            </div>
          )}

          {tab === "theme" && (
            <div className="space-y-1">
              <ColorRow label="Background" value={s.theme_base} onChange={(v) => set("theme_base", v)} />
              <ColorRow label="Panels" value={s.theme_panel} onChange={(v) => set("theme_panel", v)} />
              <ColorRow label="Text" value={s.theme_main} onChange={(v) => set("theme_main", v)} />
              <ColorRow label="Accent (good)" value={s.theme_good} onChange={(v) => set("theme_good", v)} />
              <ColorRow label="Danger (bad)" value={s.theme_bad} onChange={(v) => set("theme_bad", v)} />
              <p className="pt-1 text-[0.66rem] text-dim">
                Colors apply after saving.
              </p>
            </div>
          )}

          {tab === "security" && (
            <div className="rounded-xl border border-line bg-panel p-4">
              <label className="mb-1.5 block text-[0.85rem] font-semibold text-white">
                Master password
              </label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Leave blank to keep current"
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-[0.8rem] outline-none focus:border-white/20"
              />
              <p className="mt-2 text-[0.7rem] leading-relaxed text-dim">
                The accounts file is re-encrypted with this password on save.
                You'll need it on next launch if set.
              </p>
            </div>
          )}

          {tab === "about" && (
            <div className="space-y-3 py-2 text-[0.8rem] leading-relaxed text-dim">
              <p className="text-white">Roblox Account Manager</p>
              <p>
                A Rust + Tauri + React rewrite of the original C# account
                manager. Accounts are stored encrypted on this device.
              </p>
              <p className="text-[0.72rem]">Version 1.0.0</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !s}
          className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-none">
      <div className="pr-4">
        <div className="text-[0.85rem] font-medium text-main">{label}</div>
        <div className="text-[0.7rem] text-dim">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-none">
      <span className="text-[0.85rem] font-medium text-main">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-md border border-line bg-transparent px-2 py-1 text-right font-mono text-[0.75rem] uppercase outline-none focus:border-white/20"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-line bg-darker"
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label} desc={desc}>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-[34px] shrink-0 rounded-full border transition ${
          checked
            ? "border-white/30 bg-white/20"
            : "border-line bg-darker"
        } ${disabled ? "opacity-40" : ""}`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all ${
            checked ? "left-[18px] bg-good" : "left-[2px] bg-dim"
          }`}
        />
      </button>
    </Row>
  );
}
