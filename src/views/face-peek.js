// Hold the profile photo in the lesson ring to see it large. It grows out of the ring to the middle of the
// screen and stays there after you let go; a tap anywhere or Esc sends it back. A short tap on the ring
// still opens the "what is left" list, as before.
import { motionOK } from "../lib/motion.js";

const HOLD_MS = 420, SLOP = 10; // how long to hold, and how far the finger may wander meanwhile

let peek = null; // { el, img, from } while open
let skipClick = false; // the click that ends a hold must not also open the list

// Where the ring's photo is, as a transform of the big photo (centered on screen) back onto it.
function shrinkTo(face, big) {
  const a = face.getBoundingClientRect(), b = big.getBoundingClientRect();
  if (!a.width || !b.width) return "scale(.2)";
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${a.width / b.width})`;
}

function open(face) {
  if (peek || !face.getAttribute("src")) return;
  const el = document.createElement("div");
  el.className = "face-peek";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Profile photo. Tap to close.");
  el.tabIndex = -1;
  el.innerHTML = `<img alt="Profile photo" draggable="false">`;
  const img = el.firstElementChild;
  img.src = face.currentSrc || face.src;
  document.body.append(el);
  peek = { el, img, face };
  navigator.vibrate?.(8);
  const from = shrinkTo(face, img);
  if (motionOK()) {
    img.style.transition = "none";
    img.style.transform = from;
    el.offsetWidth; // flush, then grow
    img.style.transition = "";
    img.style.transform = "";
  }
  el.classList.add("on");
  el.focus({ preventScroll: true });
  // Only a new tap closes it: the finger that held the ring lifts over the photo, and that must not count.
  let armed = false;
  el.addEventListener("pointerdown", () => { armed = true; });
  el.addEventListener("click", () => { if (armed) close(); });
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", close);
}

function close() {
  if (!peek) return;
  const { el, img, face } = peek;
  peek = null;
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("hashchange", close);
  el.classList.remove("on");
  if (!motionOK() || !face.isConnected || face.hidden) { el.remove(); return; }
  img.style.transform = shrinkTo(face, img);
  let done = false;
  const end = () => { if (!done) { done = true; el.remove(); } };
  img.addEventListener("transitionend", end, { once: true });
  setTimeout(end, 400); // in case no transition runs
}

function onKey(e) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation(); // Esc here closes the photo, not the lesson
  close();
}

// Wire the hold on the lesson ring (#lessonMeter). Call once.
export function bindFacePeek(box) {
  let timer = 0, x0 = 0, y0 = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  box.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || !box.classList.contains("has-face")) return;
    const face = box.querySelector(".lm-face");
    if (!face || face.hidden) return;
    x0 = e.clientX; y0 = e.clientY;
    cancel();
    timer = setTimeout(() => { timer = 0; skipClick = true; open(face); }, HOLD_MS);
  });
  box.addEventListener("pointermove", (e) => {
    if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > SLOP) cancel();
  });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) box.addEventListener(t, cancel);
  // A long press must not bring up the browser's own menu (save image, right-click).
  box.addEventListener("contextmenu", (e) => { if (box.classList.contains("has-face")) e.preventDefault(); });
  // Runs before main.js's click on the ring, so the hold does not also open the list.
  document.addEventListener("click", (e) => {
    if (!skipClick) return;
    skipClick = false;
    if (box.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
}
