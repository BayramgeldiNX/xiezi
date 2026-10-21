// Progress saved on this device (localStorage), with hooks for cloud sync.
import { store } from "../lib/util.js";
import { addResult, combine } from "./model.js";

const KEY = "xz-progress-v1";
const MAX_SESSIONS = 300;

function newDeviceId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return "dev-" + [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function load() {
  const p = store.get(KEY, null) || {};
  return {
    device: p.device || newDeviceId(),
    mine: p.mine || {},        // { key: stat } recorded on this device
    others: p.others || {},    // { key: { deviceId: stat } } from other devices
    sessions: p.sessions || [],// newest last
  };
}

const P = load();
const subs = new Set();
let syncer = null;
let saveTimer = 0;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEY, P), 50);
}
function changed() {
  persist();
  subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
globalThis.addEventListener?.("pagehide", () => { clearTimeout(saveTimer); store.set(KEY, P); });

export const deviceId = () => P.device;

export function onProgress(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Combined stat for one item across all devices.
export function get(key) {
  return combine([P.mine[key], ...Object.values(P.others[key] || {})]);
}

export function record(key, result) {
  P.mine[key] = addResult(P.mine[key], result);
  changed();
  syncer?.pushItem(key, P.mine[key]);
}

export function addSession(s) {
  const session = { id: `${P.device}-${Date.now().toString(36)}`, dev: P.device, at: Date.now(), ...s };
  P.sessions.push(session);
  if (P.sessions.length > MAX_SESSIONS) P.sessions.splice(0, P.sessions.length - MAX_SESSIONS);
  changed();
  syncer?.pushSession(session);
}

export const sessions = () => P.sessions;

/* ---------- sync hooks (used by src/sync) ---------- */
export function setSyncer(s) { syncer = s; }
export const allMine = () => P.mine;

// A cloud item: { deviceId: stat }. Our own device's copy is ignored (we are the source of truth for it).
export function applyRemoteItem(key, byDevice) {
  const others = {};
  for (const [dev, stat] of Object.entries(byDevice || {})) if (dev !== P.device && stat?.n) others[dev] = stat;
  if (Object.keys(others).length) P.others[key] = others; else delete P.others[key];
}
export function applyRemoteSession(s) {
  if (!s?.id || P.sessions.some((x) => x.id === s.id)) return;
  P.sessions.push(s);
  P.sessions.sort((a, b) => a.at - b.at);
  if (P.sessions.length > MAX_SESSIONS) P.sessions.splice(0, P.sessions.length - MAX_SESSIONS);
}
export const remoteDone = changed;

// Signing out: forget other devices' results (they come back on next sign-in).
export function clearRemote() {
  P.others = {};
  P.sessions = P.sessions.filter((s) => s.dev === P.device);
  changed();
}

/* ---------- backup ---------- */
export function exportBackup() {
  return { app: "xiezi", version: 1, exportedAt: new Date().toISOString(), ...P };
}

// Merge a backup file: its own-device results become "another device" here,
// unless it came from this same device, in which case the bigger record wins.
export function importBackup(b) {
  if (!b || b.app !== "xiezi" || !b.mine) throw new Error("This is not a 写字本 backup file.");
  const put = (dev, key, stat) => {
    if (!stat?.n) return;
    if (dev === P.device) {
      if (!P.mine[key] || stat.n > P.mine[key].n) P.mine[key] = stat;
      return;
    }
    const cur = P.others[key]?.[dev];
    if (!cur || stat.n >= cur.n) (P.others[key] ||= {})[dev] = stat;
  };
  for (const [k, s] of Object.entries(b.mine)) put(b.device, k, s);
  for (const [k, byDev] of Object.entries(b.others || {})) for (const [dev, s] of Object.entries(byDev)) put(dev, k, s);
  for (const s of b.sessions || []) applyRemoteSession(s);
  changed();
  // Results that now belong to this device must reach the cloud too.
  if (syncer) for (const [k, s] of Object.entries(P.mine)) syncer.pushItem(k, s);
}

/* ---------- last place (per device, not synced) ---------- */
export const place = {
  get: () => store.get("hz-state", null),
  set: (v) => store.set("hz-state", v),
};
