// 田字格 grid, stroke thumbnails and Hanzi Writer setup.
import HanziWriter from "hanzi-writer";
import { css } from "./util.js";
import { STROKE_DATA } from "../data/index.js";
import { setting, STROKE_SPEED } from "./settings.js";

export function gridSVG() {
  return `<svg class="grid" viewBox="0 0 100 100" aria-hidden="true">
    <rect x="1" y="1" width="98" height="98" fill="var(--card)" stroke="var(--grid)" stroke-width="1.5"/>
    <g stroke="var(--grid)" stroke-width=".6" stroke-dasharray="3 3" fill="none">
      <line x1="50" y1="1" x2="50" y2="99"/><line x1="1" y1="50" x2="99" y2="50"/>
      <line x1="1" y1="1" x2="99" y2="99"/><line x1="99" y1="1" x2="1" y2="99"/>
    </g></svg>`;
}

export function stripSVG(c, upto) {
  const paths = STROKE_DATA[c].strokes.map((d, i) => {
    const col = i < upto ? "var(--ink)" : i === upto ? "var(--cinnabar)" : "var(--ghost)";
    return `<path d="${d}" fill="${col}"/>`;
  }).join("");
  return `<svg viewBox="0 0 1024 1024" role="img" aria-label="${c} stroke ${upto + 1}"><g transform="translate(0,900) scale(1,-1)">${paths}</g></svg>`;
}

const loader = (c, onLoad, onError) => (STROKE_DATA[c] ? onLoad(STROKE_DATA[c]) : onError?.(new Error("no data for " + c)));

export function makeWriter(el, c, size, extra = {}) {
  return HanziWriter.create(el, c, Object.assign({
    width: size, height: size, padding: Math.round(size * 0.05),
    charDataLoader: loader,
    strokeColor: css("--ink"), radicalColor: css("--jade"),
    highlightColor: css("--cinnabar"), outlineColor: css("--ghost"),
    drawingColor: css("--ink"),
    strokeAnimationSpeed: STROKE_SPEED[setting("strokeSpeed")].anim, delayBetweenStrokes: STROKE_SPEED[setting("strokeSpeed")].delay,
    showCharacter: false, showOutline: true,
  }, extra));
}

// Writers on screen; cleared whenever a view is replaced so quizzes stop listening.
let writers = [];
export const trackWriter = (w) => { writers.push(w); return w; };
export function clearWriters() {
  writers.forEach((w) => { try { w.cancelQuiz(); } catch {} });
  writers = [];
}
