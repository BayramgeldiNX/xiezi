// Account sheet: sign in for sync, sync status, backup file.
import { $, esc } from "../lib/util.js";
import { getTheme, setTheme } from "../lib/theme.js";
import { setting, setSetting } from "../lib/settings.js";

// One labelled row of choices for a setting.
const settingRow = (key, label, choices, note = "") => `<div class="set-row"><span>${label}</span>
  <div class="seg" role="group" aria-label="${label}">${choices.map(([v, t]) =>
    `<button type="button" data-set="${key}" data-v="${v}" aria-pressed="${String(setting(key)) === String(v)}">${t}</button>`).join("")}</div>
  ${note ? `<small class="muted">${note}</small>` : ""}</div>`;
import * as progress from "../progress/store.js";
import { syncAvailable, onSync, syncState, signIn, signUp, signOut, resetPassword } from "../sync/sync.js";

const STATUS = {
  off: ["○", "Sync not set up yet"],
  starting: ["…", "Starting…"],
  "signed-out": ["○", "Not signed in"],
  syncing: ["↻", "Syncing…"],
  synced: ["✓", "Synced"],
  offline: ["☁", "Offline: saved here, syncs later"],
  error: ["!", "Sync problem"],
};

// Small status chip on the start menu.
export function initAccountChip() {
  const chip = $("#accountChip");
  chip.addEventListener("click", openAccount);
  onSync((s) => {
    const [icon, text] = STATUS[s.status] || STATUS.off;
    chip.dataset.status = s.status;
    chip.innerHTML = `<span aria-hidden="true">${icon}</span> ${s.status === "signed-out" ? "Sign in" : s.status === "offline" ? "Offline" : text}`;
    if ($("#accountSheet").open) renderSheet();
  });
}

export function openAccount() {
  const d = $("#accountSheet");
  renderSheet();
  if (!d.open) d.showModal();
}

let msg = "";
let busy = false;

function renderSheet() {
  const s = syncState();
  const [icon, text] = STATUS[s.status] || STATUS.off;
  const body = $("#accountBody");
  let top;
  if (!syncAvailable) {
    top = `<p>Sync between your devices isn't switched on yet. Your progress is saved on this device. Use a backup file to move it.</p>`;
  } else if (s.status === "signed-out" || (s.status === "error" && !s.email)) {
    top = `<p>Sign in with the <b>same email and password on all your devices</b>. Your progress then syncs between them.</p>
      <form id="authForm" class="auth" autocomplete="on">
        <label>Email<input name="email" type="email" autocomplete="username" inputmode="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <div class="controls">
          <button class="btn primary" type="submit" data-act="in" ${busy ? "disabled" : ""}>Sign in</button>
          <button class="btn" type="submit" data-act="up" ${busy ? "disabled" : ""}>Create account</button>
          <button class="btn link" type="button" id="forgot">Forgot password?</button>
        </div>
        <p class="note">First time? Type your email and a new password (6+ characters), then tap <b>Create account</b>. On your other devices, use <b>Sign in</b>.</p>
      </form>`;
  } else {
    top = `<div class="sync-line" data-status="${s.status}"><span class="sync-ic">${icon}</span><div><b>${text}</b>
        ${s.email ? `<small>Signed in as ${esc(s.email)}</small>` : ""}
        ${s.lastSync ? `<small>Last synced ${new Date(s.lastSync).toLocaleTimeString()}</small>` : ""}</div></div>
      ${s.error ? `<p class="err">${esc(s.error)}</p>` : ""}
      <div class="controls"><button class="btn" type="button" id="signOut">Sign out</button></div>`;
  }
  const theme = getTheme();
  body.innerHTML = `<span class="lbl">Appearance</span>
    <div class="seg" role="group" aria-label="Theme">
      <button type="button" data-theme-set="ink" aria-pressed="${theme === "ink"}">墨 Ink</button>
      <button type="button" data-theme-set="paper" aria-pressed="${theme === "paper"}">宣纸 Paper</button>
    </div>
    ${settingRow("textSize", "Text size", [["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]])}
    <hr>
    <span class="lbl">Learning</span>
    ${settingRow("pinyin", "Pinyin", [["show", "Show"], ["tap", "Show on tap"], ["hide", "Hide"]], "Hide or blur pinyin to test yourself; it still appears in answers.")}
    ${settingRow("strokeSpeed", "Stroke animation", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]])}
    ${settingRow("hintAfter", "Hint when tracing after", [[1, "1 mistake"], [2, "2 mistakes"], [3, "3 mistakes"], [0, "Never"]])}
    ${settingRow("slowRate", "“Slow” sound speed", [[0.5, "Very slow"], [0.65, "Slow"], [0.8, "A bit slow"]])}
    ${settingRow("autoplay", "Play sound automatically", [[true, "On"], [false, "Off"]], "Off: exercises stay silent until you tap Listen.")}
    <hr>
    <span class="lbl">Sync</span>
    ${top}
    ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}
    <hr>
    <span class="lbl">Backup file</span>
    <p class="note">Saves all your progress into one file, as an extra safety copy or to move it by hand.</p>
    <div class="controls">
      <button class="btn" type="button" id="exportBtn">Save backup</button>
      <label class="btn" for="importFile">Load backup</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <p class="note">This device: <code>${progress.deviceId()}</code> · Version: <code>${__BUILD__}</code></p>`;
  body.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
    setTheme(b.dataset.themeSet);
    renderSheet();
  }));
  body.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.v;
    setSetting(b.dataset.set, v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v);
    renderSheet();
  }));

  const form = $("#authForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const act = e.submitter?.dataset.act || "in";
      const { email, password } = Object.fromEntries(new FormData(form));
      busy = true; msg = ""; renderSheet();
      msg = (await (act === "up" ? signUp(email, password) : signIn(email, password))) || "";
      busy = false; renderSheet();
      if (!msg) setTimeout(() => $("#accountSheet").close(), 600);
    });
    $("#forgot").addEventListener("click", async () => {
      const email = form.email.value;
      if (!email) { msg = "Type your email first, then tap Forgot password."; return renderSheet(); }
      const err = await resetPassword(email);
      msg = err || `A reset link was sent to ${email}.`;
      renderSheet();
    });
  }
  $("#signOut")?.addEventListener("click", async () => { msg = (await signOut()) || ""; renderSheet(); });
  $("#exportBtn").addEventListener("click", exportFile);
  $("#importFile").addEventListener("change", importFile);
}

async function exportFile() {
  const data = JSON.stringify(progress.exportBackup(), null, 1);
  const name = `xiezi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: "application/json" });
  // Phones: share sheet (Save to Files). Computers: normal download.
  if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function importFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    progress.importBackup(JSON.parse(await f.text()));
    msg = "Backup loaded and merged with this device's progress.";
  } catch (err) {
    msg = err.message || "Couldn't read that file.";
  }
  renderSheet();
}
