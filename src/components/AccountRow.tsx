import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { toast } from "../toast";
import type { AccountView, PresenceView } from "../types";
import { PresenceLabel } from "../types";

const presenceColor: Record<number, string> = {
  0: "bg-dim",
  1: "bg-good",
  2: "bg-sky-400",
  3: "bg-orange-400",
};

export default function AccountRow({
  account,
  presence,
  avatarUrl,
  hideUsername,
  disableImages,
  showPresence = true,
  selected,
  onSelect,
  onLaunch,
  onRemove,
  onRename,
  onEditNotes,
  onMoveGroup,
  onUtilities,
  onToggleAutoRelaunch,
  onDragStartRow,
  onDropRow,
}: {
  account: AccountView;
  presence?: PresenceView;
  avatarUrl?: string;
  hideUsername?: boolean;
  disableImages?: boolean;
  showPresence?: boolean;
  selected: boolean;
  onSelect: () => void;
  onLaunch: () => void;
  onRemove: () => void;
  onRename: (alias: string) => void;
  onEditNotes: () => void;
  onMoveGroup: () => void;
  onUtilities: () => void;
  onToggleAutoRelaunch: () => void;
  onDragStartRow: () => void;
  onDropRow: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [robux, setRobux] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [editing, setEditing] = useState(false);
  const [aliasDraft, setAliasDraft] = useState(account.alias);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const MENU_W = 160;
  const MENU_H = 156;

  function openMenu() {
    const r = moreRef.current?.getBoundingClientRect();
    if (r) {
      const openUp = r.bottom + MENU_H > window.innerHeight;
      setMenuPos({
        top: openUp ? r.top - MENU_H - 6 : r.bottom + 6,
        left: Math.max(8, r.right - MENU_W),
      });
    }
    setMenu(true);
  }

  useEffect(() => {
    let alive = true;
    api
      .getRobux(account.user_id)
      .then((r) => alive && setRobux(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account.user_id]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || moreRef.current?.contains(t)) return;
      setMenu(false);
    };
    const onScroll = () => setMenu(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [menu]);

  const name = hideUsername
    ? account.alias || "Account"
    : account.alias || account.username;
  const pType = presence?.presence_type ?? 0;

  async function copyCookie() {
    try {
      const c = await api.revealCookie(account.user_id);
      await navigator.clipboard.writeText(c);
      toast("Cookie copied");
    } catch (e) {
      toast(String(e), "err");
    }
    setMenu(false);
  }

  async function copyPassword() {
    try {
      const p = await api.revealPassword(account.user_id);
      if (!p) {
        toast("No password saved for this account", "err");
      } else {
        await navigator.clipboard.writeText(p);
        toast("Password copied");
      }
    } catch (e) {
      toast(String(e), "err");
    }
    setMenu(false);
  }

  function commitRename() {
    setEditing(false);
    if (aliasDraft !== account.alias) onRename(aliasDraft.trim());
  }

  return (
    <div
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStartRow();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropRow();
      }}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition
        ${
          dragOver
            ? "border-white/40 bg-white/[0.08]"
            : selected
            ? "border-white/20 bg-white/[0.06]"
            : "border-line bg-panel hover:bg-[#1f1f1f]"
        }`}
    >
      {/* avatar + presence */}
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/5">
          {avatarUrl && !disableImages ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-xs font-semibold text-dim">
              {(account.alias || account.username).charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {showPresence && (
          <span
            title={PresenceLabel[pType]}
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ${presenceColor[pType]}`}
          />
        )}
      </div>

      {/* name / group */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={aliasDraft}
            onChange={(e) => setAliasDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={account.username}
            className="w-full rounded border border-line bg-transparent px-2 py-1 text-sm text-main outline-none focus:border-white/20"
          />
        ) : (
          <div className="truncate text-sm font-medium">{name}</div>
        )}
        <div className="flex items-center gap-2 text-[0.7rem] text-dim">
          {!hideUsername && <span className="truncate">@{account.username}</span>}
          {account.group !== "Default" && (
            <span className="rounded bg-white/5 px-1.5 py-0.5">
              {account.group}
            </span>
          )}
          {account.auto_relaunch && (
            <span
              title="Auto-relaunch on"
              className="inline-flex items-center gap-0.5 rounded bg-good/15 px-1.5 py-0.5 text-good"
            >
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              auto
            </span>
          )}
        </div>
      </div>

      {/* robux */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums text-good">
          {robux === null ? "—" : "R$ " + robux.toLocaleString()}
        </div>
        {presence?.last_location && (
          <div className="max-w-[120px] truncate text-[0.65rem] text-dim">
            {presence.last_location}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLaunch();
          }}
          className="rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-[0.72rem] font-medium transition hover:bg-white/[0.15]"
        >
          Launch
        </button>

        <div className="relative" ref={menuRef}>
          <button
            aria-label="More"
            onClick={(e) => {
              e.stopPropagation();
              menu ? setMenu(false) : openMenu();
            }}
            ref={moreRef}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-dim transition hover:bg-white/5 hover:text-main"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.2" />
              <circle cx="7" cy="7" r="1.2" />
              <circle cx="7" cy="11.5" r="1.2" />
            </svg>
          </button>
          {menu &&
            createPortal(
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  left: menuPos.left,
                  width: MENU_W,
                }}
                className="animate-fade-up z-[3000] overflow-hidden rounded-lg border border-line bg-[#1a1a1a] py-1 shadow-xl"
              >
                <MenuItem
                  onClick={() => {
                    setEditing(true);
                    setAliasDraft(account.alias);
                    setMenu(false);
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenu(false);
                    onEditNotes();
                  }}
                >
                  Edit notes
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenu(false);
                    onMoveGroup();
                  }}
                >
                  Move to group
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenu(false);
                    onUtilities();
                  }}
                >
                  Account utilities
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenu(false);
                    onToggleAutoRelaunch();
                  }}
                >
                  {account.auto_relaunch
                    ? "Disable auto-relaunch"
                    : "Enable auto-relaunch"}
                </MenuItem>
                <MenuItem onClick={copyCookie}>Copy cookie</MenuItem>
                {account.has_password && (
                  <MenuItem onClick={copyPassword}>Copy password</MenuItem>
                )}
                <MenuItem
                  danger
                  onClick={() => {
                    setMenu(false);
                    onRemove();
                  }}
                >
                  Remove
                </MenuItem>
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`block w-full px-3 py-1.5 text-left text-[0.78rem] transition hover:bg-white/5 ${
        danger ? "text-bad" : "text-main"
      }`}
    >
      {children}
    </button>
  );
}
