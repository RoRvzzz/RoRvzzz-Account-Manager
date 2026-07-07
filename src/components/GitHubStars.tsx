import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

const REPO = { user: "RoRvzzz", repo: "RoRvzzz-Account-Manager" };

export default function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO.user}/${REPO.repo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStars(d.stargazers_count ?? null))
      .catch(() => {});
  }, []);

  return (
    <button
      onClick={() =>
        openUrl(`https://github.com/${REPO.user}/${REPO.repo}`).catch(() => {})
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[0.72rem] text-dim transition hover:border-white/15 hover:text-main"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <svg width="12" height="12" viewBox="0 0 24 24" className="text-yellow-400" fill="currentColor">
        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
      </svg>
      <span className="font-medium">Star</span>
      {stars !== null && (
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] tabular-nums text-main">
          {stars.toLocaleString()}
        </span>
      )}
    </button>
  );
}
