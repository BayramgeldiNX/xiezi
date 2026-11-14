// Tests: marking a handed-in paper. Pure: no DOM. Terms: see GLOSSARY.md.
//
//   grade(paper, answers) → { parts: [{ id, right, total, score }], total, max, pct, pass, seal, missed, unanswered, weak }
//
// answers: { [n]: value }. value is an option index (choice), an array of words (order), or true / false
// (write: written right or not). A question without an answer is wrong. Scores are HSK style: each part is
// scaled to 100, the total is out of 500, the pass line is 300.

const answered = (q, a) => (q.shape === "order" ? Array.isArray(a) && a.length > 0 : q.shape === "write" ? typeof a === "boolean" : Number.isInteger(a));

export function isRight(q, a) {
  if (q.shape === "choice") return a === q.answer;
  if (q.shape === "order") return Array.isArray(a) && a.join("") === q.answer.join("");
  return a === true;
}

export function sealOf(pct, perfect) {
  if (perfect) return "满分";
  return pct >= 90 ? "优秀" : pct >= 80 ? "良好" : pct >= 60 ? "合格" : null;
}

export function grade(paper, answers = {}) {
  const missed = [], unanswered = [], lost = new Map(), count = new Map(), asked = new Map();
  let allRight = true;
  const parts = paper.parts.map((p) => {
    let right = 0;
    for (const q of p.questions) {
      const a = answers[q.n];
      asked.set(q.lesson, (asked.get(q.lesson) || 0) + 1);
      if (isRight(q, a)) { right++; continue; }
      allRight = false;
      missed.push(q.n);
      if (!answered(q, a)) unanswered.push(q.n);
      const pts = 100 / p.questions.length;
      lost.set(q.lesson, (lost.get(q.lesson) || 0) + pts);
      count.set(q.lesson, (count.get(q.lesson) || 0) + 1);
    }
    const total = p.questions.length;
    return { id: p.id, right, total, score: total ? Math.round((100 * right) / total) : 0 };
  });
  const total = parts.reduce((s, p) => s + p.score, 0);
  const pct = total / 5;
  const weak = [...lost].map(([lesson, n]) => ({ lesson, lost: Math.round(n * 10) / 10, missed: count.get(lesson), of: asked.get(lesson), pts: n })).sort((a, b) => b.pts - a.pts).map(({ pts, ...w }) => w);
  return { parts, total, max: 500, pct, pass: total >= 300, seal: sealOf(pct, allRight), missed, unanswered, weak };
}
