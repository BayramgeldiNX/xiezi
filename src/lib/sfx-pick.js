// Which sound effect fits an event. Pure rules (no browser), so they can be tested.
import { silent } from "../progress/keys.js";

// When several sounds are asked for in the same moment (a tap that is also a right answer that
// also ends the exercise), only the most important one plays.
export const PRIORITY = ["tick", "flip", "stroke", "miss", "right", "wrong", "done", "finish"];
export const louder = (a, b) => (!a ? b : !b ? a : PRIORITY.indexOf(b) > PRIORITY.indexOf(a) ? b : a);


// The sound for a saved answer. `opts.sfx` names the sound where `ok` means "perfect at the first
// try" rather than "right" (e.g. a pair matched at the second try is still a right answer);
// `opts.quiet` saves without a sound.
export function soundFor(key, result, opts = {}) {
  if (opts.quiet) return null;
  if (opts.sfx) return opts.sfx;
  if (silent(key)) return null; // writing and flashcards: see progress/keys.js
  return result?.ok ? "right" : "wrong";
}
