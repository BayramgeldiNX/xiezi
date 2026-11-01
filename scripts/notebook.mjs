// Notebook words that wait for Claude (status "new"), read from and filled into the owner's Firestore.
//   node --use-env-proxy scripts/notebook.mjs count            how many words wait
//   node --use-env-proxy scripts/notebook.mjs list             those words as JSON (max 30)
//   node --use-env-proxy scripts/notebook.mjs save <file>      fill them from a JSON file (see below)
//   node --use-env-proxy scripts/notebook.mjs hook             SessionStart hook: tells Claude when words wait
// Add `--emulator --uid <uid>` to use the local Firebase emulator (demo-xiezi) instead of the real project.
//
// save <file>: a JSON array of { w, py?, en?, sentence?: {cn, py, en}, wordTrick?, charTricks?: {char: text} }.
// Only fields that are still empty are written (the doc is read again first and the write is conditional on
// it being unchanged), words that were deleted are skipped, and each saved word gets status "filled".
// Prints no secrets and never the owner's email.
import fs from "node:fs";
import { docId } from "../src/sync/ids.js";

const args = process.argv.slice(2);
const cmd = args[0];
const emulator = args.includes("--emulator");
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const MAX_LIST = 30;

/* ---------- Firestore REST ---------- */
async function connect() {
  if (emulator) {
    const uid = flag("--uid");
    if (!uid) throw new Error("--emulator needs --uid <uid>");
    return { base: "http://127.0.0.1:8080/v1/projects/demo-xiezi/databases/(default)/documents", token: "owner", uid };
  }
  const lib = await import("./lib-firebase.mjs");
  // The hook never runs the slow account export: with no cached uid it stays quiet.
  const uid = cmd === "hook" ? lib.cachedOwnerUid() : lib.ownerUid({ email: flag("--email") });
  if (!uid) throw new Error("no owner uid yet");
  return { base: lib.API, token: await lib.accessToken(), uid };
}

const sig = () => AbortSignal.timeout(cmd === "hook" ? 8000 : 30000);
async function call(c, url, init = {}) {
  const r = await fetch(url, { ...init, signal: sig(), headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" } });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`${r.status} ${text.slice(0, 200)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : {};
}

// Firestore value <-> plain JS.
function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
const fromDoc = (d) => ({ ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)])), _name: d.name, _time: d.updateTime });
const str = (s) => ({ stringValue: s });

async function allWords(c) {
  const out = [];
  let token = "";
  do {
    const r = await call(c, `${c.base}/users/${c.uid}/notebook?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    out.push(...(r.documents || []).map(fromDoc));
    token = r.nextPageToken || "";
  } while (token);
  return out;
}
const waiting = async (c) => (await allWords(c)).filter((d) => d.w && !d.deleted && d.status !== "filled");

/* ---------- save ---------- */
const empty = (v) => v == null || v === "";
const hasSentence = (s) => !!s && typeof s === "object" && !empty(s.cn);
const cleanText = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The fields of `item` that the current doc (cur) still lacks, as { mask paths, firestore fields }.
function plan(cur, item) {
  const fields = {}, paths = [];
  for (const k of ["py", "en", "wordTrick"]) {
    const v = cleanText(item[k], k === "wordTrick" ? 300 : 200);
    if (empty(cur[k]) && v) { fields[k] = str(v); paths.push(k); }
  }
  const s = item.sentence;
  if (!hasSentence(cur.sentence) && hasSentence(s)) {
    fields.sentence = { mapValue: { fields: { cn: str(cleanText(s.cn, 200)), py: str(cleanText(s.py, 300)), en: str(cleanText(s.en, 300)) } } };
    paths.push("sentence");
  }
  const tricks = {};
  for (const [ch, text] of Object.entries(item.charTricks || {})) {
    const t = cleanText(text, 300);
    if (t && [...ch].length === 1 && empty((cur.charTricks || {})[ch])) tricks[ch] = str(t);
  }
  if (Object.keys(tricks).length) {
    fields.charTricks = { mapValue: { fields: tricks } };
    for (const ch of Object.keys(tricks)) paths.push("charTricks.`" + ch + "`");
  }
  fields.status = str("filled");
  paths.push("status");
  return { fields, paths };
}

async function saveOne(c, item) {
  const url = `${c.base}/users/${c.uid}/notebook/${encodeURIComponent(docId(item.w))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let doc;
    try { doc = fromDoc(await call(c, url)); } catch (e) { if (e.status === 404) return "missing"; throw e; }
    if (doc.deleted) return "deleted";
    const { fields, paths } = plan(doc, item);
    try {
      // One conditional write: it fails if the word changed since it was read (an edit from a device).
      await call(c, `${c.base}:commit`, { method: "POST", body: JSON.stringify({ writes: [{
        update: { name: doc._name, fields }, updateMask: { fieldPaths: paths }, currentDocument: { updateTime: doc._time },
      }] }) });
      return "saved";
    } catch (e) {
      if (!/precondition|aborted/i.test(e.message) && e.status !== 409 && e.status !== 412) throw e; // changed meanwhile: read it again
    }
  }
  return "busy";
}

/* ---------- commands ---------- */
async function main() {
  if (cmd === "hook") {
    try {
      const n = (await waiting(await connect())).length;
      if (n > 0) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `${n} Notebook words wait: run the fill-notebook skill.` } }));
    } catch {}
    return;
  }
  const c = await connect();
  if (cmd === "count") return console.log((await waiting(c)).length);
  if (cmd === "list") {
    const words = (await waiting(c)).sort((a, b) => (a.at || 0) - (b.at || 0)).slice(0, MAX_LIST);
    return console.log(JSON.stringify(words.map((d) => ({ w: d.w, py: d.py || "", en: d.en || "" })), null, 1));
  }
  if (cmd === "save") {
    const file = args[1];
    if (!file || file.startsWith("--")) throw new Error("usage: save <file.json>");
    const items = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    const count = { saved: 0, deleted: 0, missing: 0, busy: 0 };
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item.w !== "string" || !item.w) continue;
      count[await saveOne(c, item)]++;
    }
    const extra = [count.deleted && `${count.deleted} deleted`, count.missing && `${count.missing} not found`, count.busy && `${count.busy} busy`].filter(Boolean);
    return console.log(`Saved ${count.saved} word${count.saved === 1 ? "" : "s"}${extra.length ? " (skipped: " + extra.join(", ") + ")" : ""}.`);
  }
  throw new Error("usage: notebook.mjs count | list | save <file> | hook   [--emulator --uid <uid>]");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
