// Names each stroke of a character (横, 竖, 撇, 横折钩 …) from its median line in the stroke data.
// The median is simplified into straight segments; each segment gets a direction, and the
// sequence of directions maps to a stroke name. Used to pre-fill stroke names for new lessons.

// Ramer–Douglas–Peucker simplification.
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
function distToSeg(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

// Direction of a segment on screen (y grows downward): angle 0 = right, 90 = down, -90 = up.
function dir(a, b) {
  const dx = b[0] - a[0], dy = a[1] - b[1]; // data y points up; flip so positive = down
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang >= -28 && ang <= 22) return "H";      // → (横 rises a little)
  if (ang > 22 && ang < 62) return "D";         // ↘ 点 / 捺
  if (ang >= 62 && ang <= 112) return "S";      // ↓
  if (ang > 112 && ang <= 168) return "P";       // ↙ 撇
  if (ang < -28 && ang >= -80) return "T";      // ↗ 提
  return "G";                                    // ↑ ↖ ← : hook or turn back
}

export function segments(median) {
  const pts = rdp(median, 40);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len < 18) continue;
    const d = dir(pts[i], pts[i + 1]);
    const last = segs[segs.length - 1];
    if (last && last.d === d) last.len += len; else segs.push({ d, len });
  }
  return segs;
}

// Brush entry and tiny wobbles show up as short segments; remove them before naming.
function clean(segs) {
  let s = segs.filter((x, i) => x.len >= 60 || i === 0 || i === segs.length - 1);
  const lead = { D: "SP", S: "P", G: "T" };
  if (s.length > 1 && s[0].len < 130 && (lead[s[0].d] || "").includes(s[1].d)) s = s.slice(1);
  const out = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && last.d === x.d) last.len += x.len; else out.push({ ...x });
  }
  return out;
}

export function strokeType(median) {
  const segs = clean(segments(median));
  if (!segs.length) return "点";
  const total = segs.reduce((t, s) => t + s.len, 0);
  const k0 = segs.map((s) => s.d).join("");
  const tail = segs[segs.length - 1];
  // Small fixed shapes first.
  if (k0 === "S" && total < 230) return "点";
  if (k0 === "SP" || k0 === "DP") return "撇";
  if (k0 === "D") return total < 400 ? "点" : "捺";
  if (k0 === "DH") return "捺";
  if (/^HD?P$/.test(k0) && tail.len < 160 && tail.len < total * 0.4) return "横钩";
  if (k0 === "HSP") return "横撇";
  if (k0 === "SHT") return "竖弯钩";
  if (k0 === "HSDHG") return "横折弯钩";
  // A short final up/left flick is a hook.
  const hook = segs.length > 1 && segs[segs.length - 1].d === "G" && segs[segs.length - 1].len < total * 0.35;
  const body = hook ? segs.slice(0, -1) : segs;
  const k = body.map((s) => s.d).join("");
  const H = hook ? "钩" : "";
  const T = {
    H: "横", S: "竖", P: "撇", T: "提", G: "撇",
    D: total < 260 ? "点" : "捺",
    HS: "横折", HP: "横撇", HD: "横撇", HSH: "横折弯", HST: "横折提", HSP: "横折撇", HPD: "横折折撇", HSHS: "横折折折", HPHP: "横折折撇", HSPS: "横撇弯", HSPD: "横折折撇",
    SH: "竖折", ST: "竖提", SHS: "竖折折", SP: "竖撇", SD: "竖", SHP: "竖折撇",
    PH: "撇折", PD: "撇点", PT: "撇折", DP: "撇点", DS: "竖", PS: "撇",
    TD: "撇点", DH: "点",
  }[k];
  const HOOKED = {
    S: "竖钩", H: "横钩", HS: "横折钩", HP: "横折钩", HSH: "横折弯钩", HD: "横折弯钩", SH: "竖弯钩", SD: "竖弯钩", D: "斜钩",
    SHS: "竖折折钩", HPHP: "横撇弯钩", HSHS: "横折折折钩", PH: "竖弯钩", DH: "卧钩", HPH: "横折弯钩", HPS: "横折折钩",
    P: "弯钩", SP: "弯钩", HSP: "横折钩", DS: "竖钩",
  }[k];
  if (hook) return HOOKED || (body.length ? (T || "竖") + H : "竖钩");
  return T || (k.startsWith("H") ? "横折" : k.startsWith("S") ? "竖折" : k.startsWith("P") ? "撇折" : "点");
}

export const describe = (median) => segments(median).map((s) => `${s.d}${Math.round(s.len)}`).join(" ");
