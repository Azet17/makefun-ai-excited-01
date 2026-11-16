// ai-excited-01 v3 — "The Hourglass Breaks Upward"
// A shattering hourglass frees a flock of glowing birds.
// Draws the whole image with code (no copied pixels, no text).
// Node 22, standard library only. Deterministic: fixed seed, no clocks.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---- deterministic PRNG (mulberry32) ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// ---- canvas ----
const buf = Buffer.alloc(W * H * 4); // RGBA, opaque

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Blend an RGBA colour over the pixel (source-over, premultiplied-ish).
function px(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H || a <= 0) return;
  const o = (iy * W + ix) * 4;
  const ia = 1 - a;
  buf[o] = Math.round(r * a + buf[o] * ia);
  buf[o + 1] = Math.round(g * a + buf[o + 1] * ia);
  buf[o + 2] = Math.round(b * a + buf[o + 2] * ia);
  buf[o + 3] = 255;
}

// Soft round dot (radial falloff) — used for glow, sparks, sand grains.
function dot(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number): void {
  const rr = Math.ceil(radius);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      if (d > 1) continue;
      const fall = 1 - d * d;
      px(cx + dx, cy + dy, r, g, b, a * fall);
    }
  }
}

// Thick line with round caps, drawn as a chain of dots.
function line(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number, a: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, width * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    dot(lerp(x0, x1, t), lerp(y0, y1, t), width / 2, r, g, b, a);
  }
}

// Filled polygon (scanline, even-odd).
function poly(points: Array<[number, number]>, r: number, g: number, b: number, a: number): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, yy1] = points[i];
      const [x2, yy2] = points[(i + 1) % points.length];
      if ((yy1 <= y && yy2 > y) || (yy2 <= y && yy1 > y)) {
        xs.push(x1 + ((y - yy1) / (yy2 - yy1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) px(x, y, r, g, b, a);
    }
  }
}

// Filled ellipse via horizontal spans.
function ellipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number): void {
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const t = (y - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const hw = rx * Math.sqrt(1 - t * t);
    const xa = Math.max(0, Math.ceil(cx - hw));
    const xb = Math.min(W - 1, Math.floor(cx + hw));
    for (let x = xa; x <= xb; x++) px(x, y, r, g, b, a);
  }
}

// 2D rotation helper (hourglass is tilted diagonally).
const ANG = (-24 * Math.PI) / 180;
const COS = Math.cos(ANG);
const SIN = Math.sin(ANG);
const HCX = 400; // hourglass centre
const HCY = 540;
function rot(lx: number, ly: number): [number, number] {
  return [HCX + lx * COS - ly * SIN, HCY + lx * SIN + ly * COS];
}

// ---- palette ----
const GOLD: [number, number, number] = [255, 190, 60];
const AMBER: [number, number, number] = [255, 140, 40];
const PALE: [number, number, number] = [255, 235, 170];
const CYAN: [number, number, number] = [90, 230, 255];
const WHITE: [number, number, number] = [255, 255, 255];

// ---- 1. night sky: vertical gradient, indigo to violet ----
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const r = lerp(8, 46, t);
  const g = lerp(12, 22, t);
  const b = lerp(38, 84, t);
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
  }
}
// faint diagonal aurora wash, upper right
for (let i = 0; i < 9000; i++) {
  const x = rand() * W;
  const y = rand() * H * 0.55;
  const d = Math.hypot(x - 780, y - 120) / 700;
  if (d < 1) dot(x, y, 26 + rand() * 40, 70, 90, 190, 0.05 * (1 - d));
}

// ---- 2. stars ----
for (let i = 0; i < 220; i++) {
  const x = rand() * W;
  const y = rand() * H;
  const s = rand();
  const c: [number, number, number] = s < 0.7 ? WHITE : s < 0.88 ? PALE : CYAN;
  const rad = s < 0.85 ? 1 + rand() * 1.2 : 1.8 + rand() * 1.4;
  dot(x, y, rad, c[0], c[1], c[2], 0.5 + rand() * 0.5);
  if (rand() < 0.12) dot(x, y, rad * 3.2, c[0], c[1], c[2], 0.12); // halo
}
// a few bright four-point star sparkles
for (let i = 0; i < 14; i++) {
  const x = 60 + rand() * (W - 120);
  const y = 60 + rand() * (H - 120);
  const L = 7 + rand() * 9;
  line(x - L, y, x + L, y, 2, 255, 255, 255, 0.85);
  line(x, y - L, x, y + L, 2, 255, 255, 255, 0.85);
  dot(x, y, 3, 255, 255, 255, 0.9);
}

// ---- 3. warm glow behind the break point (the burst's halo) ----
const [BX, BY] = rot(0, -10); // break point, just above the waist
for (let rr = 340; rr > 0; rr -= 4) {
  const t = 1 - rr / 340;
  dot(BX, BY, rr, 255, 170, 60, 0.02 + 0.10 * t * t);
}
dot(BX, BY, 200, 255, 200, 110, 0.10);

// ---- 4. hourglass glass: two bulbs meeting at the waist ----
// Local coords: waist at (0,0), bulbs extend +/-230 in local y, half-width 150 at the rims.
const TOP_RIM: Array<[number, number]> = [rot(-150, -230), rot(150, -230)];
const BOT_RIM: Array<[number, number]> = [rot(-150, 230), rot(150, 230)];
const WAIST: [number, number] = rot(0, 0);
// glass fill — pale blue, translucent
poly([TOP_RIM[0], TOP_RIM[1], WAIST], 150, 200, 255, 0.16);
poly([BOT_RIM[0], BOT_RIM[1], WAIST], 150, 200, 255, 0.16);
// sand resting in the lower bulb (gold, fills the bottom third)
const sandTop: [number, number] = rot(0, 96);
const sandL: [number, number] = rot(-96, 196);
const sandR: [number, number] = rot(96, 196);
poly([sandL, sandR, rot(-150, 230), rot(150, 230)], 255, 185, 55, 0.95);
poly([sandL, sandR, sandTop], 255, 205, 90, 0.95);
// a little sand still in the upper bulb, draining down
const upSandTop: [number, number] = rot(0, -96);
poly([rot(-96, -196), rot(96, -196), upSandTop], 255, 190, 70, 0.85);

// ---- 5. hourglass frame: thick gold rails + rims ----
// side rails (the two sloping edges of each bulb)
line(TOP_RIM[0][0], TOP_RIM[0][1], WAIST[0], WAIST[1], 13, ...GOLD, 1);
line(TOP_RIM[1][0], TOP_RIM[1][1], WAIST[0], WAIST[1], 13, ...GOLD, 1);
line(BOT_RIM[0][0], BOT_RIM[0][1], WAIST[0], WAIST[1], 13, ...GOLD, 1);
line(BOT_RIM[1][0], BOT_RIM[1][1], WAIST[0], WAIST[1], 13, ...GOLD, 1);
// rim caps, top and bottom (thick bars with rounded ends)
line(TOP_RIM[0][0] - 26, TOP_RIM[0][1], TOP_RIM[1][0] + 26, TOP_RIM[1][1], 26, ...AMBER, 1);
line(BOT_RIM[0][0] - 26, BOT_RIM[0][1], BOT_RIM[1][0] + 26, BOT_RIM[1][1], 26, ...AMBER, 1);
// gold highlight along the rails
line(TOP_RIM[0][0], TOP_RIM[0][1], WAIST[0], WAIST[1], 4, ...PALE, 0.9);
line(BOT_RIM[1][0], BOT_RIM[1][1], WAIST[0], WAIST[1], 4, ...PALE, 0.9);

// ---- 6. the crack: jagged white-gold shards bursting from the waist ----
for (let i = 0; i < 11; i++) {
  const ang = (i / 11) * Math.PI * 2 + rand() * 0.5;
  const len = 46 + rand() * 95;
  const x1 = BX + Math.cos(ang) * len;
  const y1 = BY + Math.sin(ang) * len * 0.8;
  const mx = BX + Math.cos(ang + 0.35) * len * 0.45;
  const my = BY + Math.sin(ang + 0.35) * len * 0.36;
  line(BX, BY, mx, my, 5, ...PALE, 0.95);
  line(mx, my, x1, y1, 3, ...GOLD, 0.9);
  dot(x1, y1, 4 + rand() * 4, ...PALE, 0.8);
}
// glass shards flying off the break
for (let i = 0; i < 16; i++) {
  const ang = rand() * Math.PI * 2;
  const dist = 60 + rand() * 170;
  const sx = BX + Math.cos(ang) * dist;
  const sy = BY + Math.sin(ang) * dist * 0.85;
  const s = 5 + rand() * 11;
  const a2 = rand() * Math.PI;
  poly(
    [
      [sx + Math.cos(a2) * s, sy + Math.sin(a2) * s],
      [sx + Math.cos(a2 + 2.1) * s * 0.7, sy + Math.sin(a2 + 2.1) * s * 0.7],
      [sx + Math.cos(a2 + 4.2) * s * 0.7, sy + Math.sin(a2 + 4.2) * s * 0.7],
    ],
    170, 215, 255, 0.85
  );
}

// ---- 7. the burst core at the break ----
dot(BX, BY, 58, ...WHITE, 0.95);
dot(BX, BY, 34, ...PALE, 1);
dot(BX, BY, 16, ...WHITE, 1);
for (let i = 0; i < 12; i++) {
  const ang = (i / 12) * Math.PI * 2 + 0.13;
  line(
    BX + Math.cos(ang) * 30, BY + Math.sin(ang) * 30,
    BX + Math.cos(ang) * (86 + (i % 3) * 22), BY + Math.sin(ang) * (86 + (i % 3) * 22),
    5, ...PALE, 0.9
  );
}

// ---- 8. sand pouring UP, turning into birds ----
// A rising curved stream from the break toward the upper-right corner.
// t = 0 at the break, t = 1 near the corner. Birds grow and spread as t rises.
function streamPoint(t: number): [number, number] {
  // gentle S-curve: rises fast, then sweeps right
  const x = BX + t * 520 + Math.sin(t * 3.1) * 26;
  const y = BY - t * 330 - Math.sin(t * 2.2) * 34;
  return [x, y];
}
// golden sand grains along the first half of the stream
for (let i = 0; i < 420; i++) {
  const t = rand() * 0.5;
  const [sx, sy] = streamPoint(t);
  const spread = 8 + t * 46;
  const gx = sx + (rand() - 0.5) * spread * 2;
  const gy = sy + (rand() - 0.5) * spread;
  const s = rand();
  const c: [number, number, number] = s < 0.75 ? GOLD : s < 0.92 ? PALE : AMBER;
  dot(gx, gy, 1.6 + rand() * 3.4, c[0], c[1], c[2], 0.75 + rand() * 0.25);
}
// cyan sparks threaded through the stream
for (let i = 0; i < 46; i++) {
  const t = 0.1 + rand() * 0.85;
  const [sx, sy] = streamPoint(t);
  const gx = sx + (rand() - 0.5) * 90;
  const gy = sy + (rand() - 0.5) * 60;
  dot(gx, gy, 2 + rand() * 3, ...CYAN, 0.9);
  if (rand() < 0.4) dot(gx, gy, 7, ...CYAN, 0.25);
}

// Bold gull silhouette: solid swept wings with curved edges, a tapered
// body, head and beak — one filled shape, reads as a bird even at small size.
// Drawn at (x, y), size s (wingspan ~2.2s), heading angle a.
function quad(p0: [number, number], p1: [number, number], p2: [number, number], n: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}
function bird(x: number, y: number, s: number, a: number, r: number, g: number, b: number, al: number): void {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const T = (p: [number, number]): [number, number] => [x + p[0] * ca - p[1] * sa, y + p[0] * sa + p[1] * ca];
  // each wing: a solid crescent — curved leading edge out to the tip,
  // curved trailing edge back to the body
  const wing = (dir: number): void => {
    const lead = quad([s * 0.3, 0], [s * 0.15, dir * s * 0.62], [-s * 0.75, dir * s * 0.88], 10);
    const trail = quad([-s * 0.75, dir * s * 0.88], [-s * 0.55, dir * s * 0.32], [-s * 0.45, 0], 8);
    const outline = [...lead, ...trail.slice(1)].map(T);
    poly(outline, r, g, b, al);
  };
  wing(1);
  wing(-1);
  // body: tapered ellipse pointing forward, head + beak
  ellipse(x + s * 0.32, y, s * 0.58, s * 0.19, r, g, b, al);
  const [hx, hy] = T([s * 0.72, -s * 0.03]);
  dot(hx, hy, s * 0.23, r, g, b, al);
  poly([T([s * 0.82, -s * 0.06]), T([s * 1.12, s * 0.02]), T([s * 0.82, s * 0.1])], r, g, b, al);
  // pale belly highlight
  ellipse(x + s * 0.25, y + s * 0.06, s * 0.32, s * 0.07, ...PALE, al * 0.55);
}

// the flock: birds stream up-right, growing as they escape
const FLOCK = 22;
for (let i = 0; i < FLOCK; i++) {
  const t = 0.18 + (i / FLOCK) * 0.82 + (rand() - 0.5) * 0.04;
  const [sx, sy] = streamPoint(Math.min(1, t));
  const jx = sx + (rand() - 0.5) * (20 + t * 60);
  const jy = sy + (rand() - 0.5) * (16 + t * 46);
  const size = 15 + t * 30 + rand() * 6;
  const heading = -0.62 + (rand() - 0.5) * 0.5; // up-right
  const pick = rand();
  const c: [number, number, number] = pick < 0.62 ? GOLD : pick < 0.86 ? AMBER : PALE;
  bird(jx, jy, size, heading, c[0], c[1], c[2], 1);
}
// three hero birds, largest and brightest, leading the flock
bird(885, 150, 50, -0.55, ...GOLD, 1);
bird(795, 258, 42, -0.62, ...PALE, 1);
bird(935, 305, 38, -0.5, ...AMBER, 1);
// one cyan bird — the odd one out, the surprise
bird(700, 130, 34, -0.7, ...CYAN, 1);

// ---- 9. vignette: darken the corners so the centre pops ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.86) {
      const a = Math.min(0.34, (d - 0.86) * 1.4);
      const o = (y * W + x) * 4;
      buf[o] = Math.round(buf[o] * (1 - a));
      buf[o + 1] = Math.round(buf[o + 1] * (1 - a));
      buf[o + 2] = Math.round(buf[o + 2] * (1 - a));
    }
  }
}

// ---- PNG encoder (RGBA, filter 0, zlib deflate) ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter none
    buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG();
fs.writeFileSync(path.join(outDir, "entry.png"), png);
console.log(`wrote ${png.length} bytes to ${path.join(outDir, "entry.png")}`);
