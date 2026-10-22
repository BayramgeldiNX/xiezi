// Review tab (复习): your weakest words first, plus recent results.
import { $, store } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { LESSONS, wordChars } from "../data/index.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";
import { weakness, weakReasons, wordStatus } from "../progress/model.js";
import { dictIntro } from "./dictation.js";

const TYPE_NAME = { dict: "Dictation", review: "Review dictation", cards: "Flashcards", tones: "Tones" };

function rankWords(scope) {
  const lessons = scope === "all" ? LESSONS : [app.L()];
  const rows = lessons.flatMap((l) => l.words.map((w) => {
    const chars = wordChars(w);
    return {
      w, lesson: l.n,
      score: weakness(w.w, chars, progress.get),
      reasons: weakReasons(w.w, chars, progress.get),
      status: wordStatus({ word: w.w, list: chars }, progress.get),
    };
  }));
  const weak = rows.filter((r) => r.score != null && r.status !== "known" && r.score >= 0.5).sort((a, b) => b.score - a.score);
  const fresh = rows.filter((r) => r.score == null);
  const known = rows.filter((r) => r.status === "known");
  return { weak, fresh, known, total: rows.length };
}

function when(t) {
  const d = (Date.now() - t) / 864e5;
  if (d < 1 / 24) return "just now";
  if (d < 1) return `${Math.round(d * 24)} h ago`;
  if (d < 2) return "yesterday";
  return `${Math.round(d)} days ago`;
}

export function reviewIntro() {
  const scope = store.get("xz-review-scope", "lesson");
  const { weak, fresh, known, total } = rankWords(scope);
  const pick = weak.slice(0, 8);
  const recent = progress.sessions().slice(-6).reverse();
  const row = (r) => `<li class="rv-row">
      <span class="rv-hz">${r.w.w}</span>
      <span class="rv-txt"><span class="py">${tonePy(r.w.py)}</span> <span class="muted">${r.w.en}</span>
        <small>${r.reasons.join(" · ") || "not practiced for a while"}${scope === "all" ? ` · Lesson ${r.lesson}` : ""}</small></span>
      ${sayBtns(r.w.w, r.w.py, true)}
    </li>`;
  $("#tab-review").innerHTML = `<div class="panel">
    <span class="lbl">复习 fùxí · Review</span>
    <div class="modes" role="tablist" aria-label="Which words">
      <button class="mode" role="tab" data-scope="lesson" aria-selected="${scope === "lesson"}">This lesson</button>
      <button class="mode" role="tab" data-scope="all" aria-selected="${scope === "all"}">All lessons</button>
    </div>
    <div class="stats">
      <div><b class="ok-c">${known.length}</b><span>known</span></div>
      <div><b class="learn-c">${total - known.length - fresh.length}</b><span>learning</span></div>
      <div><b>${fresh.length}</b><span>not started</span></div>
    </div>
    ${pick.length ? `
      <p style="margin:0">Your ${pick.length} weakest word${pick.length > 1 ? "s" : ""}, weakest first:</p>
      <ul class="rv-list">${pick.map(row).join("")}</ul>
      <div class="controls"><button class="btn primary big" type="button" id="rvGo">Practice these in dictation</button></div>`
    : `<p style="margin:0">${known.length === total ? "全对！Everything here is known. 太棒了!" : fresh.length === total ? "Nothing to review yet. Practice in Write, Dictation or Flashcards first, and your weak words will show up here." : "No weak words right now. 很好! Keep practicing the ones you haven't started."}</p>`}
    ${fresh.length && fresh.length < total ? `<details><summary>Not started yet (${fresh.length})</summary><div class="result-list" style="margin-top:8px">${fresh.map((r) => `<span>${r.w.w}</span>`).join("")}</div></details>` : ""}
  </div>
  ${recent.length ? `<div class="panel">
    <span class="lbl">Recent results</span>
    <ul class="recent">${recent.map((s) => `<li><span>${TYPE_NAME[s.type] || s.type} · Lesson ${s.lesson}</span><b>${s.score} / ${s.total}</b><small>${when(s.at)}</small></li>`).join("")}</ul>
  </div>` : ""}`;
  $("#tab-review").querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => {
    store.set("xz-review-scope", b.dataset.scope);
    reviewIntro();
  }));
  $("#rvGo")?.addEventListener("click", () => dictIntro({
    host: "#tab-review", words: pick.map((r) => r.w), kind: "review", back: reviewIntro, title: "复习 · Weak words dictation",
  }));
}
