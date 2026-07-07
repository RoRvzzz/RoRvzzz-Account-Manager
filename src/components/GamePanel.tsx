import type { GameInfo } from "../types";

function compact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

/**
 * Bottom-anchored strip that is revealed as the whole window grows downward
 * (the `height` is driven by App animating the OS window size). Content is
 * pinned to the bottom so it appears to slide out from under the launch bar.
 */
export default function GamePanel({
  height,
  loading,
  error,
  info,
}: {
  height: number;
  loading: boolean;
  error: string | null;
  info: GameInfo | null;
}) {
  return (
    <div
      className="relative z-10 shrink-0 overflow-hidden px-5"
      style={{ height }}
    >
      <div className="absolute inset-x-5 bottom-3 flex h-[76px] items-center gap-3 rounded-xl border border-line bg-panel/80 p-2.5 backdrop-blur">
        {/* icon */}
        <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
          {info?.image_url ? (
            <img
              src={info.image_url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" className="text-dim" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 10v4M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="16" cy="11" r="1" fill="currentColor" />
              <circle cx="18" cy="13.5" r="1" fill="currentColor" />
            </svg>
          )}
        </div>

        {/* text */}
        <div className="min-w-0 flex-1">
          {error ? (
            <div className="text-sm text-bad">{error}</div>
          ) : loading && !info ? (
            <div className="text-sm text-dim">Loading game…</div>
          ) : info ? (
            <>
              <div className="truncate text-sm font-semibold text-white">
                {info.name || "Untitled game"}
              </div>
              <div className="truncate text-[0.72rem] text-dim">
                by {info.creator || "Unknown"}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[0.7rem] text-dim">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  <span className="tabular-nums text-main">
                    {compact(info.playing)}
                  </span>{" "}
                  playing
                </span>
                <span>
                  <span className="tabular-nums text-main">
                    {compact(info.visits)}
                  </span>{" "}
                  visits
                </span>
                <span>
                  max{" "}
                  <span className="tabular-nums text-main">
                    {info.max_players}
                  </span>
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
