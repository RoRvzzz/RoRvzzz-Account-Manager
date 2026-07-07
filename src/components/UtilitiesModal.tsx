import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type {
  AccountView,
  ServerInfo,
  GameCard,
  PlaceCard,
  Outfit,
  Favorite,
  Settings,
} from "../types";

type Tab =
  | "servers"
  | "games"
  | "favorites"
  | "universe"
  | "outfits"
  | "follow"
  | "watcher";

const TABS: Tab[] = [
  "servers",
  "games",
  "favorites",
  "universe",
  "outfits",
  "follow",
  "watcher",
];

const input =
  "rounded-lg border border-line bg-transparent px-3 py-2 text-[0.8rem] outline-none focus:border-white/20";
const btn =
  "rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[0.78rem] font-medium transition hover:bg-white/15 disabled:opacity-40";
const chip =
  "rounded-md border border-line bg-panel px-3 py-1.5 text-[0.72rem] transition hover:bg-[#222]";

export default function UtilitiesModal({
  onClose,
  selectedAccount,
  onPick,
}: {
  onClose: () => void;
  selectedAccount: AccountView | null;
  onPick: (placeId: number, jobId?: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("servers");

  return (
    <Modal title="Utilities" onClose={onClose} maxWidth="680px">
      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[0.74rem] font-medium capitalize transition ${
              tab === t ? "bg-white/[0.08] text-white" : "text-dim hover:text-main"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="h-[340px] overflow-y-auto pr-1">
        {tab === "servers" && <ServersTab onPick={onPick} />}
        {tab === "games" && <GamesTab onPick={onPick} />}
        {tab === "favorites" && <FavoritesTab onPick={onPick} />}
        {tab === "universe" && <UniverseTab onPick={onPick} />}
        {tab === "outfits" && <OutfitsTab account={selectedAccount} />}
        {tab === "follow" && <FollowTab account={selectedAccount} />}
        {tab === "watcher" && <WatcherTab />}
      </div>
    </Modal>
  );
}

/* ── Servers ─────────────────────────────────────────────────────────── */
function ServersTab({ onPick }: { onPick: (p: number, j?: string) => void }) {
  const [placeId, setPlaceId] = useState("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const id = parseInt(placeId, 10);
    if (!id) return;
    setBusy(true);
    try {
      const page = await api.listServers(id, "");
      setServers(page.servers);
      if (!page.servers.length) toast("No public servers found");
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value.replace(/\D/g, ""))}
          placeholder="Place ID"
          className={`${input} flex-1`}
        />
        <button onClick={load} disabled={busy} className={btn}>
          {busy ? "Loading…" : "List servers"}
        </button>
      </div>
      <div className="space-y-1.5">
        {servers.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2"
          >
            <div className="flex-1">
              <div className="text-[0.72rem] tabular-nums text-main">
                {s.playing}/{s.maxPlayers} players
              </div>
              <div className="truncate font-mono text-[0.62rem] text-dim">
                {s.id}
              </div>
            </div>
            <div className="text-[0.65rem] text-dim">
              {s.ping ? `${s.ping}ms` : ""} {s.fps ? `${Math.round(s.fps)}fps` : ""}
            </div>
            <button
              className={chip}
              onClick={() => {
                onPick(parseInt(placeId, 10), s.id);
                toast("Server set — launch to join");
              }}
            >
              Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Games ───────────────────────────────────────────────────────────── */
function GamesTab({ onPick }: { onPick: (p: number, j?: string) => void }) {
  const [kw, setKw] = useState("");
  const [games, setGames] = useState<GameCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function load() {
    if (!kw.trim()) return;
    setBusy(true);
    setSearched(true);
    try {
      setGames(await api.browseGames(kw));
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search games by name…"
          className={`${input} flex-1`}
        />
        <button onClick={load} disabled={busy} className={btn}>
          {busy ? "…" : "Search"}
        </button>
      </div>
      {searched && !busy && games.length === 0 && (
        <div className="py-8 text-center text-sm text-dim">No games found.</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {games.map((g) => (
          <div
            key={g.place_id}
            className="flex items-center gap-2 rounded-lg border border-line bg-panel p-2"
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/5">
              {g.image_url && (
                <img src={g.image_url} className="h-full w-full object-cover" alt="" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.76rem] font-medium">{g.name}</div>
              <div className="text-[0.66rem] text-good">
                {g.player_count.toLocaleString()} playing
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button className={chip} onClick={() => onPick(g.place_id)}>
                Use
              </button>
              <button
                className={chip}
                onClick={() =>
                  api
                    .addFavorite(g.place_id, g.name, "")
                    .then(() => toast("Favorited"))
                    .catch((e) => toast(String(e), "err"))
                }
              >
                ★
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Favorites ───────────────────────────────────────────────────────── */
function FavoritesTab({ onPick }: { onPick: (p: number, j?: string) => void }) {
  const [favs, setFavs] = useState<Favorite[]>([]);
  useEffect(() => {
    api.getFavorites().then(setFavs);
  }, []);

  if (!favs.length)
    return (
      <div className="py-10 text-center text-sm text-dim">
        No favorites yet. Star games from the Games tab.
      </div>
    );

  return (
    <div className="space-y-1.5">
      {favs.map((f) => (
        <div
          key={f.place_id}
          className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.78rem] font-medium">
              {f.name || `Place ${f.place_id}`}
            </div>
            <div className="text-[0.66rem] text-dim">{f.place_id}</div>
          </div>
          <button className={chip} onClick={() => onPick(f.place_id, f.job_id)}>
            Use
          </button>
          <button
            className="text-bad hover:opacity-80"
            onClick={() => api.removeFavorite(f.place_id).then(setFavs)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Universe ────────────────────────────────────────────────────────── */
function UniverseTab({ onPick }: { onPick: (p: number, j?: string) => void }) {
  const [placeId, setPlaceId] = useState("");
  const [universe, setUniverse] = useState<number | null>(null);
  const [places, setPlaces] = useState<PlaceCard[]>([]);

  async function grab() {
    const id = parseInt(placeId, 10);
    if (!id) return;
    try {
      const u = await api.getUniverseId(id);
      setUniverse(u);
      setPlaces(await api.getUniversePlaces(u));
    } catch (e) {
      toast(String(e), "err");
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value.replace(/\D/g, ""))}
          placeholder="Place ID"
          className={`${input} flex-1`}
        />
        <button onClick={grab} className={btn}>
          Get universe
        </button>
      </div>
      {universe != null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[0.78rem]">
          <span className="text-dim">Universe ID:</span>
          <span className="font-mono text-white">{universe}</span>
          <button
            className={`${chip} ml-auto`}
            onClick={() => navigator.clipboard.writeText(String(universe))}
          >
            Copy
          </button>
        </div>
      )}
      <div className="space-y-1.5">
        {places.map((p) => (
          <div
            key={p.place_id}
            className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.76rem]">{p.name}</div>
              <div className="text-[0.64rem] text-dim">{p.place_id}</div>
            </div>
            <button className={chip} onClick={() => onPick(p.place_id)}>
              Use
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Outfits ─────────────────────────────────────────────────────────── */
function OutfitsTab({ account }: { account: AccountView | null }) {
  const [username, setUsername] = useState(account?.username ?? "");
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!username.trim()) return;
    setBusy(true);
    try {
      setOutfits(await api.listOutfits(username.trim()));
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username to browse"
          className={`${input} flex-1`}
        />
        <button onClick={load} disabled={busy} className={btn}>
          {busy ? "…" : "Load outfits"}
        </button>
      </div>
      {!account && (
        <p className="mb-2 text-[0.7rem] text-bad">
          Select an account in the main list to wear outfits.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {outfits.map((o) => (
          <div
            key={o.id}
            className="overflow-hidden rounded-lg border border-line bg-panel"
          >
            <div className="aspect-square bg-white/5">
              {o.image_url && (
                <img src={o.image_url} className="h-full w-full object-cover" alt="" />
              )}
            </div>
            <div className="truncate px-2 pt-1 text-[0.68rem]">{o.name}</div>
            <button
              disabled={!account}
              onClick={() =>
                account &&
                api
                  .wearOutfit(account.user_id, o.id)
                  .then(() => toast(`${account.username} wore ${o.name}`))
                  .catch((e) => toast(String(e), "err"))
              }
              className="m-1.5 w-[calc(100%-12px)] rounded-md border border-white/15 bg-white/[0.08] py-1 text-[0.66rem] transition hover:bg-white/15 disabled:opacity-40"
            >
              Wear
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Follow ──────────────────────────────────────────────────────────── */
function FollowTab({ account }: { account: AccountView | null }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function follow() {
    if (!account) {
      toast("Select an account first", "err");
      return;
    }
    if (!username.trim()) return;
    setBusy(true);
    try {
      await api.followUser(account.user_id, username.trim());
      toast(`${account.username} following ${username.trim()}`);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.78rem] text-dim">
        Join the game a user is currently playing, using the selected account
        {account ? ` (${account.username})` : ""}.
      </p>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && follow()}
          placeholder="Username to follow"
          className={`${input} flex-1`}
        />
        <button onClick={follow} disabled={busy || !account} className={btn}>
          {busy ? "…" : "Follow"}
        </button>
      </div>
    </div>
  );
}

/* ── Watcher ─────────────────────────────────────────────────────────── */
function WatcherTab() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    api.getSettings().then(setS);
  }, []);

  function upd<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((p) => (p ? { ...p, [k]: v } : p));
  }
  async function save() {
    if (!s) return;
    try {
      await api.saveSettings(s);
      toast("Watcher settings saved");
    } catch (e) {
      toast(String(e), "err");
    }
  }

  if (!s) return <div className="py-8 text-center text-sm text-dim">Loading…</div>;

  return (
    <div className="space-y-2">
      <WRow
        label="Enable Roblox watcher"
        checked={s.watcher_enabled}
        onChange={(v) => upd("watcher_enabled", v)}
      />
      <div className="flex items-center justify-between border-b border-line py-2 text-[0.8rem]">
        <span>Scan interval</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={s.watcher_scan_interval}
            onChange={(e) => upd("watcher_scan_interval", Math.max(1, +e.target.value))}
            className={`${input} w-16 text-right`}
          />
          <span className="text-dim">sec</span>
        </div>
      </div>
      <WRow
        label="Close Roblox if memory is low"
        checked={s.watcher_close_memory}
        onChange={(v) => upd("watcher_close_memory", v)}
      />
      <div className="flex items-center justify-between border-b border-line py-2 text-[0.8rem]">
        <span>Memory threshold</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={s.watcher_memory_mb}
            onChange={(e) => upd("watcher_memory_mb", Math.max(1, +e.target.value))}
            className={`${input} w-20 text-right`}
          />
          <span className="text-dim">MB</span>
        </div>
      </div>
      <WRow
        label="Save window positions"
        checked={s.watcher_save_positions}
        onChange={(v) => upd("watcher_save_positions", v)}
      />
      <WRow
        label="Ignore existing processes on startup"
        checked={s.watcher_ignore_existing}
        onChange={(v) => upd("watcher_ignore_existing", v)}
      />
      <p className="pt-1 text-[0.66rem] leading-relaxed text-dim">
        The memory check runs on the scan interval and closes stuck/crashed
        clients. Window-position and data-model checks are stored for
        compatibility.
      </p>
      <div className="flex justify-end pt-1">
        <button onClick={save} className={btn}>
          Save
        </button>
      </div>
    </div>
  );
}

function WRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between border-b border-line py-2 text-[0.8rem]">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-[34px] rounded-full border transition ${
          checked ? "border-white/30 bg-white/20" : "border-line bg-darker"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all ${
            checked ? "left-[18px] bg-good" : "left-[2px] bg-dim"
          }`}
        />
      </button>
    </label>
  );
}
