import { useState } from "react";
import Modal from "./Modal";
import { api } from "../api";
import { toast } from "../toast";
import type { AccountView } from "../types";

export default function MoveGroupModal({
  account,
  groups,
  onClose,
  onMoved,
}: {
  account: AccountView;
  groups: string[];
  onClose: () => void;
  onMoved: (a: AccountView) => void;
}) {
  const [group, setGroup] = useState(account.group);

  async function save() {
    try {
      const updated = await api.updateAccount(account.user_id, {
        group: group.trim() || "Default",
      });
      onMoved(updated);
      toast(`Moved to ${updated.group}`);
      onClose();
    } catch (e) {
      toast(String(e), "err");
    }
  }

  return (
    <Modal title="Move to group" onClose={onClose} maxWidth="320px">
      <input
        autoFocus
        list="group-list"
        value={group}
        onChange={(e) => setGroup(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Group name"
        className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-[0.82rem] outline-none focus:border-white/20"
      />
      <datalist id="group-list">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-dim">
        Tip: prefix with a number to sort groups (e.g. "1 Main", "07 Alts") — the
        number is hidden in the list.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-line bg-panel px-5 py-2 text-[0.82rem] font-medium transition hover:bg-[#222]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[0.82rem] font-medium transition hover:bg-white/15"
        >
          Move
        </button>
      </div>
    </Modal>
  );
}
