// What is on screen now. Whatever a screen starts that must end when you leave it (a microphone, a
// recording timer), and whatever answers keys or a resize while it is shown, registers here. Leaving a
// page, a lesson tab or an exercise calls leave(): it ends all of it and forgets it, so main.js does not
// need to know any exercise's insides, and nothing keeps running for a screen that is gone.
//
//   onLeave(fn), onKey(fn), onResize(fn)   register for the current screen; each returns a function that
//                                          unregisters (for a screen that ends by itself, like a round)
//   leave()                                you left: run every onLeave, forget everything
//   key(e) → handled?                      the newest key handler that takes the key
//   resized()                              every resize handler
const leaves = new Set(), keys = new Set(), resizes = new Set();
const add = (set) => (fn) => { set.add(fn); return () => set.delete(fn); };

export const onLeave = add(leaves);
export const onKey = add(keys);
export const onResize = add(resizes);

export function leave() {
  const fns = [...leaves].reverse();
  leaves.clear(); keys.clear(); resizes.clear();
  for (const fn of fns) {
    try { fn(); } catch (e) { console.error(e); } // one bad cleanup must not stop the others
  }
}

export function key(e) {
  for (const fn of [...keys].reverse()) if (fn(e)) return true;
  return false;
}

export function resized() {
  for (const fn of resizes) fn();
}
