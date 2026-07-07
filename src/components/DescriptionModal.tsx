import { useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { AccountView } from "../types";

export default function DescriptionModal({
  account,
  onClose,
  onSaved,
}: {
  account: AccountView;
  onClose: () => void;
  onSaved: (a: AccountView) => void;
}) {
  const [text, setText] = useState(account.description);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateAccount(account.user_id, {
        description: text,
      });
      onSaved(updated);
      toast("Description saved");
      onClose();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Notes — ${account.alias || account.username}`}
      onClose={onClose}
      maxWidth="420px"
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notes / description for this account…"
        className="h-40 w-full resize-none rounded-lg border border-line bg-transparent px-3.5 py-3 text-sm leading-relaxed text-main outline-none focus:border-white/25"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
