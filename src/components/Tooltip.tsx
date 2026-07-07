import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

/**
 * Hover tooltip rendered in a portal with fixed positioning, so it always
 * paints above the app chrome regardless of stacking context.
 */
export default function Tooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: Side;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; tf: string }>({
    top: 0,
    left: 0,
    tf: "",
  });
  const ref = useRef<HTMLSpanElement>(null);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 8;
    let top = 0,
      left = 0,
      tf = "";
    switch (side) {
      case "bottom":
        top = r.bottom + gap;
        left = r.left + r.width / 2;
        tf = "translate(-50%, 0)";
        break;
      case "top":
        top = r.top - gap;
        left = r.left + r.width / 2;
        tf = "translate(-50%, -100%)";
        break;
      case "left":
        top = r.top + r.height / 2;
        left = r.left - gap;
        tf = "translate(-100%, -50%)";
        break;
      case "right":
        top = r.top + r.height / 2;
        left = r.right + gap;
        tf = "translate(0, -50%)";
        break;
    }
    setPos({ top, left, tf });
    setOpen(true);
  }

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: pos.tf,
            }}
            className="pointer-events-none z-[100000] whitespace-nowrap rounded-lg border border-white/10 bg-[#2a2a2a] px-2.5 py-1 text-[0.68rem] font-medium text-main shadow-lg"
          >
            {label}
          </div>,
          document.body
        )}
    </span>
  );
}
