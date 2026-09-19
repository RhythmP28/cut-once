import { useCallback, useSyncExternalStore } from "react";

/**
 * Light / dark / auto as one attribute on <html>, ported from mayim's ThemeSwitch: the tokens in theme/arctic.css
 * rebind on data-theme, so nothing else needs to know a theme exists. index.html sets it before first paint.
 * One button that cycles, so it fits the top bar.
 */
type Theme = "light" | "dark" | "auto";

const KEY = "cutonce-theme";
const EVENT = "cutonce:themechange";
const ORDER: Theme[] = ["light", "dark", "auto"];
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", auto: "Match system" };

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function read(): Theme {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" || v === "auto" ? v : "light";
}

/** The current theme setting, for the few things drawn outside CSS (the 3D viewer's grid). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light" as Theme);
}

function apply(theme: Theme): void {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: the choice lasts this session only */ }
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "auto" ? "light dark" : theme;
  window.dispatchEvent(new CustomEvent(EVENT));
}

function Glyph({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.8" y="4.5" width="18.4" height="13" rx="0.5" />
      <path d="M8.5 20.5h7" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeSwitch() {
  const theme = useTheme();
  const cycle = useCallback(() => apply(ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length]), []);
  return (
    <button type="button" className="tb-ico" onClick={cycle} title={`Theme: ${LABEL[theme]}`} aria-label={`Theme: ${LABEL[theme]}. Activate to change.`}>
      <Glyph theme={theme} />
    </button>
  );
}
