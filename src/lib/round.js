// Which questions a lesson exercise asks this round. While some are not done yet (completion.js:
// answered right once), a round asks only those, so it never repeats what you already got right
// while others wait. Once everything is done, any of them, for review.
import { shuffle } from "./util.js";
import { isDone } from "../progress/completion.js";

// itemOf(x): the progress key (or completion item) of x. get: progress.get.
function split(list, itemOf, get) {
  const open = [], done = [];
  for (const x of list) (isDone(itemOf(x), get) ? done : open).push(x);
  return { open: shuffle(open), done: shuffle(done) };
}

// Up to n of the open ones, or of all once none is open. Random order.
export function pickRound(list, itemOf, get, n = Infinity) {
  const { open, done } = split(list, itemOf, get);
  return (open.length ? open : done).slice(0, n);
}

// The whole list, open ones first (for exercises that need a full board, like Match).
export function openFirst(list, itemOf, get) {
  const { open, done } = split(list, itemOf, get);
  return [...open, ...done];
}
