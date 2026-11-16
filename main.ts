// ai-excited-01 R6 — "Koi Over the Neon Tide"
// A giant koi bursts out of a curling night wave above a neon city,
// its leap scattering droplets that turn into stars mid-air.
// Drawn entirely in code: own PNG encoder, seeded random only.
// Writes entry.png to $MAKEFUN_OUTPUT_DIR (and to /output/entry.png).

import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------- seeded random ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

// ---------- pixel buffer ----------
const buf = new Uint8Array(W * H * 4);
function px(x: number, y: number, r: number, g: number, b: number, a = 1) {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 4;
  const inv = 1 - a;
  buf[o] = Math.round(r * a + buf[o] * inv);
  buf[o + 1] = Math.round(g * a + buf[o + 1] * inv);
  buf[o + 2] = Math.round(b * a + buf[o + 2] * inv);
  buf[o + 3] = 255;
}
function fillCircle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= rad * rad) px(x, y, r, g, b, a);
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 1, rot = 0) {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const x0 = Math.max(0, Math.floor(cx - rx - ry)), x1 = Math.min(W - 1, Math.ceil(cx + rx + ry));
  const y0 = Math.max(0, Math.floor(cy - rx - ry)), y1 = Math.min(H - 1, Math.ceil(cy + rx + ry));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    if ((u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1) px(x, y, r, g, b, a);
  }
}
function fillPolygon(pts: [number, number][], r: number, g: number, b: number, a = 1) {
  let minY = H, maxY = 0;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i])), xb = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = xa; x <= xb; x++) px(x, y, r, g, b, a);
    }
  }
}
function thickLine(x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number, a = 1) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / (w * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, r, g, b, a);
  }
}
function rotPt(cx: number, cy: number, x: number, y: number, ang: number): [number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

// ---------- sky: dusk gradient ----------
for (let y = 0; y < H; y++) {
  const t = y / H;
  let r: number, g: number, b: number;
  if (t < 0.45) { const k = t / 0.45; r = 12 + 46 * k; g = 10 + 22 * k; b = 48 + 42 * k; }
  else if (t < 0.62) { const k = (t - 0.45) / 0.17; r = 58 + 150 * k; g = 32 + 62 * k; b = 90 + 18 * k; }
  else { const k = (t - 0.62) / 0.38; r = 208 - 120 * k; g = 94 - 30 * k; b = 108 - 60 * k; }
  for (let x = 0; x < W; x++) px(x, y, r, g, b);
}

// ---------- stars ----------
for (let i = 0; i < 260; i++) {
  const x = rand() * W, y = rand() * 560;
  const s = rand();
  const bright = 150 + rand() * 105;
  fillCircle(x, y, s < 0.85 ? 1.2 : 2.2, bright, bright, 255, 0.5 + rand() * 0.5);
  if (s > 0.93) {
    thickLine(x - 6, y, x + 6, y, 1, 255, 255, 255, 0.7);
    thickLine(x, y - 6, x, y + 6, 1, 255, 255, 255, 0.7);
  }
}

// ---------- low moon with halo ----------
for (let rr = 150; rr > 0; rr -= 6) {
  const a = 0.05 + 0.10 * (1 - rr / 150);
  fillCircle(792, 168, rr, 255, 214, 140, a * 0.55);
}
fillCircle(792, 168, 62, 255, 236, 180);
fillCircle(778, 152, 10, 238, 205, 140, 0.8);
fillCircle(806, 182, 7, 238, 205, 140, 0.8);
fillCircle(800, 146, 5, 238, 205, 140, 0.8);

// ---------- drifting clouds ----------
for (let i = 0; i < 7; i++) {
  const cx = rand() * W, cy = 90 + rand() * 260;
  const cr = 40 + rand() * 70;
  fillEllipse(cx, cy, cr, cr * 0.32, 255, 150, 170, 0.10);
  fillEllipse(cx + cr * 0.5, cy + 8, cr * 0.7, cr * 0.26, 255, 150, 170, 0.08);
}

// ---------- neon city skyline ----------
const horizon = 660;
for (let x = 0; x < W;) {
  const bw = 34 + rand() * 66;
  const bh = 60 + rand() * 190;
  const bx = x;
  for (let y = horizon - bh; y < horizon; y++) for (let xx = bx; xx < bx + bw && xx < W; xx++) {
    px(xx, y, 16, 14, 38);
  }
  if (rand() < 0.4) thickLine(bx + bw / 2, horizon - bh, bx + bw / 2, horizon - bh - 26, 2, 16, 14, 38);
  for (let wy = horizon - bh + 12; wy < horizon - 10; wy += 16) {
    for (let wx = bx + 7; wx < bx + bw - 7; wx += 14) {
      if (rand() < 0.34) {
        const warm = rand();
        const wr = warm < 0.5 ? 255 : warm < 0.75 ? 80 : 255;
        const wg = warm < 0.5 ? 190 : warm < 0.75 ? 220 : 90;
        const wb = warm < 0.5 ? 90 : warm < 0.75 ? 255 : 190;
        for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 6; dx++) px(wx + dx, wy + dy, wr, wg, wb, 0.95);
      }
    }
  }
  x += bw + 2 + rand() * 10;
}
// city glow band on the horizon
for (let y = horizon - 4; y < horizon + 26; y++) {
  const a = 0.35 * (1 - Math.abs(y - horizon - 6) / 30);
  for (let x = 0; x < W; x++) px(x, y, 255, 120, 90, Math.max(0, a));
}

// ---------- sea ----------
for (let y = horizon; y < H; y++) {
  const t = (y - horizon) / (H - horizon);
  const r = 26 - 14 * t, g = 44 + 30 * t, b = 74 + 26 * t;
  for (let x = 0; x < W; x++) px(x, y, r, g, b);
}
// moonlight path on the water
for (let i = 0; i < 90; i++) {
  const x = 792 + (rand() - 0.5) * (60 + (rand() * 220));
  const y = horizon + 20 + rand() * 300;
  fillEllipse(x, y, 14 + rand() * 26, 2.5 + rand() * 2, 255, 200, 120, 0.10 + rand() * 0.12);
}
// sea swell bands
for (let i = 0; i < 26; i++) {
  const y = horizon + 30 + rand() * 320;
  const x = rand() * W;
  const len = 60 + rand() * 160;
  thickLine(x, y, x + len, y + (rand() - 0.5) * 6, 2, 120, 190, 210, 0.16);
}

// ---------- giant curling wave (right) ----------
const wavePts: [number, number][] = [];
for (let a = 0; a <= Math.PI * 1.15; a += 0.05) {
  wavePts.push([760 + Math.cos(a) * 250, 700 - Math.sin(a) * 260]);
}
for (let a = Math.PI * 1.15; a >= 0; a -= 0.05) {
  wavePts.push([760 + Math.cos(a) * 150, 700 - Math.sin(a) * 170]);
}
fillPolygon(wavePts, 18, 90, 130, 0.92);
// wave crest highlight
for (let a = 0.1; a <= Math.PI * 1.05; a += 0.04) {
  const x = 760 + Math.cos(a) * 245, y = 700 - Math.sin(a) * 255;
  fillCircle(x, y, 7 + rand() * 5, 190, 240, 255, 0.5);
}
// foam at the wave foot
for (let i = 0; i < 130; i++) {
  const x = 560 + rand() * 420, y = 690 + rand() * 60;
  fillCircle(x, y, 2 + rand() * 7, 220, 245, 255, 0.25 + rand() * 0.55);
}
// curling lip droplets
for (let i = 0; i < 60; i++) {
  const a = 0.15 + rand() * 1.5;
  const x = 760 + Math.cos(a) * (250 + rand() * 26), y = 700 - Math.sin(a) * (260 + rand() * 26);
  fillCircle(x, y, 1.5 + rand() * 3.5, 200, 240, 255, 0.8);
}

// ---------- the koi: leaping diagonally, head up-left ----------
const KCX = 470, KCY = 430, KANG = -0.62;
function koi(x: number, y: number): [number, number] {
  return rotPt(KCX, KCY, x, y, KANG);
}
function koiEllipse(dx: number, dy: number, rx: number, ry: number, r: number, g: number, b: number, a = 1) {
  const [cx, cy] = koi(dx, dy);
  fillEllipse(cx, cy, rx, ry, r, g, b, a, KANG);
}
function koiPoly(local: [number, number][], r: number, g: number, b: number, a = 1) {
  fillPolygon(local.map(([x, y]) => koi(x, y)), r, g, b, a);
}
// flowing tail (two ribbons)
koiPoly([[-150, -6], [-260, -70], [-300, -30], [-235, 10]], 255, 120, 40, 0.95);
koiPoly([[-150, 8], [-250, 66], [-296, 34], [-228, -4]], 255, 90, 30, 0.95);
koiPoly([[-150, -4], [-240, -44], [-272, -14], [-220, 6]], 255, 200, 120, 0.9);
koiPoly([[-150, 6], [-232, 40], [-266, 16], [-214, -2]], 255, 200, 120, 0.9);
// dorsal fin
koiPoly([[-30, -52], [30, -88], [70, -50], [10, -44]], 255, 110, 40, 0.95);
// pectoral fins
koiPoly([[40, 30], [90, 78], [118, 60], [66, 22]], 255, 140, 60, 0.9);
koiPoly([[-20, 34], [20, 84], [52, 66], [8, 26]], 255, 160, 80, 0.85);
// body: white belly then orange back
koiEllipse(0, 0, 185, 62, 255, 250, 240);
koiEllipse(-6, -14, 178, 52, 255, 122, 26);
// koi patches (deep red-orange)
koiEllipse(-120, -22, 52, 26, 214, 48, 18, 0.95);
koiEllipse(-30, -30, 44, 24, 214, 48, 18, 0.95);
koiEllipse(62, -18, 58, 26, 214, 48, 18, 0.95);
koiEllipse(120, -8, 34, 18, 214, 48, 18, 0.95);
koiEllipse(-70, 18, 40, 16, 255, 176, 90, 0.9);
// head
koiEllipse(168, -4, 46, 40, 255, 250, 240);
koiEllipse(176, -16, 34, 22, 255, 122, 26);
// eye
{
  const [ex, ey] = koi(182, -18);
  fillCircle(ex, ey, 9, 20, 12, 20);
  fillCircle(ex + 3, ey - 3, 3.5, 255, 255, 255);
}
// barbels (whiskers)
{
  const [bx, by] = koi(204, 8);
  const [tx, ty] = koi(258, 44);
  thickLine(bx, by, tx, ty, 2.5, 255, 200, 140, 0.9);
  const [tx2, ty2] = koi(252, 2);
  thickLine(bx, by + 4, tx2, ty2, 2.5, 255, 200, 140, 0.9);
}
// scale shimmer along the back
for (let i = 0; i < 46; i++) {
  const dx = -150 + rand() * 280, dy = -46 + rand() * 30;
  const [sx, sy] = koi(dx, dy);
  fillCircle(sx, sy, 1.6 + rand() * 2, 255, 220, 160, 0.5);
}

// ---------- droplets turning into stars along the leap arc ----------
for (let i = 0; i < 90; i++) {
  const t = i / 90;
  const x = 180 + t * 560 + (rand() - 0.5) * 46;
  const y = 640 - Math.sin(t * Math.PI) * 330 - t * 60 + (rand() - 0.5) * 30;
  if (rand() < 0.42) {
    const s = 3 + rand() * 5;
    fillCircle(x, y, s, 255, 215, 120, 0.95);
    thickLine(x - s * 2.2, y, x + s * 2.2, y, 1.5, 255, 240, 180, 0.8);
    thickLine(x, y - s * 2.2, x, y + s * 2.2, 1.5, 255, 240, 180, 0.8);
  } else {
    fillCircle(x, y, 2 + rand() * 4, 170, 225, 255, 0.75);
  }
}
// splash burst where the koi left the water
for (let i = 0; i < 70; i++) {
  const a = -Math.PI * (0.15 + rand() * 0.7);
  const d = 30 + rand() * 150;
  const x = 250 + Math.cos(a) * d, y = 700 + Math.sin(a) * d * 0.55;
  fillCircle(x, y, 2 + rand() * 6, 215, 240, 255, 0.3 + rand() * 0.6);
}

// ---------- motion streaks ----------
for (let i = 0; i < 24; i++) {
  const x = 120 + rand() * 760, y = 240 + rand() * 420;
  const len = 40 + rand() * 110;
  thickLine(x, y, x + len, y - len * 0.45, 2 + rand() * 2, 255, 190, 120, 0.10 + rand() * 0.14);
}

// ---------- vignette ----------
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0.95) px(x, y, 0, 0, 10, Math.min(0.35, (d - 0.95) * 1.6));
}

// ---------- PNG encode (own encoder, filter 0) ----------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}
const raw = new Uint8Array(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, d = y * (1 + W * 3) + 1 + x * 3;
    raw[d] = buf[s]; raw[d + 1] = buf[s + 1]; raw[d + 2] = buf[s + 2];
  }
}
const ihdr = new Uint8Array(13);
{
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
}
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(chunk("IHDR", ihdr)),
  Buffer.from(chunk("IDAT", idat)),
  Buffer.from(chunk("IEND", new Uint8Array(0))),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
const target = join(outDir, "entry.png");
writeFileSync(target, png);
if (target !== "/output/entry.png") {
  mkdirSync("/output", { recursive: true });
  copyFileSync(target, "/output/entry.png");
}
console.log(`wrote ${target} ${png.length} bytes ${W}x${H}`);
