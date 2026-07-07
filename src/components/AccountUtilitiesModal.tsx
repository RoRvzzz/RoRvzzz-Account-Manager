import { useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { AccountView } from "../types";

type Tab = "name" | "privacy" | "password" | "email" | "login";

const TABS: { id: Tab; label: string }[] = [
  { id: "name", label: "Display name" },
  { id: "privacy", label: "Follow privacy" },
  { id: "password", label: "Password" },
  { id: "email", label: "Email" },
  { id: "login", label: "Quick log in" },
];

const input =
  "w-full rounded-lg border border-line bg-transparent px-3 py-2 text-[0.82rem] outline-none focus:border-white/20";
const btn =
  "rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15 disabled:opacity-40";
const label = "mb-1.5 block text-[0.8rem] font-semibold text-white";

const PRIVACY = ["All", "Followers", "Following", "Friends", "NoOne"];

export default function AccountUtilitiesModal({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("name");
  const [busy, setBusy] = useState(false);

  // field state
  const [displayName, setDisplayName] = useState(account.display_name);
  const [privacy, setPrivacy] = useState("All");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Utilities — ${account.alias || account.username}`}
      onClose={onClose}
      maxWidth="440px"
    >
      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-[0.73rem] font-medium transition ${
              tab === t.id ? "bg-white/[0.08] text-white" : "text-dim hover:text-main"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[150px] space-y-3">
        {tab === "name" && (
          <>
            <div>
              <label className={label}>New display name</label>
              <input
                className={input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <Action>
              <button
                className={btn}
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.setDisplayName(account.user_id, displayName),
                    "Display name updated"
                  )
                }
              >
                Update
              </button>
            </Action>
          </>
        )}

        {tab === "privacy" && (
          <>
            <div>
              <label className={label}>Who can follow me</label>
              <select
                className={input}
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value)}
              >
                {PRIVACY.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <Action>
              <button
                className={btn}
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.setFollowPrivacy(account.user_id, privacy),
                    "Follow privacy updated"
                  )
                }
              >
                Apply
              </button>
            </Action>
          </>
        )}

        {tab === "password" && (
          <>
            <div>
              <label className={label}>Current password</label>
              <input
                type="password"
                className={input}
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>New password</label>
              <input
                type="password"
                className={input}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
            </div>
            <Action>
              <button
                className={btn}
                disabled={busy || !curPw || !newPw}
                onClick={() =>
                  run(
                    () => api.changePassword(account.user_id, curPw, newPw),
                    "Password changed"
                  )
                }
              >
                Change password
              </button>
            </Action>
          </>
        )}

        {tab === "email" && (
          <>
            <div>
              <label className={label}>Account password</label>
              <input
                type="password"
                className={input}
                value={emailPw}
                onChange={(e) => setEmailPw(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>New email</label>
              <input
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Action>
              <button
                className={btn}
                disabled={busy || !emailPw || !email}
                onClick={() =>
                  run(
                    () => api.changeEmail(account.user_id, emailPw, email),
                    "Email changed"
                  )
                }
              >
                Change email
              </button>
            </Action>
          </>
        )}

        {tab === "login" && (
          <>
            <p className="text-[0.76rem] leading-relaxed text-dim">
              Enter the 6-digit code shown on the "Log in with another device"
              screen to sign this account in there.
            </p>
            <input
              className={`${input} text-center font-mono tracking-[0.3em]`}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
            />
            <Action>
              <button
                className={btn}
                disabled={busy || code.length !== 6}
                onClick={() =>
                  run(() => api.quickLogin(account.user_id, code), "Logged in")
                }
              >
                Confirm log in
              </button>
            </Action>
          </>
        )}
      </div>
    </Modal>
  );
}

function Action({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end pt-1">{children}</div>;
}
