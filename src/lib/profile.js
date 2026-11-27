// Profile: nickname and photo. Saved on this device (`xz-profile`) and synced to users/{uid}/meta/profile
// (newest `at` wins). The photo is a small square data URL, so no Firebase Storage is needed.
const KEY = "xz-profile";
const MAX_NICK = 20;
const MAX_PHOTO = 120000;

let cur = null;
const subs = new Set();
let push = null;

const blank = () => ({ nick: "", photo: null, at: 0 });

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === "object") return { nick: String(v.nick || "").slice(0, MAX_NICK), photo: typeof v.photo === "string" ? v.photo : null, at: +v.at || 0 };
  } catch { /* no storage or bad data */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* private mode: keep in memory */ }
}
const notify = () => subs.forEach((fn) => { try { fn({ ...cur }); } catch (e) { console.error(e); } });

export function getProfile() {
  if (!cur) cur = load();
  return { ...cur };
}

export function setProfile(patch) {
  const p = getProfile();
  if ("nick" in patch) p.nick = String(patch.nick || "").trim().slice(0, MAX_NICK);
  if ("photo" in patch) p.photo = patch.photo || null;
  p.at = Date.now();
  cur = p;
  save();
  notify();
  try { push?.({ ...cur }); } catch (e) { console.error(e); }
}

export function onProfile(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// From the cloud: accepted only when newer. Never pushes back.
export function applyRemoteProfile(remote) {
  if (!remote || !(remote.at > getProfile().at)) return false;
  cur = { nick: String(remote.nick || "").trim().slice(0, MAX_NICK), photo: typeof remote.photo === "string" ? remote.photo : null, at: +remote.at };
  save();
  notify();
  return true;
}

export function setProfilePush(fn) { push = fn; }

export function initial(nick) {
  const c = [...String(nick || "").trim()][0];
  return c ? c.toUpperCase() : "我";
}

/* ---------- photo ---------- */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => no(new Error("decode"));
      img.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

// A picked photo becomes a centred 256x256 square, WebP where the browser can write it, else JPEG.
export async function resizePhoto(file) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("That file is not a picture. Please choose a photo.");
  let img;
  try { img = await decode(file); } catch { throw new Error("Couldn't open that picture. Try another photo."); }
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const s = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 256, 256);
  img.close?.();
  const enc = (q) => {
    const web = c.toDataURL("image/webp", q);
    return web.startsWith("data:image/webp") ? web : c.toDataURL("image/jpeg", q);
  };
  let out = enc(0.85);
  if (out.length > MAX_PHOTO) out = enc(0.7);
  return out;
}
