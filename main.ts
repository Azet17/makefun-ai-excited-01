// ai-excited-01 — R4 clean-room entry (fresh session, drawn entirely in code).
//
// "The Last Drop": a giant koi bursts out of a tiny teacup on a wooden table
// and arcs across a deep indigo night sky, its splash turning into stars.
// One look: a huge orange fish where a fish should never be, leaping from
// something far too small to hold it — scale twist, motion, and a bright
// diagonal shape that still reads at 300 px across.
//
// Node 22 standard library only. Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Writes exactly one image: $MAKEFUN_OUTPUT_DIR/entry.png (1024x1024 PNG).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const fb = new Uint8ClampedArray(W * H * 4);

type RGB = [number, number, number];

// Deterministic PRNG so the image is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function px(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  const i = (yi * W + xi) * 4;
  const ia = 1 - a;
  fb[i] = clamp255(c[0] * a + fb[i] * ia);
  fb[i + 1] = clamp255(c[1] * a + fb[i + 1] * ia);
  fb[i + 2] = clamp255(c[2] * a + fb[i + 2] * ia);
  fb[i + 3] = 255;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c0: RGB, c1: RGB, t: number): RGB {
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
}

// Vertical gradient over the whole canvas.
function vgrad(cTop: RGB, cMid: RGB, cBot: RGB): void {
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const c = t < 0.55 ? mix(cTop, cMid, t / 0.55) : mix(cMid, cBot, (t - 0.55) / 0.45);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
      fb[i + 3] = 255;
    }
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, a: number): void {
  if (r <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= rr) px(x, y, c, a);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) px(x, y, c, a);
    }
  }
}

// Soft radial glow, alpha falling off quadratically.
function glow(cx: number, cy: number, r: number, c: RGB, peak: number): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d < 1) {
        const a = peak * (1 - d) * (1 - d);
        px(x, y, c, a);
      }
    }
  }
}

// Scanline polygon fill.
function poly(pts: Array<[number, number]>, c: RGB, a: number): void {
  let minY = H;
  let maxY = 0;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs: Array<number> = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y)) {
        const t = (y - p0[1]) / (p1[1] - p0[1]);
        xs.push(p0[0] + t * (p1[0] - p0[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) px(x, y, c, a);
    }
  }
}

// Thick polyline: stamp circles along the points.
function stroke(pts: Array<[number, number]>, radii: Array<number> | number, c: RGB, a: number): void {
  for (let i = 0; i < pts.length; i++) {
    const r = typeof radii === 'number' ? radii : radii[i];
    circle(pts[i][0], pts[i][1], r, c, a);
  }
}

// Quadratic bezier point.
function qbez(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function qbezPts(p0: [number, number], p1: [number, number], p2: [number, number], n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) out.push(qbez(p0, p1, p2, i / n));
  return out;
}

// Four-point star sparkle.
function sparkle(cx: number, cy: number, size: number, c: RGB, a: number): void {
  const pts: Array<[number, number]> = [];
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.22;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  poly(pts, c, a);
  circle(cx, cy, size * 0.18, c, a);
}

function rot(x: number, y: number, cx: number, cy: number, ang: number): [number, number] {
  const dx = x - cx;
  const dy = y - cy;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
}

// Smooth profile through keyframes [t, value] with cosine interpolation.
function profile(t: number, keys: Array<[number, number]>): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const s = (1 - Math.cos(u * Math.PI)) / 2;
      return lerp(a[1], b[1], s);
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

// Palette
const INK_TOP: RGB = [7, 11, 36];
const INK_MID: RGB = [20, 27, 77];
const INK_BOT: RGB = [46, 58, 122];
const GOLD: RGB = [255, 196, 90];
const CREAM: RGB = [255, 248, 224];
const KOI: RGB = [255, 122, 26];
const KOI_DEEP: RGB = [214, 74, 8];
const KOI_LIGHT: RGB = [255, 176, 92];
const PORCELAIN: RGB = [245, 242, 232];
const PORC_BLUE: RGB = [52, 96, 168];
const FOAM: RGB = [214, 240, 255];
const AQUA: RGB = [110, 220, 255];

// 1. Night sky.
vgrad(INK_TOP, INK_MID, INK_BOT);

// 2. Faint nebula blobs.
glow(210, 260, 260, [88, 60, 160], 0.16);
glow(830, 620, 300, [24, 120, 140], 0.14);
glow(560, 130, 200, [140, 70, 130], 0.10);

// 3. Stars.
for (let i = 0; i < 210; i++) {
  const x = rand() * W;
  const y = rand() * 830;
  const r = 0.6 + rand() * 1.4;
  const b = 0.35 + rand() * 0.65;
  circle(x, y, r, [255, 255, 255], b);
}
for (let i = 0; i < 14; i++) {
  sparkle(40 + rand() * 940, 30 + rand() * 700, 4 + rand() * 7, CREAM, 0.5 + rand() * 0.5);
}

// Crescent drawn directly as one filled shape (outer arc of the moon disc
// joined to the inner arc of the bite), so no mismatched disc shows.
function crescent(cx: number, cy: number, r: number, bx: number, by: number, br: number, c: RGB, a: number): void {
  const d = Math.hypot(bx - cx, by - cy);
  const av = (r * r - br * br + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - av * av));
  const ux = (bx - cx) / d;
  const uy = (by - cy) / d;
  const px0 = cx + av * ux;
  const py0 = cy + av * uy;
  const qx = -uy;
  const qy = ux;
  const i1: [number, number] = [px0 + h * qx, py0 + h * qy];
  const i2: [number, number] = [px0 - h * qx, py0 - h * qy];
  const a1 = Math.atan2(i1[1] - cy, i1[0] - cx);
  const a2 = Math.atan2(i2[1] - cy, i2[0] - cx);
  const b1 = Math.atan2(i1[1] - by, i1[0] - bx);
  const b2 = Math.atan2(i2[1] - by, i2[0] - bx);
  const pts: Array<[number, number]> = [];
  // Outer arc: from i2 around the far side to i1.
  const TAU = Math.PI * 2;
  let start = a2;
  let end = a1;
  while (end > start) end -= TAU;
  for (let s = start; s >= end; s -= 0.05) {
    pts.push([cx + r * Math.cos(s), cy + r * Math.sin(s)]);
  }
  // Inner arc: from i1 back to i2 along the bite circle.
  let bs = b1;
  let be = b2;
  while (be < bs) be += TAU;
  for (let s = bs; s <= be; s += 0.05) {
    pts.push([bx + br * Math.cos(s), by + br * Math.sin(s)]);
  }
  poly(pts, c, a);
}

// 4. Crescent moon, top right, with halo.
glow(838, 148, 190, [255, 240, 200], 0.35);
crescent(838, 148, 82, 872, 128, 74, CREAM, 1);
glow(838, 148, 120, [255, 244, 214], 0.12);

// 5. Warm glow behind the koi's arc.
glow(620, 480, 330, [255, 150, 60], 0.20);
glow(620, 480, 190, [255, 190, 110], 0.16);

// 6. Wooden table.
for (let y = 880; y < H; y++) {
  const t = (y - 880) / (H - 880);
  const c = mix([58, 36, 24], [26, 15, 10], t);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    fb[i] = c[0];
    fb[i + 1] = c[1];
    fb[i + 2] = c[2];
    fb[i + 3] = 255;
  }
}
// Table edge highlight + soft warm reflection of the leap.
for (let x = 0; x < W; x++) px(x, 880, GOLD, 0.55);
ellipse(430, 900, 260, 26, [255, 170, 80], 0.10);
ellipse(430, 905, 150, 16, [255, 200, 120], 0.10);

// 7. Faint motion streaks behind the koi (speed lines).
const streakPts = qbezPts([360, 860], [560, 620], [760, 330], 40);
for (let k = 0; k < 3; k++) {
  const off = (k - 1) * 46;
  const pts = streakPts.map((p) => [p[0] + off * 0.7, p[1] + off] as [number, number]);
  stroke(pts, 3, [255, 255, 255], 0.07);
}

// ---------------------------------------------------------------------------
// The koi — spine from the teacup (tail) up to the head, top right.
// ---------------------------------------------------------------------------
const SP0: [number, number] = [432, 836];
const SP1: [number, number] = [600, 590];
const SP2: [number, number] = [806, 268];
const spine = qbezPts(SP0, SP1, SP2, 90);
const RADIUS_KEYS: Array<[number, number]> = [
  [0, 24],
  [0.22, 52],
  [0.45, 88],
  [0.65, 92],
  [0.82, 76],
  [0.93, 60],
  [1, 46],
];

// Tail fin: a flowing fan opening to the left of the tail, in the splash
// zone above the table, drawn before the body so the body overlaps its root.
const tailBase = spine[0];
const tailFan: Array<[number, number]> = [
  [tailBase[0] - 4, tailBase[1] - 8],
  [372, 806],
  [330, 812],
  [302, 838],
  [312, 866],
  [348, 884],
  [392, 878],
  [428, 856],
];
poly(tailFan, KOI, 0.9);
poly(
  [
    [tailBase[0] - 2, tailBase[1] - 4],
    [382, 818],
    [346, 826],
    [326, 846],
    [340, 866],
    [378, 868],
    [412, 852],
    [430, 838],
  ],
  KOI_LIGHT,
  0.45,
);

// Body: stamp circles along the spine with the radius profile.
for (let i = 0; i < spine.length; i++) {
  const t = i / (spine.length - 1);
  const r = profile(t, RADIUS_KEYS);
  const shade = 0.82 + 0.28 * Math.sin(Math.PI * Math.min(t * 1.15, 1));
  const c: RGB = [
    clamp255(KOI[0] * shade),
    clamp255(KOI[1] * shade),
    clamp255(KOI[2] * shade),
  ];
  circle(spine[i][0], spine[i][1], r, c, 1);
}
// Belly light: lighter stamps offset down-left along the spine.
for (let i = 0; i < spine.length; i++) {
  const t = i / (spine.length - 1);
  const r = profile(t, RADIUS_KEYS) * 0.62;
  circle(spine[i][0] - r * 0.28, spine[i][1] + r * 0.34, r, KOI_LIGHT, 0.5);
}
// Rim light: bright edge along the upper side of the body.
for (let i = 0; i < spine.length; i++) {
  const t = i / (spine.length - 1);
  const r = profile(t, RADIUS_KEYS);
  circle(spine[i][0] + r * 0.42, spine[i][1] - r * 0.62, r * 0.30, [255, 214, 150], 0.55);
}
// Dorsal fin: a narrow translucent crest hugging the upper edge of the
// body, drawn before the markings so it never cuts across them.
const dorsal: Array<[number, number]> = [];
for (let i = 0; i <= 24; i++) {
  const t = 0.34 + (0.72 - 0.34) * (i / 24);
  const p = qbez(SP0, SP1, SP2, t);
  const r = profile(t, RADIUS_KEYS);
  const wave = 6 + 8 * Math.abs(Math.sin(i * 1.7));
  dorsal.push([p[0] + r * 0.62, p[1] - r * 0.62 - wave * (i % 2 === 0 ? 1 : 0.4)]);
}
const dorsalBase: Array<[number, number]> = [];
for (let i = 24; i >= 0; i--) {
  const t = 0.34 + (0.72 - 0.34) * (i / 24);
  const p = qbez(SP0, SP1, SP2, t);
  const r = profile(t, RADIUS_KEYS);
  dorsalBase.push([p[0] + r * 0.5, p[1] - r * 0.5]);
}
poly([...dorsal, ...dorsalBase], [255, 210, 160], 0.6);
// White patches (koi markings) — blobs hugging the spine.
const patches: Array<[number, number, number]> = [
  [0.34, 0.52, 46],
  [0.47, 0.46, 58],
  [0.60, 0.38, 50],
  [0.72, 0.30, 40],
  [0.86, 0.20, 30],
];
for (const [t, off, pr] of patches) {
  const p = qbez(SP0, SP1, SP2, t);
  const r = profile(t, RADIUS_KEYS);
  ellipse(p[0] + r * off * 0.4, p[1] - r * off * 0.5, pr, pr * 0.62, [255, 250, 240], 0.95);
}
// A few black spots.
const spots: Array<[number, number, number]> = [
  [0.28, -0.3, 9],
  [0.52, 0.42, 12],
  [0.66, -0.42, 8],
  [0.78, 0.35, 10],
];
for (const [t, off, sr] of spots) {
  const p = qbez(SP0, SP1, SP2, t);
  const r = profile(t, RADIUS_KEYS);
  circle(p[0] + r * off, p[1] + r * off * 0.4, sr, [24, 16, 12], 0.9);
}

// Pectoral fins near the head, sweeping back.
const head = qbez(SP0, SP1, SP2, 0.97);
const headR = profile(0.97, RADIUS_KEYS);
poly(
  [
    [head[0] - 8, head[1] + 20],
    [head[0] - 52, head[1] + 78],
    [head[0] - 72, head[1] + 108],
    [head[0] - 44, head[1] + 96],
    [head[0] - 4, head[1] + 46],
  ],
  [255, 190, 130],
  0.8,
);
poly(
  [
    [head[0] + 18, head[1] - 10],
    [head[0] + 62, head[1] - 46],
    [head[0] + 86, head[1] - 34],
    [head[0] + 52, head[1] - 2],
    [head[0] + 26, head[1] + 14],
  ],
  [255, 200, 150],
  0.8,
);

// Eye + whiskers + mouth.
const eyeX = head[0] + headR * 0.42;
const eyeY = head[1] - headR * 0.38;
circle(eyeX, eyeY, 13, [16, 10, 8], 1);
circle(eyeX + 4, eyeY - 4, 4.5, [255, 255, 255], 1);
circle(eyeX - 2, eyeY + 3, 2, [255, 255, 255], 0.7);
const whisk1 = qbezPts([head[0] + headR * 0.8, head[1] + headR * 0.1], [head[0] + 96, head[1] + 6], [head[0] + 150, head[1] + 44], 60);
stroke(whisk1, 2, CREAM, 0.9);
const whisk2 = qbezPts([head[0] + headR * 0.72, head[1] + headR * 0.3], [head[0] + 88, head[1] + 40], [head[0] + 128, head[1] + 92], 60);
stroke(whisk2, 2, CREAM, 0.9);
const mouth = qbezPts([head[0] + headR * 0.72, head[1] + headR * 0.52], [head[0] + headR * 0.95, head[1] + headR * 0.66], [head[0] + headR * 0.72, head[1] + headR * 0.82], 30);
stroke(mouth, 2.5, [120, 40, 8], 0.85);

// ---------------------------------------------------------------------------
// Splash crown + droplet trail (water turning into stars)
// ---------------------------------------------------------------------------
const BREACH: [number, number] = [432, 836];
// Foam ring where the fish left the cup.
for (let i = 0; i < 26; i++) {
  const ang = (i / 26) * Math.PI * 2;
  const rr = 34 + rand() * 30;
  circle(BREACH[0] + Math.cos(ang) * rr, BREACH[1] + Math.sin(ang) * rr * 0.45, 5 + rand() * 9, FOAM, 0.9);
}
// Splash spikes radiating upward.
for (let i = 0; i < 14; i++) {
  const ang = -Math.PI / 2 + (rand() - 0.5) * 1.9;
  const len = 40 + rand() * 90;
  const x2 = BREACH[0] + Math.cos(ang) * len;
  const y2 = BREACH[1] + Math.sin(ang) * len;
  const pts = qbezPts([BREACH[0], BREACH[1]], [(BREACH[0] + x2) / 2, (BREACH[1] + y2) / 2 - 14], [x2, y2], 10);
  stroke(pts, 4 + rand() * 3, FOAM, 0.85);
  circle(x2, y2, 5 + rand() * 6, FOAM, 0.95);
}
// Droplets arcing along the leap; the farthest ones become gold stars.
for (let i = 0; i < 46; i++) {
  const t = 0.08 + rand() * 0.85;
  const p = qbez(SP0, SP1, SP2, t);
  const side = rand() < 0.5 ? -1 : 1;
  const off = profile(t, RADIUS_KEYS) + 14 + rand() * 60;
  const dx = p[0] + side * off * (0.4 + rand() * 0.6);
  const dy = p[1] - off * (0.3 + rand() * 0.5) + rand() * 30;
  const s = 2 + rand() * 6;
  if (rand() < 0.28) {
    sparkle(dx, dy, s * 1.6, GOLD, 0.95);
  } else {
    circle(dx, dy, s, rand() < 0.5 ? FOAM : AQUA, 0.9);
    circle(dx - s * 0.3, dy - s * 0.3, s * 0.35, [255, 255, 255], 0.9);
  }
}
// A few big hero droplets near the tail.
for (let i = 0; i < 8; i++) {
  const ang = -Math.PI / 2 + (rand() - 0.5) * 2.4;
  const len = 60 + rand() * 110;
  circle(BREACH[0] + Math.cos(ang) * len, BREACH[1] + Math.sin(ang) * len * 0.8, 7 + rand() * 7, AQUA, 0.9);
}

// ---------------------------------------------------------------------------
// The tiny teacup (tilted, tea spilling out)
// ---------------------------------------------------------------------------
const CUP: [number, number] = [432, 872];
const TILT = -0.21; // radians
// Saucer.
ellipse(CUP[0], CUP[1] + 26, 96, 17, [210, 205, 192], 1);
ellipse(CUP[0], CUP[1] + 22, 96, 15, PORCELAIN, 1);
ellipse(CUP[0], CUP[1] + 20, 70, 10, [226, 222, 210], 1);
// Cup body (rotated trapezoid with a rounded bottom).
const cupPts: Array<[number, number]> = [
  [CUP[0] - 62, CUP[1] - 34],
  [CUP[0] + 62, CUP[1] - 34],
  [CUP[0] + 44, CUP[1] + 22],
  [CUP[0] - 44, CUP[1] + 22],
].map(([x, y]) => rot(x, y, CUP[0], CUP[1], TILT));
poly(cupPts, PORCELAIN, 1);
// Blue band + gold rim.
const bandPts: Array<[number, number]> = [
  [CUP[0] - 58, CUP[1] - 16],
  [CUP[0] + 58, CUP[1] - 16],
  [CUP[0] + 52, CUP[1] + 2],
  [CUP[0] - 52, CUP[1] + 2],
].map(([x, y]) => rot(x, y, CUP[0], CUP[1], TILT));
poly(bandPts, PORC_BLUE, 1);
const rimPts: Array<[number, number]> = [
  [CUP[0] - 63, CUP[1] - 36],
  [CUP[0] + 63, CUP[1] - 36],
  [CUP[0] + 61, CUP[1] - 28],
  [CUP[0] - 61, CUP[1] - 28],
].map(([x, y]) => rot(x, y, CUP[0], CUP[1], TILT));
poly(rimPts, GOLD, 1);
// Tea surface, tilted with the cup.
const teaC = rot(CUP[0] + 6, CUP[1] - 30, CUP[0], CUP[1], TILT);
ellipse(teaC[0], teaC[1], 56, 9, [176, 116, 30], 1);
ellipse(teaC[0] - 8, teaC[1] - 2, 34, 5, [224, 164, 70], 1);
// Handle: white arc, inner cutout in table colour.
const handlePts = qbezPts(
  [CUP[0] + 62, CUP[1] - 18],
  [CUP[0] + 104, CUP[1] - 8],
  [CUP[0] + 66, CUP[1] + 16],
  18,
).map(([x, y]) => rot(x, y, CUP[0], CUP[1], TILT));
stroke(handlePts, 7, PORCELAIN, 1);
const handleInner = qbezPts(
  [CUP[0] + 62, CUP[1] - 18],
  [CUP[0] + 96, CUP[1] - 8],
  [CUP[0] + 66, CUP[1] + 16],
  18,
).map(([x, y]) => rot(x, y, CUP[0], CUP[1], TILT));
stroke(handleInner, 3.5, [58, 36, 24], 1);
// Tea spilling from the tilted rim toward the breach.
const spill = qbezPts([CUP[0] + 30, CUP[1] - 34], [CUP[0] + 16, CUP[1] - 62], [CUP[0] + 2, CUP[1] - 78], 30);
stroke(spill, 3, [200, 140, 44], 0.85);
circle(CUP[0] + 2, CUP[1] - 78, 6, [200, 140, 44], 0.95);

// ---------------------------------------------------------------------------
// Vignette: darken the corners so the centre pops.
// ---------------------------------------------------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.82) {
      const a = Math.min(0.28, (d - 0.82) * 0.9);
      px(x, y, [4, 6, 20], a);
    }
  }
}

// ---------------------------------------------------------------------------
// PNG encode (stdlib zlib) + write
// ---------------------------------------------------------------------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter: none
  Buffer.from(fb.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')} (${png.length} bytes, ${W}x${H})`);
