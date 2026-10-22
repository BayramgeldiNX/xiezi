// Theme: "ink" (墨, default) or "paper" (宣纸). The first paint is handled by the inline script in index.html.
import { store } from "./util.js";

const COLORS = { ink: "#0f141b", paper: "#ebe4d6" };

export const getTheme = () => (store.get("xz-theme", "ink") === "paper" ? "paper" : "ink");

export function setTheme(name) {
  store.set("xz-theme", name);
  if (name === "paper") document.documentElement.dataset.theme = "paper";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]').content = COLORS[name];
  // iPhone reads the status bar style when the app opens; it updates on the next launch.
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content = name === "paper" ? "default" : "black-translucent";
}
