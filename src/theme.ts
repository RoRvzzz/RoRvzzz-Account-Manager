import type { Settings } from "./types";

/**
 * Apply theme colors at runtime by overriding the Tailwind @theme CSS
 * variables (utilities like `bg-base` compile to `var(--color-base)`).
 */
export function applyTheme(s: Settings) {
  const root = document.documentElement.style;
  const set = (k: string, v: string) => v && root.setProperty(k, v);
  set("--color-base", s.theme_base);
  set("--color-panel", s.theme_panel);
  set("--color-main", s.theme_main);
  set("--color-good", s.theme_good);
  set("--color-bad", s.theme_bad);
  // keep a slightly darker shade in sync with the base
  set("--color-darker", shade(s.theme_base, -0.35));
}

/** Darken (or lighten) a hex color by `amount` (-1..1). */
function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp((num >> 16) + 255 * amount);
  const g = clamp(((num >> 8) & 0xff) + 255 * amount);
  const b = clamp((num & 0xff) + 255 * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
