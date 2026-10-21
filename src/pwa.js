// Offline support + "new version" message.
import { registerSW } from "virtual:pwa-register";
import { $ } from "./lib/util.js";

export function initPWA() {
  const toast = $("#updateToast");
  const update = registerSW({
    onNeedRefresh() {
      toast.hidden = false;
    },
    onOfflineReady() {
      const n = $("#offlineToast");
      n.hidden = false;
      setTimeout(() => (n.hidden = true), 4000);
    },
    onRegisteredSW(url, reg) {
      // Check for a new version every hour and whenever the app comes back to the front.
      if (!reg) return;
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    },
  });
  $("#updateBtn").addEventListener("click", () => update(true));
  $("#updateLater").addEventListener("click", () => (toast.hidden = true));
}
