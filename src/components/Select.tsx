import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Themed dropdown that replaces the native (OS-rendered) <select> popup.
 * Portal-based so it always paints above modals.
 */
export default function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  className?: string;
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  const current = opts.find((o) => o.value === value);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) return setOpen(false);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      const openUp = below < 200 && r.top > below;
      setPos({
        top: openUp ? r.top - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        className={`flex items-center justify-between gap-2 rounded-lg border bg-transparent px-3 py-2 text-left text-[0.8rem] outline-none transition ${
          open ? "border-white/25" : "border-line hover:border-white/15"
        } ${className}`}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
        >
          <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="animate-fade-up z-[3000] max-h-60 overflow-y-auto rounded-lg border border-line bg-[#1a1a1a] p-1 shadow-xl"
          >
            {opts.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[0.78rem] transition ${
                    active ? "bg-white/10 text-white" : "text-main hover:bg-white/5"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-good" fill="none">
                      <path d="M2.5 6.5 5 9l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
