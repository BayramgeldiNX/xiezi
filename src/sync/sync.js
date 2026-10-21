// Cloud sync with Firebase (email + password sign-in, Firestore with offline cache).
//
// Firestore layout (only the signed-in user can read/write their own tree, see firestore.rules):
//   users/{uid}/items/{key}     { k: key, d: { [deviceId]: stat }, t: serverTime }
//   users/{uid}/sessions/{id}   one finished practice session
// Each device writes only its own d.{deviceId} entry, so devices never overwrite each other.
import config from "./firebase-config.js";
import * as progress from "../progress/store.js";

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
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Offline cache unavailable, using memory cache", e);
    db = fsMod.initializeFirestore(app, { localCache: fsMod.memoryLocalCache() });
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
  const itemRef = (key) => F.doc(db, "users", uid, "items", key);
  const sessionRef = (id) => F.doc(db, "users", uid, "sessions", id);
  const dev = progress.deviceId();
  const fail = (e) => { console.error(e); emit({ status: "error", error: friendly(e) }); };

  progress.setSyncer({
    pushItem: (key, stat) =>
      F.setDoc(itemRef(key), { k: key, d: { [dev]: stat }, t: F.serverTimestamp() }, { merge: true }).catch(fail),
    pushSession: (s) => F.setDoc(sessionRef(s.id), s).catch(fail),
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
