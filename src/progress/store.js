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
    unsent: p.unsent || { items: {}, sessions: {} }, // not yet in the cloud: { key: n at change }, { id: 1 }
    sentFor: p.sentFor || null, // the uid whose cloud copy is complete
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
globalThis.addEventListener?.("pagehide", () => { clearTimeout(saveTimer); store.set(KEY, P); flushPlace(); });

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
  P.mine[key] = addResult(P.mine[key], result, Date.now(), get(key));
  P.unsent.items[key] = P.mine[key].n;
  changed();
  syncer?.pushItem(key, P.mine[key]);
}

export function addSession(s) {
  const session = { id: `${P.device}-${Date.now().toString(36)}`, dev: P.device, at: Date.now(), ...s };
  P.sessions.push(session);
  P.unsent.sessions[session.id] = 1;
  if (P.sessions.length > MAX_SESSIONS) P.sessions.splice(0, P.sessions.length - MAX_SESSIONS);
  changed();
  syncer?.pushSession(session);
}

export const sessions = () => P.sessions;

/* ---------- sync hooks (used by src/sync) ---------- */
export function setSyncer(s) { syncer = s; }
export const allMine = () => P.mine;

// What still has to reach this account's cloud copy: everything the first time, then only what changed.
export function pendingUpload(uid) {
  const own = P.sessions.filter((s) => s.dev === P.device);
  if (P.sentFor !== uid) return { items: Object.entries(P.mine), sessions: own };
  return {
    items: Object.keys(P.unsent.items).filter((k) => P.mine[k]).map((k) => [k, P.mine[k]]),
    sessions: own.filter((s) => P.unsent.sessions[s.id]),
  };
}
// Called once the server has confirmed. A newer result recorded meanwhile stays unsent (its n has changed).
export function markItemSent(key, n) { if (P.unsent.items[key] === n) { delete P.unsent.items[key]; persist(); } }
export function markSessionSent(id) { if (P.unsent.sessions[id]) { delete P.unsent.sessions[id]; persist(); } }
export function markUploaded(uid, items, sessions) {
  items.forEach(([k, s]) => { if (P.unsent.items[k] === s.n) delete P.unsent.items[k]; });
  sessions.forEach((s) => delete P.unsent.sessions[s.id]);
  P.sentFor = uid;
  persist();
}

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
  const { unsent, sentFor, ...rest } = P; // upload bookkeeping belongs to this device only
  return { app: "xiezi", version: 1, exportedAt: new Date().toISOString(), ...rest };
}

// Merge a backup file: its own-device results become "another device" here,
// unless it came from this same device, in which case the bigger record wins.
export function importBackup(b) {
  if (!b || b.app !== "xiezi" || !b.mine) throw new Error("This is not a 写字本 backup file.");
  const put = (dev, key, stat) => {
    if (!stat?.n) return;
    if (dev === P.device) {
      if (!P.mine[key] || stat.n > P.mine[key].n) { P.mine[key] = stat; P.unsent.items[key] = stat.n; }
      return;
    }
    const cur = P.others[key]?.[dev];
    if (!cur || stat.n >= cur.n) (P.others[key] ||= {})[dev] = stat;
  };
  for (const [k, s] of Object.entries(b.mine)) put(b.device, k, s);
  for (const [k, byDev] of Object.entries(b.others || {})) for (const [dev, s] of Object.entries(byDev)) put(dev, k, s);
  for (const s of b.sessions || []) {
    const isNew = s?.id && !P.sessions.some((x) => x.id === s.id);
    applyRemoteSession(s);
    if (isNew && s.dev === P.device) P.unsent.sessions[s.id] = 1;
  }
  changed();
  // Results that now belong to this device must reach the cloud too.
  if (syncer) for (const k of Object.keys(P.unsent.items)) if (P.mine[k]) syncer.pushItem(k, P.mine[k]);
}

/* ---------- last place (newest wins across devices) ---------- */
let placeTimer = 0, placeWaiting = null;
const flushPlace = () => { clearTimeout(placeTimer); if (placeWaiting) syncer?.pushPlace?.(placeWaiting); placeWaiting = null; };
export const place = {
  get: () => store.get("hz-state", null),
  set: (v) => {
    placeWaiting = { ...v, at: Date.now() };
    store.set("hz-state", placeWaiting);
    clearTimeout(placeTimer);
    placeTimer = setTimeout(flushPlace, 2000); // moving between words shouldn't write each time
  },
};
// True when the cloud's place was newer and is now ours.
export function applyRemotePlace(p) {
  if (!p?.lid || (p.at || 0) <= (place.get()?.at || 0)) return false;
  store.set("hz-state", p);
  return true;
}
