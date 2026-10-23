// Offline support + updates. A new version installs by itself while you're on a calm page
// (home, books, a book's lesson list); during practice it waits and offers "Update now" instead.
import { registerSW } from "virtual:pwa-register";
import { $ } from "./lib/util.js";

// Pages where reloading interrupts nothing.
const calm = () => /^#?\/?(books|book\/[^/]+)?$/.test(location.hash);

export function initPWA() {
  const toast = $("#updateToast");
  let waiting = false;
  const update = registerSW({
    onNeedRefresh() {
      waiting = true;
      if (calm()) update(true);
      else toast.hidden = false;
    },
    onOfflineReady() {
      const n = $("#offlineToast");
      n.hidden = false;
      setTimeout(() => (n.hidden = true), 4000);
    },
    onRegisteredSW(url, reg) {
      // Check for a new version on start, every hour, and whenever the app comes back to the front.
      if (!reg) return;
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    },
  });
  // A waiting update installs as soon as you leave practice for a calm page.
  addEventListener("hashchange", () => { if (waiting && calm()) update(true); });
  $("#updateBtn").addEventListener("click", () => update(true));
  $("#updateLater").addEventListener("click", () => (toast.hidden = true));
}
