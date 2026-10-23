// Cloud sync with Firebase (email + password sign-in, Firestore with offline cache).
//
// Firestore layout (only the signed-in user can read/write their own tree, see firestore.rules):
//   users/{uid}/items/{key}     { k: key, d: { [deviceId]: stat }, t: serverTime }
//   users/{uid}/sessions/{id}   one finished practice session
// Each device writes only its own d.{deviceId} entry, so devices never overwrite each other.
import realConfig from "./firebase-config.js";
import * as progress from "../progress/store.js";
import { docId } from "./ids.js";

// Test mode (only when started with VITE_FIREBASE_EMULATOR=1): talk to the local Firebase emulators
// with a throw-away demo project instead of the real one. Never on in the published app.
const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === "1";
const config = EMULATOR ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-xiezi", appId: "demo" } : realConfig;

export const syncAvailable = !!config;

const state = { status: syncAvailable ? "starting" : "off", email: null, error: null };
const subs = new Set();
const emit = (patch) => {
  Object.assign(state, patch);
  subs.forEach((fn) => { try { fn({ ...state }); } catch (e) { console.error(e); } });
};
export const syncState = () => ({ ...state });
export function onSync(fn) {
  subs.add(fn);
  fn({ ...state });
  return () => subs.delete(fn);
}

let fb = null;       // loaded Firebase modules + instances
let stopFns = [];

async function load() {
  if (fb) return fb;
  const [appMod, authMod, fsMod] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"),
  ]);
  const app = appMod.initializeApp(config);
  // No popup/redirect resolver: email sign-in only, which works inside Home Screen apps.
  const auth = authMod.initializeAuth(app, {
    persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
  });
  let db;
  try {
    db = fsMod.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Offline cache unavailable, using memory cache", e);
    db = fsMod.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: fsMod.memoryLocalCache() });
  }
  if (EMULATOR) {
    authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    fsMod.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  fb = { auth, db, A: authMod, F: fsMod };
  return fb;
}

export async function initSync() {
  if (!syncAvailable) return;
  try {
    const { auth, A } = await load();
    A.onAuthStateChanged(auth, (user) => (user ? start(user) : stop()));
  } catch (e) {
    console.error(e);
    emit({ status: "error", error: "Couldn't load sync. Check your internet or VPN." });
  }
}

function stop() {
  stopFns.forEach((f) => f());
  stopFns = [];
  progress.setSyncer(null);
  if (state.email) progress.clearRemote();
  emit({ status: "signed-out", email: null });
}

async function start(user) {
  const { db, F } = fb;
  const uid = user.uid;
  const itemRef = (key) => F.doc(db, "users", uid, "items", docId(key));
  const sessionRef = (id) => F.doc(db, "users", uid, "sessions", docId(id));
  const dev = progress.deviceId();
  const fail = (e) => { console.error(e); emit({ status: "error", error: friendly(e) }); };
  // A sync problem must never interrupt practice: the result is already saved on the device.
  const safely = (fn) => { try { fn().catch(fail); } catch (e) { fail(e); } };

  progress.setSyncer({
    pushItem: (key, stat) =>
      safely(() => F.setDoc(itemRef(key), { k: key, d: { [dev]: stat }, t: F.serverTimestamp() }, { merge: true })),
    pushSession: (s) => safely(() => F.setDoc(sessionRef(s.id), s)),
  });
  emit({ status: "syncing", email: user.email, error: null });

  // Upload everything this device has (safe to repeat: it only rewrites our own entries).
  try {
    const mine = Object.entries(progress.allMine());
    const own = progress.sessions().filter((s) => s.dev === dev);
    const writes = [
      ...mine.map(([k, s]) => (b) => b.set(itemRef(k), { k, d: { [dev]: s }, t: F.serverTimestamp() }, { merge: true })),
      ...own.map((s) => (b) => b.set(sessionRef(s.id), s)),
    ];
    for (let i = 0; i < writes.length; i += 400) {
      const b = F.writeBatch(db);
      writes.slice(i, i + 400).forEach((w) => w(b));
      b.commit().catch(fail); // resolves when the server confirms; offline it waits in the cache
    }
  } catch (e) { fail(e); }

  const items = F.onSnapshot(F.collection(db, "users", uid, "items"), { includeMetadataChanges: true }, (snap) => {
    snap.docChanges().forEach((ch) => {
      const data = ch.doc.data();
      progress.applyRemoteItem(data.k || ch.doc.id, ch.type === "removed" ? {} : data.d);
    });
    if (snap.docChanges().length) progress.remoteDone();
    emit({
      status: snap.metadata.fromCache ? "offline" : snap.metadata.hasPendingWrites ? "syncing" : "synced",
      error: null, lastSync: snap.metadata.fromCache ? state.lastSync : Date.now(),
    });
  }, fail);

  const sessQ = F.query(F.collection(db, "users", uid, "sessions"), F.orderBy("at", "desc"), F.limit(100));
  const sess = F.onSnapshot(sessQ, (snap) => {
    let any = false;
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { progress.applyRemoteSession(ch.doc.data()); any = true; } });
    if (any) progress.remoteDone();
  }, fail);

  stopFns.push(items, sess);
}

/* ---------- private book content ---------- */
// Texts and grammar notes of a printed book's lesson, with their recordings. Only the owner's
// account can read them (firestore.rules); returns { status: "ok" | "signed-out" | "none" | "error", ... }.
export async function bookContent(book, n) {
  if (!syncAvailable) return { status: "none" };
  const { auth, db, F } = await load();
  await auth.authStateReady();
  if (!auth.currentUser) return { status: "signed-out" };
  try {
    const [t, a] = await Promise.all([
      F.getDoc(F.doc(db, "books", book, "private", String(n))),
      F.getDoc(F.doc(db, "books", book, "audio", String(n))).catch(() => null),
    ]);
    if (!t.exists()) return { status: "none" };
    const audio = {};
    for (const [k, v] of Object.entries(a?.data()?.a || {})) audio[k] = v.toUint8Array();
    return { status: "ok", texts: JSON.parse(t.data().texts || "[]"), notes: JSON.parse(t.data().notes || "[]"), audio };
  } catch (e) {
    console.warn(e);
    return { status: e?.code === "permission-denied" ? "none" : "error" };
  }
}

/* ---------- account actions (return an error message or null) ---------- */
async function run(fn) {
  try {
    const f = await load();
    await fn(f);
    return null;
  } catch (e) {
    console.error(e);
    return friendly(e);
  }
}
export const signIn = (email, pw) => run(({ auth, A }) => A.signInWithEmailAndPassword(auth, email.trim(), pw));
export const signUp = (email, pw) => run(({ auth, A }) => A.createUserWithEmailAndPassword(auth, email.trim(), pw));
export const signOut = () => run(({ auth, A }) => A.signOut(auth));
export const resetPassword = (email) => run(({ auth, A }) => A.sendPasswordResetEmail(auth, email.trim()));

function friendly(e) {
  const code = e?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Please type your password.",
    "auth/weak-password": "Password is too short. Use at least 6 characters.",
    "auth/email-already-in-use": "There's already an account with this email. Use Sign in instead.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "No account with this email yet. Use Create account.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "No connection to the sync server. Check your internet or VPN.",
    "auth/operation-not-allowed": "Email sign-in isn't switched on in Firebase yet (see SETUP).",
    "auth/configuration-not-found": "Email sign-in isn't switched on in Firebase yet (see SETUP).",
    "permission-denied": "The server refused access. Sign out and in again.",
    "unavailable": "Sync server unreachable. Your progress is saved here and will sync later.",
  };
  return map[code] || (e?.message ? `Something went wrong: ${e.message}` : "Something went wrong.");
}
