import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { AccountView } from "../types";

type Tab = "cookie" | "bulk" | "browser";

export default function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (a: AccountView) => void;
}) {
  const [tab, setTab] = useState<Tab>("cookie");

  return (
    <Modal title="Add account" onClose={onClose} maxWidth="420px">
      <div className="mb-4 flex gap-1">
        <TabButton active={tab === "cookie"} onClick={() => setTab("cookie")}>
          Cookie
        </TabButton>
        <TabButton active={tab === "bulk"} onClick={() => setTab("bulk")}>
          Bulk import
        </TabButton>
        <TabButton active={tab === "browser"} onClick={() => setTab("browser")}>
          Browser login
        </TabButton>
      </div>

      {tab === "cookie" && <CookieTab onAdded={onAdded} onClose={onClose} />}
      {tab === "bulk" && <BulkTab onAdded={onAdded} onClose={onClose} />}
      {tab === "browser" && <BrowserTab onAdded={onAdded} onClose={onClose} />}
    </Modal>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[0.75rem] font-medium transition ${
        active
          ? "bg-white/[0.08] text-white"
          : "text-dim hover:text-main"
      }`}
    >
      {children}
    </button>
  );
}

const textareaClass =
  "w-full resize-none rounded-lg border border-line bg-transparent px-3.5 py-3 text-sm leading-relaxed text-main outline-none transition focus:border-white/25";

const primaryBtn =
  "inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-2 text-[0.82rem] font-medium transition hover:bg-white/15 disabled:opacity-40";
const ghostBtn =
  "rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222]";

function Spinner() {
  return (
    <span className="animate-spin-slow inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white" />
  );
}

/* ── Single cookie ──────────────────────────────────────────────────── */
function CookieTab({
  onAdded,
  onClose,
}: {
  onAdded: (a: AccountView) => void;
  onClose: () => void;
}) {
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!cookie.trim() || busy) return;
    setBusy(true);
    try {
      const acc = await api.addAccount(cookie.trim());
      toast(`Added ${acc.username}`);
      onAdded(acc);
      onClose();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="mb-1.5 block text-[0.85rem] font-semibold text-white">
        .ROBLOSECURITY cookie
      </label>
      <textarea
        autoFocus
        spellCheck={false}
        value={cookie}
        onChange={(e) => setCookie(e.target.value)}
        placeholder="_|WARNING:-DO-NOT-SHARE-THIS...."
        className={`${textareaClass} h-28`}
      />
      <p className="mb-4 mt-2 text-[0.74rem] leading-relaxed text-dim">
        Paste the full cookie value. It's validated against Roblox, then stored
        encrypted on this device.
      </p>
      <Actions onClose={onClose}>
        <button onClick={submit} disabled={busy || !cookie.trim()} className={primaryBtn}>
          {busy && <Spinner />}
          {busy ? "Validating" : "Add"}
        </button>
      </Actions>
    </>
  );
}

/* ── Bulk import ────────────────────────────────────────────────────── */
function BulkTab({
  onAdded,
  onClose,
}: {
  onAdded: (a: AccountView) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cookies = text
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!cookies.length || busy) return;
    setBusy(true);
    try {
      const res = await api.addAccountsBulk(cookies);
      res.added.forEach(onAdded);
      toast(
        `Added ${res.added.length}${res.failed ? `, ${res.failed} failed` : ""}`,
        res.added.length ? "ok" : "err"
      );
      if (res.added.length) onClose();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="mb-1.5 block text-[0.85rem] font-semibold text-white">
        Cookies — one per line
      </label>
      <textarea
        autoFocus
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"_|WARNING:-DO-NOT...\n_|WARNING:-DO-NOT...\n_|WARNING:-DO-NOT..."}
        className={`${textareaClass} h-36 font-mono text-[0.78rem]`}
      />
      <p className="mb-4 mt-2 text-[0.74rem] leading-relaxed text-dim">
        Each valid cookie is added; invalid ones are skipped and counted.
      </p>
      <Actions onClose={onClose}>
        <button onClick={submit} disabled={busy || !text.trim()} className={primaryBtn}>
          {busy && <Spinner />}
          {busy ? "Importing" : "Import"}
        </button>
      </Actions>
    </>
  );
}

/* ── Browser login ──────────────────────────────────────────────────── */
function BrowserTab({
  onAdded,
  onClose,
}: {
  onAdded: (a: AccountView) => void;
  onClose: () => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      api.closeLoginWindow().catch(() => {});
    };
  }, []);

  async function start() {
    try {
      await api.openLoginWindow();
      setWaiting(true);
      timer.current = window.setInterval(async () => {
        try {
          const acc = await api.checkLogin();
          if (acc) {
            if (timer.current) clearInterval(timer.current);
            toast(`Added ${acc.username}`);
            onAdded(acc);
            onClose();
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (e) {
      toast(String(e), "err");
    }
  }

  function cancel() {
    if (timer.current) clearInterval(timer.current);
    setWaiting(false);
    api.closeLoginWindow().catch(() => {});
  }

  return (
    <>
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-[0.82rem] leading-relaxed text-main">
          Opens a real Roblox login window. Sign in normally — including 2-step
          verification — and the account is captured automatically once you're
          in.
        </p>
      </div>
      <p className="mb-4 mt-2 text-[0.74rem] leading-relaxed text-dim">
        Nothing is typed or intercepted; the cookie is read from the session
        only after a successful login.
      </p>
      <Actions onClose={onClose}>
        {waiting ? (
          <button onClick={cancel} className={primaryBtn}>
            <Spinner />
            Waiting for login…
          </button>
        ) : (
          <button onClick={start} className={primaryBtn}>
            Open Roblox login
          </button>
        )}
      </Actions>
    </>
  );
}

function Actions({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button onClick={onClose} className={ghostBtn}>
        Cancel
      </button>
      {children}
    </div>
  );
}
