// The reader's pure logic (no DOM): the address, the saved place, fitting and zooming, swipes.
import { clampPage } from "./pages.js";

export const PLACE_KEY = "xz-pdf-place";
export const MAX_ZOOM = 4;

// "#/pdf/ledu/12" -> { id: "ledu", page: 12 }; the page is null when the address has none or a bad one.
export function parsePdfHash(hash) {
  const [, p, id, pg] = String(hash || "").split("/");
  if (p !== "pdf" || !id) return null;
  let key = id;
  try { key = decodeURIComponent(id); } catch {}
  const n = /^\d+$/.test(pg || "") ? Number(pg) : null;
  return { id: key, page: n && n >= 1 ? n : null };
}
export const pdfHash = (id, page) => `#/pdf/${encodeURIComponent(id)}/${page}`;

// The place map { id: page } kept on this device. `read` / `write` are the storage calls.
export function savedPage(map, pdf) {
  const n = map && typeof map === "object" ? map[pdf.id] : null;
  return Number.isInteger(n) ? clampPage(pdf, n) : 1;
}
export function withPage(map, id, page) {
  return { ...(map && typeof map === "object" && !Array.isArray(map) ? map : {}), [id]: page };
}

// Largest size with the page's shape that fits inside the box (CSS px).
export function fitSize(pw, ph, bw, bh) {
  if (!(pw > 0 && ph > 0 && bw > 0 && bh > 0)) return { w: 0, h: 0 };
  const s = Math.min(bw / pw, bh / ph);
  return { w: pw * s, h: ph * s };
}

export const clampZoom = (z) => Math.min(Math.max(z, 1), MAX_ZOOM);

// Keep a zoomed page from being dragged off the screen. (tx, ty) is the shift of its centre.
export function clampPan(tx, ty, w, h, bw, bh, z) {
  const mx = Math.max(0, (w * z - bw) / 2), my = Math.max(0, (h * z - bh) / 2);
  // A page smaller than the box on one axis stays centred on that axis.
  return { x: Math.min(Math.max(tx, -mx), mx), y: Math.min(Math.max(ty, -my), my) };
}

// Zoom about a point (px, py measured from the box centre) so that point stays under the finger.
export function zoomAt(state, z2, px, py) {
  const z = clampZoom(z2), k = z / state.z;
  return { z, x: px - (px - state.x) * k, y: py - (py - state.y) * k };
}

// What a finger lift means for a swipe: 1 = next, -1 = previous, 0 = stay.
export function swipeResult(dx, dt, width) {
  const v = dt > 0 ? Math.abs(dx) / dt : 0;   // px per ms
  if (Math.abs(dx) > width * 0.2 || (Math.abs(dx) > 24 && v > 0.45)) return dx < 0 ? 1 : -1;
  return 0;
}

// Where a tap at x (0..width) lands: the left third, the middle or the right third.
export function tapZone(x, width) {
  const f = x / Math.max(1, width);
  return f < 1 / 3 ? "prev" : f > 2 / 3 ? "next" : "mid";
}
