import { getCurrentWindow } from "@tauri-apps/api/window";
import Tooltip from "./Tooltip";
import GitHubStars from "./GitHubStars";

const appWindow = getCurrentWindow();

function SysButton({
  onClick,
  danger,
  label,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        aria-label={label}
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center text-dim transition
          hover:text-main ${danger ? "hover:text-bad" : ""}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export default function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-[52px] shrink-0 items-center justify-between px-5"
    >
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <span className="text-[1.05rem] font-semibold tracking-tight">
          RoRvzzz Account Manager
        </span>
        <GitHubStars />
      </div>

      <div className="flex items-center gap-2">
        <SysButton label="Minimize" onClick={() => appWindow.minimize()}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </SysButton>
        <SysButton
          label="Maximize"
          onClick={() => appWindow.toggleMaximize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect
              x="2.5"
              y="2.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </SysButton>
        <SysButton danger label="Close" onClick={() => appWindow.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </SysButton>
      </div>
    </header>
  );
}
