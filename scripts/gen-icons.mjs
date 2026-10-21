// Draws the app icons (写 in a 田字格 square) from stroke data, so no font is needed.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT, strokeData } from "./lib.mjs";

const OUT = path.join(ROOT, "public/icons");
fs.mkdirSync(OUT, { recursive: true });
const xie = strokeData("写");

// inset: fraction of the icon kept empty around the art (maskable icons need a safe zone).
function svg({ inset = 0.1, rounded = 0, bg = "#f7f5ee" } = {}) {
  const S = 1024, a = S * inset, w = S - 2 * a;
  const grid = "#d9877a";
  const k = (w * 0.86) / 1024, off = a + w * 0.07;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${rounded}" fill="${bg}"/>
  <rect x="${a}" y="${a}" width="${w}" height="${w}" fill="#fffef9" stroke="${grid}" stroke-width="${w * 0.018}"/>
  <g stroke="${grid}" stroke-width="${w * 0.008}" stroke-dasharray="${w * 0.03} ${w * 0.03}">
    <line x1="${S / 2}" y1="${a}" x2="${S / 2}" y2="${S - a}"/><line x1="${a}" y1="${S / 2}" x2="${S - a}" y2="${S / 2}"/>
  </g>
  <g transform="translate(${off},${off}) scale(${k}) translate(0,900) scale(1,-1)" fill="#1d1b18">
    ${xie.strokes.map((d, i) => `<path d="${d}"${i === 0 ? ' fill="#c8322a"' : ""}/>`).join("")}
  </g>
</svg>`;
}

const jobs = [
  ["icon-192.png", 192, svg()],
  ["icon-512.png", 512, svg()],
  ["icon-maskable-512.png", 512, svg({ inset: 0.2 })],
  ["apple-touch-icon.png", 180, svg({ inset: 0.08 })],
];
for (const [name, size, s] of jobs) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(path.join(OUT, name));
  console.log("public/icons/" + name);
}
fs.writeFileSync(path.join(ROOT, "public/favicon.svg"), svg({ inset: 0.04, rounded: 160 }));
console.log("public/favicon.svg");
