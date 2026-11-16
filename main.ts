// ai-excited-01 R5 — "The Last Wave"
// A tiny red-sailed boat rides the face of a colossal wave that curls over
// like a breaking sky; the crest bursts into spray and a flock of birds.
// Drawn entirely in code (Node 22+ stdlib only): a 1024x1024 RGB raster,
// hand-rolled PNG encoder. No image assets, no dependencies.
// Concept: scale twist (thumb-sized boat vs. mountain wave) + momentum
// (one diagonal surge, crest about to break) + a clean focal point that
// still reads at 300px wide.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const W = 1024;
const H = 1024;
const img = Buffer.alloc(W * H * 3);

// ---- deterministic RNG ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

// ---- pixel helpers ----
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
function setPx(x, y, r, g, b) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = clamp255(r); img[i + 1] = clamp255(g); img[i + 2] = clamp255(b);
}
function blendPx(x, y, r, g, b, a) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a >= 1) { setPx(x, y, r, g, b); return; }
  const i = (y * W + x) * 3;
  img[i] = clamp255(img[i] + (r - img[i]) * a);
  img[i + 1] = clamp255(img[i + 1] + (g - img[i + 1]) * a);
  img[i + 2] = clamp255(img[i + 2] + (b - img[i + 2]) * a);
}
function mix(c1, c2, t) {
  return [
    clamp255(c1[0] + (c2[0] - c1[0]) * t),
    clamp255(c1[1] + (c2[1] - c1[1]) * t),
    clamp255(c1[2] + (c2[2] - c1[2]) * t),
  ];
}
// gradient stops: [[pos0to1, [r,g,b]], ...]
function gradAt(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let s = 1; s < stops.length; s++) {
    if (t <= stops[s][0]) {
      const [p0, c0] = stops[s - 1];
      const [p1, c1] = stops[s];
      return mix(c0, c1, (t - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}
function fillRow(y, c) {
  if (y < 0 || y >= H) return;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
  }
}
function fillCircle(cx, cy, r, c, alpha = 1) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) blendPx(x, y, c[0], c[1], c[2], alpha);
    }
  }
}
// scanline polygon fill; colorAt(y) -> [r,g,b]
function fillPoly(pts, colorAt) {
  let minY = H, maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  const n = pts.length;
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      if ((y >= y0 && y < y1) || (y >= y1 && y < y0)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    const c = colorAt(y);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c[0], c[1], c[2]);
    }
  }
}
// thick line via stamped circles
function thickLine(x0, y0, x1, y1, w, c, alpha = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c, alpha);
  }
}
// polyline through points
function polyline(pts, w, c, alpha = 1) {
  for (let i = 0; i + 1 < pts.length; i++) {
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c, alpha);
  }
}

// ---- PNG encoder (color type 2, RGB, filter 0) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    img.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
// ================= SCENE v2 =================
const HORIZON = 560;

// ---- sky: deep indigo -> violet -> burning orange at the horizon ----
const SKY = [[0, [8, 6, 38]], [0.45, [52, 18, 88]], [0.75, [150, 42, 104]], [1, [255, 122, 58]]];
for (let y = 0; y < HORIZON; y++) fillRow(y, gradAt(SKY, y / HORIZON));

// ---- stars in the upper sky ----
for (let i = 0; i < 130; i++) {
  const x = rand() * W;
  const y = rand() * 380;
  const r = rand() < 0.85 ? 1 : 2;
  const a = 0.35 + rand() * 0.6;
  fillCircle(x, y, r, [255, 255, 255], a);
  if (rand() < 0.12) {
    thickLine(x - 4, y, x + 4, y, 1, [255, 255, 255], a * 0.7);
    thickLine(x, y - 4, x, y + 4, 1, [255, 255, 255], a * 0.7);
  }
}

// ---- sun: low, huge, right of the wave (x 830, y 445) ----
for (let r = 210; r > 95; r -= 6) {
  fillCircle(830, 445, r, [255, 150, 70], 0.05);
}
fillCircle(830, 445, 88, [255, 214, 130]);
fillCircle(830, 445, 66, [255, 236, 180]);
fillCircle(830, 445, 44, [255, 250, 225]);

// ---- sea: dark teal gradient ----
const SEA = [[0, [10, 66, 84]], [0.5, [6, 42, 62]], [1, [3, 18, 38]]];
for (let y = HORIZON; y < H; y++) fillRow(y, gradAt(SEA, (y - HORIZON) / (H - HORIZON)));

// distant swell on the horizon, for depth
for (let y = 548; y < HORIZON; y++) {
  for (let x = 0; x < W; x++) {
    const wave = Math.sin(x * 0.02) * 3 + Math.sin(x * 0.043 + 1.7) * 2;
    if (y > 552 + wave) blendPx(x, y, 8, 52, 66, 0.55);
  }
}

// ---- sun reflection: short shimmering dashes under the sun ----
for (let y = HORIZON + 10; y < H; y += 9) {
  const t = (y - HORIZON) / (H - HORIZON);
  const halfW = 20 + t * 80;
  const cx = 830 + (rand() - 0.5) * (20 + t * 40);
  const len = 8 + rand() * 26;
  const a = 0.24 * (1 - t * 0.55);
  thickLine(cx - len / 2, y, cx + len / 2, y, 3, [255, 166, 88], a);
}

// ---- bezier helpers ----
function cubic(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
function quad(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}

// ---- the wave: one colossal curl, smooth bezier silhouette ----
// face: bottom-left rising convex to the crest
const FACE = cubic([0, 1024], [40, 720], [240, 500], [600, 255], 48);
// lip: crest sweeping right and curling down
const LIP_TOP = quad([600, 255], [730, 232], [758, 330], 20);
const LIP_UNDER = quad([758, 330], [722, 420], [625, 445], 16);
// inner face: back down to the sea at bottom-right
const INNER = quad([625, 445], [600, 700], [720, 1024], 24);
const WAVE_PTS = [...FACE, ...LIP_TOP, ...LIP_UNDER, ...INNER];
const WAVE_GRAD = [[0, [118, 224, 208]], [0.28, [34, 158, 168]], [0.6, [12, 96, 116]], [1, [4, 34, 56]]];
fillPoly(WAVE_PTS, (y) => gradAt(WAVE_GRAD, (y - 235) / (1024 - 235)));

// barrel opening: sky showing through the curl (ellipse at 668,372)
const BARREL = [];
for (let i = 0; i <= 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  BARREL.push([668 + Math.cos(a) * 54, 372 + Math.sin(a) * 40]);
}
fillPoly(BARREL, (y) => gradAt(SKY, y / HORIZON));
// foam rim on the top half of the barrel opening
const RIM = [];
for (let i = 0; i <= 14; i++) {
  const a = Math.PI + (i / 14) * Math.PI; // upper half
  RIM.push([668 + Math.cos(a) * 54, 372 + Math.sin(a) * 40]);
}
polyline(RIM, 5, [255, 255, 255], 0.9);

// wave face: glossy streaks following the curl
const streak = (dx, w, a) => {
  const pts = FACE.filter((_, i) => i % 2 === 0 && i > 6 && i < 44)
    .map(([x, y]) => [x + dx, y]);
  polyline(pts, w, [200, 242, 238], a);
};
streak(46, 7, 0.13);
streak(96, 5, 0.10);

// gentle dark shading low on the wave so the crest pops
for (let y = 920; y < H; y++) {
  for (let x = 0; x < 620; x++) {
    const t = (y - 920) / (H - 920);
    blendPx(x, y, 2, 20, 38, t * 0.16);
  }
}

// ---- foam lip along the crest ----
polyline(LIP_TOP, 7, [255, 255, 255], 0.95);
polyline(LIP_TOP.map(([x, y]) => [x - 8, y + 12]), 3, [255, 255, 255], 0.75);
// foam drips falling from the lip underside
for (let i = 0; i < 26; i++) {
  const t = rand();
  const x = 630 + t * 90 + (rand() - 0.5) * 10;
  const y = 440 + t * 55 + rand() * 24;
  fillCircle(x, y, 1 + rand() * 2.5, [240, 250, 250], 0.55 + rand() * 0.4);
}

// ---- spray bursting off the crest tip, up and right ----
for (let i = 0; i < 130; i++) {
  const a = -0.9 + rand() * 1.5;
  const d = 12 + Math.pow(rand(), 1.6) * 210;
  const x = 610 + Math.cos(a) * d + rand() * 8;
  const y = 250 + Math.sin(a) * d * 0.9 + d * d * 0.0011;
  const r = 0.8 + rand() * 2.6;
  blendPx(x, y, 255, 255, 255, 0.35 + rand() * 0.6);
  if (r > 2) fillCircle(x, y, r * 0.6, [255, 255, 255], 0.5);
}

// ---- birds bursting out of the spray, flying up-right ----
function bird(x, y, s) {
  const c = [18, 16, 42];
  thickLine(x, y, x - s, y - s * 0.85, 3, c, 0.92);
  thickLine(x, y, x + s, y - s * 0.7, 3, c, 0.92);
}
const FLOCK = [
  [700, 190, 16], [748, 168, 19], [800, 150, 15], [852, 138, 20],
  [905, 128, 14], [742, 210, 12], [812, 196, 13], [872, 178, 11],
  [668, 224, 11], [790, 226, 10], [940, 168, 12], [700, 250, 9],
  [845, 235, 9], [918, 205, 10], [776, 262, 8],
];
for (const [x, y, s] of FLOCK) bird(x, y, s);

// ---- the tiny red-sailed boat, riding the wave face ----
function boat(cx, cy, s) {
  // wake
  thickLine(cx - 46 * s, cy + 26 * s, cx - 8 * s, cy + 18 * s, 3, [255, 255, 255], 0.75);
  thickLine(cx - 34 * s, cy + 32 * s, cx - 4 * s, cy + 24 * s, 2, [255, 255, 255], 0.5);
  // hull
  fillPoly([
    [cx - 26 * s, cy + 14 * s], [cx + 26 * s, cy + 14 * s],
    [cx + 18 * s, cy + 28 * s], [cx - 18 * s, cy + 28 * s],
  ], () => [24, 16, 30]);
  // mast
  thickLine(cx, cy + 14 * s, cx, cy - 44 * s, 3, [24, 16, 30], 1);
  // red sail — the one hot accent on the whole wave
  fillPoly([[cx + 2 * s, cy - 42 * s], [cx + 2 * s, cy + 12 * s], [cx + 40 * s, cy + 12 * s]], () => [232, 46, 28]);
  // white jib
  fillPoly([[cx - 2 * s, cy - 42 * s], [cx - 2 * s, cy + 12 * s], [cx - 30 * s, cy + 12 * s]], () => [250, 244, 230]);
  // sailor dot
  fillCircle(cx + 6 * s, cy + 8 * s, 3, [255, 220, 180], 1);
}
boat(400, 560, 1.5);

// ---- foreground foam at the wave base ----
for (let i = 0; i < 60; i++) {
  const x = rand() * 640;
  const y = 950 + rand() * 70;
  fillCircle(x, y, 1 + rand() * 3, [235, 245, 245], 0.25 + rand() * 0.45);
}
polyline([[0, 982], [160, 972], [320, 984], [480, 970], [640, 982]], 3, [255, 255, 255], 0.22);

// ---- vignette: pull the eye to the wave + boat ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 520) / 620, dy = (y - 470) / 620;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.72) {
      const a = Math.min(0.22, (d - 0.72) * 0.55);
      blendPx(x, y, 4, 4, 18, a);
    }
  }
}

// ================= OUTPUT =================
const png = encodePNG();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(outDir, 'entry.png'), png);
writeFileSync(join(here, 'entry.png'), png);
const sha = createHash('sha256').update(png).digest('hex');
console.log(`entry.png ${png.length} bytes sha256=${sha} ${W}x${H}`);
