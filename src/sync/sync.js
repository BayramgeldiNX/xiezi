// Cloud sync with Firebase (email + password sign-in, Firestore with offline cache).
//
// Firestore layout (only the signed-in user can read/write their own tree, see firestore.rules):
//   users/{uid}/items/{key}     { k: key, d: { [deviceId]: stat }, t: serverTime }
//   users/{uid}/sessions/{id}   one finished practice session
//   users/{uid}/meta/place      { lid, word, tab, at }: where you were last (newest wins)
//   users/{uid}/meta/profile    { nick, photo, at }: nickname and small photo (newest wins; lib/profile.js)
//   users/{uid}/notebook/{word} a Notebook word; devices and Claude write single fields (merge)
//   users/{uid}/tests/{docId(book/test)} { k, d: { [deviceId]: { best, last, tries } } }: a test's results, one entry per device (exam/store.js)
// Each device writes only its own d.{deviceId} entry, so devices never overwrite each other.
import realConfig from "./firebase-config.js";
import * as progress from "../progress/store.js";
import * as notebook from "../notebook/store.js";
import * as exam from "../exam/store.js";
import { docId } from "./ids.js";
import { ownerFromStore } from "../pdf/pages.js";
import { getProfile, applyRemoteProfile, setProfilePush } from "../lib/profile.js";

// Test mode (only when started with VITE_FIREBASE_EMULATOR=1): talk to the local Firebase emulators
// with a throw-away demo project instead of the real one. Never on in the published app.
const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === "1";
const config = EMULATOR ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-xiezi", appId: "demo" } : realConfig;

export const syncAvailable = !!config;

const state = { status: syncAvailable ? "starting" : "off", email: null, error: null };
const subs = new Set();
const emit = (patch) => {
  if ("email" in patch && patch.email !== state.email) dropBookAuth();
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
  setProfilePush(null);
  notebook.setSyncer(null);
  exam.setSyncer(null);
  if (state.email) { progress.clearRemote(); notebook.clearRemote(); exam.clearRemote(); }
  setOwner(false);
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

  const placeRef = F.doc(db, "users", uid, "meta", "place");
  const profileRef = F.doc(db, "users", uid, "meta", "profile");
  setProfilePush((p) => safely(() => F.setDoc(profileRef, p)));
  progress.setSyncer({
    pushItem: (key, stat) =>
      safely(() => F.setDoc(itemRef(key), { k: key, d: { [dev]: stat }, t: F.serverTimestamp() }, { merge: true })
        .then(() => progress.markItemSent(key, stat.n))),
    pushPlace: (p) => safely(() => F.setDoc(placeRef, p)),
    pushSession: (s) => safely(() => F.setDoc(sessionRef(s.id), s).then(() => progress.markSessionSent(s.id))),
  });
  // Notebook words: send field-level patches; the cloud copy comes back through the listener below.
  const nbRef = (w) => F.doc(db, "users", uid, "notebook", docId(w));
  const nbPush = (w, patch) => safely(() => F.setDoc(nbRef(w), { w, ...patch }, { merge: true }).then(() => notebook.confirm(w, patch)));
  notebook.setSyncer({ push: nbPush });
  notebook.pendingAll().forEach(([w, patch]) => nbPush(w, patch));
  // Test results: like progress items, each device writes only its own entry d.{deviceId}.
  const testRef = (k) => F.doc(db, "users", uid, "tests", docId(k));
  const testPush = (k, rec) => safely(() => F.setDoc(testRef(k), { k, d: { [dev]: rec } }, { merge: true }).then(() => exam.markUploaded(k, rec)));
  // Nothing is sent before the first cloud copy has arrived, so an entry saved while signed out
  // is merged with this device's older cloud entry first and never replaces it.
  let testsReady = false;
  exam.setSyncer({ push: (k, rec) => { if (testsReady) testPush(k, rec); } }, uid);
  emit({ status: "syncing", email: user.email, error: null });
  ownerStatus();

  // Upload what has not reached this account yet: everything the first time, then only changes.
  try {
    const { items: upItems, sessions: upSessions } = progress.pendingUpload(uid);
    const writes = [
      ...upItems.map(([k, s]) => (b) => b.set(itemRef(k), { k, d: { [dev]: s }, t: F.serverTimestamp() }, { merge: true })),
      ...upSessions.map((s) => (b) => b.set(sessionRef(s.id), s)),
    ];
    const commits = [];
    for (let i = 0; i < writes.length; i += 400) {
      const b = F.writeBatch(db);
      writes.slice(i, i + 400).forEach((w) => w(b));
      commits.push(b.commit()); // resolves when the server confirms; offline it waits in the cache
    }
    Promise.all(commits).then(() => progress.markUploaded(uid, upItems, upSessions)).catch(fail);
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

  // Where you were last (newest across devices wins), for the Continue card on Home.
  const placeSub = F.onSnapshot(placeRef, (snap) => {
    const remote = snap.data();
    if (progress.applyRemotePlace(remote)) progress.remoteDone();
    else if ((progress.place.get()?.at || 0) > (remote?.at || 0)) safely(() => F.setDoc(placeRef, progress.place.get()));
  }, fail);

  // Nickname and photo (newest wins, like the place above).
  const profileSub = F.onSnapshot(profileRef, (snap) => {
    const remote = snap.data();
    if (applyRemoteProfile(remote)) return;
    const mine = getProfile();
    if (mine.at && mine.at > (remote?.at || 0)) safely(() => F.setDoc(profileRef, mine));
  }, fail);

  const nb = F.onSnapshot(F.collection(db, "users", uid, "notebook"), (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === "removed") notebook.applyRemoved(ch.doc.data().w);
      else notebook.applyRemote(ch.doc.data().w, ch.doc.data());
    });
    if (snap.docChanges().length) notebook.remoteDone();
  }, fail);

  // includeMetadataChanges: we must know when a snapshot comes from the server and not from the local cache.
  const tests = F.onSnapshot(F.collection(db, "users", uid, "tests"), { includeMetadataChanges: true }, (snap) => {
    const changes = snap.docChanges(); // metadata-only snapshots carry none
    changes.forEach((ch) => {
      const d = ch.doc.data();
      if (!d.k) return;
      const more = exam.applyRemote(d.k, ch.type === "removed" ? { d: {} } : d, ch.doc.metadata.hasPendingWrites); // true: we hold more than the cloud
      const mine = more && testsReady && exam.unsentAll().find(([k]) => k === d.k);
      if (mine) testPush(mine[0], mine[1]);
    });
    if (changes.length) exam.remoteDone();
    // Only a server snapshot shows this device's own cloud entry; until then results wait in localStorage.
    if (!testsReady && snap.metadata.fromCache === false) { testsReady = true; exam.unsentAll().forEach(([k, rec]) => testPush(k, rec)); }
  }, fail);

  stopFns.push(items, sess, placeSub, profileSub, nb, tests);
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

/* ---------- the owner's books ---------- */
// Only the owner's account (owners/{uid}, see firestore.rules) can read the book pages. The answer is
// kept on the device (xz-owner), so the Shelf shows at once and offline, and is cleared on sign-out.
const OWNER_KEY = "xz-owner";
const ownerSubs = new Set();
export function ownerCached() {
  try { return ownerFromStore(localStorage.getItem(OWNER_KEY)); } catch { return false; }
}
function setOwner(on) {
  const was = ownerCached();
  try { on ? localStorage.setItem(OWNER_KEY, "1") : localStorage.removeItem(OWNER_KEY); } catch {}
  if (was !== on) ownerSubs.forEach((f) => { try { f(on); } catch (e) { console.error(e); } });
}
// Hears a change of the owner flag (on sign-in, sign-out and the first check).
export const onOwner = (f) => { ownerSubs.add(f); return () => ownerSubs.delete(f); };

// "owner" | "not-owner" | "signed-out" | "unknown" (offline or an error: the device's last answer still holds).
export async function ownerStatus() {
  if (!syncAvailable) return "unknown";
  try {
    const { auth, db, F } = await load();
    await auth.authStateReady();
    const u = auth.currentUser;
    if (!u) { setOwner(false); return "signed-out"; }
    const d = await F.getDoc(F.doc(db, "owners", u.uid));
    setOwner(d.exists());
    return d.exists() ? "owner" : "not-owner";
  } catch (e) {
    if (e?.code === "permission-denied") { setOwner(false); return "not-owner"; }
    return "unknown";
  }
}
export const isOwner = async () => (await ownerStatus()) === "owner";

// The auth header for the book downloads, kept ready: the SDK is loaded, auth has settled and the ID token is in
// hand, so a page request starts at once. It is renewed shortly before the token expires, and dropped on sign-in/out.
// Resolves to { Authorization } or null (signed out). Rejects when the SDK cannot load (offline).
let bookHdr = null;
function bookAuth() {
  if (bookHdr && Date.now() < bookHdr.until) return bookHdr.p;
  const slot = { until: Date.now() + 5 * 60 * 1000 };
  slot.p = (async () => {
    const { auth } = await load();
    await auth.authStateReady();
    const u = auth.currentUser;
    if (!u) return null;
    const t = await u.getIdTokenResult();
    slot.until = Math.max(Date.now() + 60 * 1000, Date.parse(t.expirationTime) - 5 * 60 * 1000);
    return { Authorization: `Bearer ${t.token}` };
  })();
  slot.p.then((h) => { if (!h && bookHdr === slot) bookHdr = null; }, () => { if (bookHdr === slot) bookHdr = null; });
  bookHdr = slot;
  return slot.p;
}
const dropBookAuth = () => { bookHdr = null; };
// Get the SDK, auth and the token ready before the first page is asked for. Quiet; call it as often as you like.
export function warmBooks() {
  if (!syncAvailable) return Promise.resolve();
  return bookAuth().then(() => {}, () => {});
}

// One document of a book's owner-only collections, over REST with the user's token (not the SDK, so the bytes are not
// also copied into Firestore's own offline cache: the device keeps one copy, in xz-pages).
// -> { status: "ok", fields } or { status: "signed-out" | "not-owner" | "none" | "offline" | "error" }.
async function bookDoc(book, path) {
  if (!syncAvailable) return { status: "none" };
  try {
    const root = EMULATOR ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com";
    for (let again = 0; ; again++) {
      const hdr = await bookAuth();
      if (!hdr) return { status: "signed-out" };
      const res = await fetch(`${root}/v1/projects/${config.projectId}/databases/(default)/documents/books/${encodeURIComponent(book)}/${path}`, { headers: hdr });
      if (res.status === 401 && !again) { dropBookAuth(); continue; }   // the token had run out: one fresh try
      if (res.status === 403 || res.status === 401) return { status: "not-owner" };
      if (res.status === 404) return { status: "none" };
      if (!res.ok) return { status: "error" };
      return { status: "ok", fields: (await res.json()).fields || {} };
    }
  } catch (e) {
    return { status: navigator.onLine === false || e instanceof TypeError ? "offline" : "error" };
  }
}
const num = (x) => Number(x?.integerValue ?? x?.doubleValue ?? 0);
const toBlob = (b64) => {
  const bin = atob(b64 || "");
  if (!bin) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/webp" });
};

// One page image of a book: { status: "ok", blob (image/webp), w, h, v } or { status: "signed-out" | "not-owner" |
// "none" | "offline" | "error" }.
export async function bookPage(book, id, n) {
  const r = await bookDoc(book, `pages/${String(id)}-${String(n).padStart(3, "0")}`);
  if (r.status !== "ok") return r;
  const f = r.fields, blob = toBlob(f.img?.bytesValue);
  if (!blob) return { status: "none" };
  return { status: "ok", blob, w: num(f.w), h: num(f.h), v: num(f.v) || 1 };
}

// One chunk of previews (books/<book>/thumbs/<id>-<k>): { status: "ok", from, imgs: [Blob], w: [], h: [], v } (w and h
// are the FULL page sizes) or the same failures as bookPage.
export async function bookThumbs(book, id, k) {
  const r = await bookDoc(book, `thumbs/${String(id)}-${k}`);
  if (r.status !== "ok") return r;
  const f = r.fields, list = (x) => (x?.arrayValue?.values || []);
  const imgs = list(f.imgs).map((x) => toBlob(x.bytesValue));
  if (!imgs.length || imgs.some((b) => !b)) return { status: "none" };
  return { status: "ok", from: num(f.from) || 1, imgs, w: list(f.w).map(num), h: list(f.h).map(num), v: num(f.v) || 1 };
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
