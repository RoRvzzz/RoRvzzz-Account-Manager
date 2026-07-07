import { useEffect, useState } from "react";

export type ToastKind = "ok" | "err";
interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

let listeners: Array<(t: Toast) => void> = [];
let counter = 0;

export function toast(msg: string, kind: ToastKind = "ok") {
  const t = { id: ++counter, msg, kind };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const on = (t: Toast) => {
      setItems((prev) => [...prev, t]);
      setTimeout(
        () => setItems((prev) => prev.filter((x) => x.id !== t.id)),
        3200
      );
    };
    listeners.push(on);
    return () => {
      listeners = listeners.filter((l) => l !== on);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-up rounded-full border px-4 py-1.5 text-xs font-medium shadow-lg backdrop-blur
            ${
              t.kind === "err"
                ? "border-bad/30 bg-[#2a1a1a] text-bad"
                : "border-white/10 bg-[#2a2a2a] text-main"
            }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
