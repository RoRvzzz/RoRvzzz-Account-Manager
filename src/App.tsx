import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import TitleBar from "./components/TitleBar";
import AccountRow from "./components/AccountRow";
import AddAccountModal from "./components/AddAccountModal";
import SettingsModal from "./components/SettingsModal";
import Modal from "./components/Modal";
import GamePanel from "./components/GamePanel";
import UtilitiesModal from "./components/UtilitiesModal";
import ControlPanelModal from "./components/ControlPanelModal";
import DescriptionModal from "./components/DescriptionModal";
import AccountUtilitiesModal from "./components/AccountUtilitiesModal";
import MoveGroupModal from "./components/MoveGroupModal";
import Tooltip from "./components/Tooltip";
import { Toaster, toast } from "./toast";
import { applyTheme } from "./theme";
import { api } from "./api";
import type {
  AccountView,
  PresenceView,
  GameInfo,
  Settings,
  Recent,
} from "./types";

/** Parse an optional numeric prefix from a group name for sorting; hide it. */
function groupMeta(name: string): { order: number; label: string } {
  const m = name.match(/^(\d{1,3})\s*(.+)?$/);
  if (m) return { order: parseInt(m[1], 10), label: (m[2] ?? name).trim() };
  return { order: 1000, label: name };
}

export default function App() {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [presence, setPresence] = useState<Record<number, PresenceView>>({});
  const [avatars, setAvatars] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [jobId, setJobId] = useState("");
  const [game, setGame] = useState<GameInfo | null>(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const [editingNotes, setEditingNotes] = useState<AccountView | null>(null);
  const [utilitiesFor, setUtilitiesFor] = useState<AccountView | null>(null);
  const [movingGroup, setMovingGroup] = useState<AccountView | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  const dragId = useRef<number | null>(null);

  useEffect(() => {
    api.getRecents().then(setRecents).catch(() => {});
  }, []);

  // autofill the launch bar with the selected account's saved target
  useEffect(() => {
    if (selected == null) return;
    const a = accounts.find((x) => x.user_id === selected);
    if (a && a.saved_place_id) {
      setPlaceId(String(a.saved_place_id));
      setJobId(a.saved_job_id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // detect a VIP/private-server link pasted into the Place ID box
  useEffect(() => {
    if (!/[^\d]/.test(placeId) && placeId) return; // plain number
    if (!placeId.includes("privateServerLinkCode") && !placeId.includes("/games/"))
      return;
    api
      .parseVipLink(placeId)
      .then((vip) => {
        if (vip) {
          setPlaceId(String(vip.place_id));
          setJobId(`privateServerLinkCode=${vip.link_code}`);
          toast("VIP link detected");
        }
      })
      .catch(() => {});
  }, [placeId]);
  const [confirmRemove, setConfirmRemove] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        applyTheme(s);
      })
      .catch(() => {});
  }, []);

  const refreshPresence = useCallback(async () => {
    try {
      const list = await api.getPresences();
      const map: Record<number, PresenceView> = {};
      list.forEach((p) => (map[p.user_id] = p));
      setPresence(map);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAvatars = useCallback(async () => {
    try {
      const list = await api.getThumbnails();
      const map: Record<number, string> = {};
      list.forEach((t) => (map[t.user_id] = t.image_url));
      setAvatars(map);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    api
      .listAccounts()
      .then((a) => {
        setAccounts(a);
        if (a.length) setSelected(a[0].user_id);
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshAll = useCallback(() => {
    if (settings?.show_presence !== false) refreshPresence();
    if (!settings?.disable_images) refreshAvatars();
  }, [settings, refreshPresence, refreshAvatars]);

  useEffect(() => {
    if (!accounts.length) return;
    refreshAll();
    const rate = (settings?.presence_rate ?? 60) * 1000;
    const t = setInterval(refreshAll, rate);
    return () => clearInterval(t);
  }, [accounts.length, settings, refreshAll]);

  // resolve game info when a Place ID is typed (debounced)
  useEffect(() => {
    const id = parseInt(placeId, 10);
    if (!id || placeId.length < 3) {
      setGame(null);
      setGameError(null);
      setGameLoading(false);
      return;
    }
    let alive = true;
    setGameLoading(true);
    setGameError(null);
    const t = setTimeout(async () => {
      try {
        const info = await api.getGameInfo(id);
        if (alive) setGame(info);
      } catch (e) {
        if (alive) {
          setGame(null);
          setGameError("Couldn't find that Place ID");
          void e;
        }
      } finally {
        if (alive) setGameLoading(false);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [placeId]);

  const gamePanelOpen =
    placeId.length >= 3 && (gameLoading || !!game || !!gameError);

  // Grow the OS window downward to reveal the game panel, so the account list
  // above never shifts — the panel appears to slide out from under the app.
  const PANEL_H = 96;
  const [panelH, setPanelH] = useState(0);
  const baseH = useRef<number | null>(null);
  const curP = useRef(0);
  const rafId = useRef(0);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    cancelAnimationFrame(rafId.current);

    (async () => {
      const sf = await win.scaleFactor();
      const inner = await win.innerSize();
      const logicalW = inner.width / sf;
      const logicalH = inner.height / sf;
      if (baseH.current == null) baseH.current = logicalH - curP.current;
      const base = baseH.current;
      const from = curP.current;
      const to = gamePanelOpen ? PANEL_H : 0;
      if (from === to) return;

      const start = performance.now();
      const dur = 260;
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        const p = from + (to - from) * eased;
        curP.current = p;
        setPanelH(p);
        win.setSize(new LogicalSize(Math.round(logicalW), Math.round(base + p)));
        if (t < 1) {
          rafId.current = requestAnimationFrame(step);
        } else if (to === 0) {
          baseH.current = null;
        }
      };
      rafId.current = requestAnimationFrame(step);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId.current);
    };
  }, [gamePanelOpen]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? accounts.filter(
          (a) =>
            a.username.toLowerCase().includes(q) ||
            a.alias.toLowerCase().includes(q) ||
            a.group.toLowerCase().includes(q)
        )
      : accounts;
    // group by group name
    const groups = new Map<string, AccountView[]>();
    for (const a of list) {
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group)!.push(a);
    }
    // sort accounts within a group by manual order, then name
    for (const arr of groups.values()) {
      arr.sort(
        (a, b) =>
          a.order - b.order ||
          (a.alias || a.username).localeCompare(b.alias || b.username)
      );
    }
    // sort groups by numeric prefix (hidden), then label
    return [...groups.entries()]
      .map(([g, accs]) => [g, groupMeta(g), accs] as const)
      .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
      .map(([g, meta, accs]) => [g, meta.label, accs] as const);
  }, [accounts, search]);

  async function launch(userId: number) {
    const pid = parseInt(placeId, 10);
    if (!pid) {
      toast("Enter a Place ID first", "err");
      return;
    }
    try {
      await api.launchGame(userId, pid, jobId.trim());
      const a = accounts.find((x) => x.user_id === userId);
      toast(`Launching ${a?.alias || a?.username || ""}`.trim());
      // record recent game (use resolved game name if we have it)
      const name = game?.place_id === pid ? game.name : "";
      api.addRecent(pid, name).then(setRecents).catch(() => {});
    } catch (e) {
      toast(String(e), "err");
    }
  }

  async function reorder(targetId: number) {
    const from = dragId.current;
    dragId.current = null;
    if (from == null || from === targetId) return;
    const ordered = [...accounts].sort((a, b) => a.order - b.order);
    const fromIdx = ordered.findIndex((a) => a.user_id === from);
    const toIdx = ordered.findIndex((a) => a.user_id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    const reindexed = ordered.map((a, i) => ({ ...a, order: i }));
    setAccounts(reindexed);
    try {
      await api.reorderAccounts(reindexed.map((a) => a.user_id));
    } catch (e) {
      toast(String(e), "err");
    }
  }

  const allGroups = [...new Set(accounts.map((a) => a.group))];

  async function saveLaunchToAccount() {
    if (selected == null) return;
    const pid = parseInt(placeId, 10) || null;
    try {
      const updated = await api.saveLaunch(selected, pid, jobId.trim());
      setAccounts((prev) =>
        prev.map((x) => (x.user_id === selected ? updated : x))
      );
      toast("Saved to account");
    } catch (e) {
      toast(String(e), "err");
    }
  }

  async function toggleAutoRelaunch(a: AccountView) {
    try {
      const updated = await api.setAutoRelaunch(a.user_id, !a.auto_relaunch);
      setAccounts((prev) =>
        prev.map((x) => (x.user_id === a.user_id ? updated : x))
      );
      toast(updated.auto_relaunch ? "Auto-relaunch on" : "Auto-relaunch off");
    } catch (e) {
      toast(String(e), "err");
    }
  }

  async function doRemove(a: AccountView) {
    try {
      await api.removeAccount(a.user_id);
      setAccounts((prev) => prev.filter((x) => x.user_id !== a.user_id));
      toast(`Removed ${a.username}`);
    } catch (e) {
      toast(String(e), "err");
    }
    setConfirmRemove(null);
  }

  const selectedAccount =
    accounts.find((a) => a.user_id === selected) ?? null;

  function pickPlace(placeId: number, jobId?: string) {
    setPlaceId(String(placeId));
    if (jobId !== undefined) setJobId(jobId);
    setShowUtilities(false);
  }

  async function rename(userId: number, alias: string) {
    try {
      const updated = await api.updateAccount(userId, { alias });
      setAccounts((prev) =>
        prev.map((x) => (x.user_id === userId ? updated : x))
      );
    } catch (e) {
      toast(String(e), "err");
    }
  }

  return (
    <div className="grid-backdrop relative flex h-screen w-screen flex-col overflow-hidden border border-line bg-base text-main shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
      <TitleBar />

      {/* toolbar */}
      <div className="relative z-30 flex items-center gap-2 px-5 pb-3">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M11 11l3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${accounts.length} account${
              accounts.length === 1 ? "" : "s"
            }…`}
            className="w-full rounded-lg border border-line bg-transparent py-2 pl-9 pr-3 text-[0.8rem] outline-none focus:border-white/20"
          />
        </div>
        <ToolbarButton onClick={() => setShowAdd(true)} label="Add">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={refreshAll} label="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowUtilities(true)} label="Utilities">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowControl(true)} label="Account Control">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="11" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowSettings(true)} label="Settings">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.61.77 1.02 1.42 1.02H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </ToolbarButton>
      </div>

      {/* account list */}
      <div className="z-10 flex-1 overflow-y-auto px-5">
        {loading ? (
          <Centered>Loading…</Centered>
        ) : accounts.length === 0 ? (
          <Centered>
            <div className="animate-fade-up">
              <p className="mb-4 text-sm text-dim">
                No accounts yet. Add one with its .ROBLOSECURITY cookie.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-[0.85rem] font-medium transition hover:bg-white/15"
              >
                Add account
              </button>
            </div>
          </Centered>
        ) : (
          <div className="space-y-4 pb-4">
            {filtered.map(([group, label, accs]) => (
              <div key={group}>
                {filtered.length > 1 && (
                  <div className="mb-1.5 px-1 text-[0.68rem] font-semibold uppercase tracking-wider text-dim">
                    {label}
                  </div>
                )}
                <div className="space-y-1.5">
                  {accs.map((a) => (
                    <AccountRow
                      key={a.user_id}
                      account={a}
                      presence={presence[a.user_id]}
                      avatarUrl={avatars[a.user_id]}
                      hideUsername={settings?.hide_usernames}
                      disableImages={settings?.disable_images}
                      showPresence={settings?.show_presence !== false}
                      selected={selected === a.user_id}
                      onSelect={() => setSelected(a.user_id)}
                      onLaunch={() => launch(a.user_id)}
                      onRemove={() => setConfirmRemove(a)}
                      onRename={(alias) => rename(a.user_id, alias)}
                      onEditNotes={() => setEditingNotes(a)}
                      onMoveGroup={() => setMovingGroup(a)}
                      onUtilities={() => setUtilitiesFor(a)}
                      onToggleAutoRelaunch={() => toggleAutoRelaunch(a)}
                      onDragStartRow={() => (dragId.current = a.user_id)}
                      onDropRow={() => reorder(a.user_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* launch bar */}
      <div className="z-10 flex shrink-0 items-center gap-2 border-t border-line bg-black/20 px-5 py-3">
        {/* recent games */}
        <div className="relative">
          <Tooltip label="Recent games" side="top">
            <button
              onClick={() => setShowRecents((s) => !s)}
              onBlur={() => setTimeout(() => setShowRecents(false), 150)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-transparent text-dim transition hover:text-main"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
          {showRecents && (
            <div className="absolute bottom-11 left-0 z-30 max-h-64 w-64 overflow-y-auto rounded-lg border border-line bg-[#1a1a1a] py-1 shadow-xl">
              {recents.length === 0 ? (
                <div className="px-3 py-2 text-[0.72rem] text-dim">No recent games</div>
              ) : (
                recents.map((r) => (
                  <button
                    key={r.place_id}
                    onMouseDown={() => {
                      setPlaceId(String(r.place_id));
                      setJobId("");
                      setShowRecents(false);
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left text-[0.76rem] transition hover:bg-white/5"
                  >
                    {r.name || `Place ${r.place_id}`}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <input
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          placeholder="Place ID or VIP link"
          className="w-40 rounded-lg border border-line bg-transparent px-3 py-2 text-[0.8rem] outline-none focus:border-white/20"
        />
        <input
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Job ID (optional)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-[0.8rem] outline-none focus:border-white/20"
        />
        <Tooltip label="Save Place/Job to selected account" side="top">
          <button
            onClick={saveLaunchToAccount}
            disabled={selected == null}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-transparent text-dim transition hover:text-main disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3h8l2 2v8H3V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M6 3v3h4M6 13v-3h4v3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </button>
        </Tooltip>
        <button
          onClick={() => selected != null && launch(selected)}
          disabled={selected == null}
          className="shrink-0 rounded-full border border-white/20 bg-white/10 px-6 py-2 text-[0.8rem] font-medium transition hover:bg-white/15 disabled:opacity-40"
        >
          Launch selected
        </button>
      </div>

      {/* game info — the window grows downward to reveal this from under the bar */}
      <GamePanel
        height={panelH}
        loading={gameLoading}
        error={gameError}
        info={game}
      />

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onAdded={(a) =>
            setAccounts((prev) => {
              const rest = prev.filter((x) => x.user_id !== a.user_id);
              setSelected(a.user_id);
              return [...rest, a];
            })
          }
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s);
            applyTheme(s);
          }}
        />
      )}
      {showUtilities && (
        <UtilitiesModal
          onClose={() => setShowUtilities(false)}
          selectedAccount={selectedAccount}
          onPick={pickPlace}
        />
      )}
      {showControl && (
        <ControlPanelModal onClose={() => setShowControl(false)} />
      )}
      {editingNotes && (
        <DescriptionModal
          account={editingNotes}
          onClose={() => setEditingNotes(null)}
          onSaved={(u) =>
            setAccounts((prev) =>
              prev.map((x) => (x.user_id === u.user_id ? u : x))
            )
          }
        />
      )}
      {utilitiesFor && (
        <AccountUtilitiesModal
          account={utilitiesFor}
          onClose={() => setUtilitiesFor(null)}
        />
      )}
      {movingGroup && (
        <MoveGroupModal
          account={movingGroup}
          groups={allGroups}
          onClose={() => setMovingGroup(null)}
          onMoved={(u) =>
            setAccounts((prev) =>
              prev.map((x) => (x.user_id === u.user_id ? u : x))
            )
          }
        />
      )}
      {confirmRemove && (
        <Modal
          title="Remove account"
          maxWidth="300px"
          onClose={() => setConfirmRemove(null)}
        >
          <p className="mb-5 text-[0.82rem] text-dim">
            Remove{" "}
            <span className="text-main">
              {confirmRemove.alias || confirmRemove.username}
            </span>{" "}
            from the manager? This does not log the account out.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmRemove(null)}
              className="rounded-full border border-line bg-panel px-5 py-2 text-[0.8rem] font-medium transition hover:bg-[#222]"
            >
              Cancel
            </button>
            <button
              onClick={() => doRemove(confirmRemove)}
              className="rounded-full border border-bad/30 bg-bad/10 px-5 py-2 text-[0.8rem] font-medium text-bad transition hover:bg-bad/20"
            >
              Remove
            </button>
          </div>
        </Modal>
      )}

      <Toaster />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        aria-label={label}
        onClick={onClick}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-dim transition hover:bg-[#222] hover:text-main"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}
