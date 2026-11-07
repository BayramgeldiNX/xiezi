// Theme setting: "auto" (default: 春 Spring by day, 漆 Lacquer at night), "spring", "lacquer", "ink", "paper".
// The first paint is handled by the inline script in index.html (same logic, same key). Importing this file applies the theme.
import { store } from "./util.js";

const KEY = "xz-theme2";
const SETTINGS = ["auto", "spring", "lacquer", "ink", "paper"];
const COLORS = { spring: "#fbf1d9", lacquer: "#2a1512", ink: "#0c1016", paper: "#ece5d7" };
const LIGHT = { spring: true, paper: true };
const dark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export const getTheme = () => {
  const t = store.get(KEY, "auto");
  return SETTINGS.includes(t) ? t : "auto";
};

export const resolveTheme = (setting = getTheme()) => (setting === "auto" ? (dark && dark.matches ? "lacquer" : "spring") : setting);

export function applyTheme() {
  const name = resolveTheme();
  document.documentElement.dataset.theme = name;
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = COLORS[name];
  // iPhone reads the status bar style when the app opens; it updates on the next launch.
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.content = LIGHT[name] ? "default" : "black-translucent";
}

export function setTheme(setting) {
  store.set(KEY, SETTINGS.includes(setting) ? setting : "auto");
  applyTheme();
}

export function initTheme() {
  applyTheme();
  if (dark) dark.addEventListener("change", () => { if (getTheme() === "auto") applyTheme(); });
}

initTheme();
