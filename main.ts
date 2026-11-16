// ai-excited-01 R3 — "BREAK FREE"
// A humpback whale breaches out of a dusk sea straight into a huge low sun,
// and the spray off its back bursts into a flock of birds.
// Pure Node stdlib: the image is drawn pixel by pixel into an RGB buffer
// and encoded as PNG by hand (zlib + CRC32, no dependencies, no network).
// Deterministic: one seeded PRNG drives every speckle, so both runs
// produce byte-identical output.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const HORIZON = 760;
const SUN_X = 600;
const SUN_Y = 470;
const SUN_R = 190;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs.
// ---------------------------------------------------------------------------
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
const rand = mulberry32(20261116);

// ---------------------------------------------------------------------------
// Pixel buffer + drawing helpers.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const buf = new Uint8Array(W * H * 3);

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function setPx(x: number, y: number, c: RGB, alpha = 1): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  const i = (yi * W + xi) * 3;
  if (alpha >= 1) {
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
  } else {
    buf[i] = clamp255(buf[i] * (1 - alpha) + c[0] * alpha);
    buf[i + 1] = clamp255(buf[i + 1] * (1 - alpha) + c[1] * alpha);
    buf[i + 2] = clamp255(buf[i + 2] * (1 - alpha) + c[2] * alpha);
  }
}

function addPx(x: number, y: number, c: RGB, amount: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  const i = (yi * W + xi) * 3;
  buf[i] = clamp255(buf[i] + c[0] * amount);
  buf[i + 1] = clamp255(buf[i + 1] + c[1] * amount);
  buf[i + 2] = clamp255(buf[i + 2] + c[2] * amount);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(x, y, c, alpha);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, c, alpha);
    }
  }
}

function drawLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thick: number,
  c: RGB,
  alpha = 1,
): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, c, alpha);
  }
}

function fillTriangle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  c: RGB,
  alpha = 1,
): void {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPx(x, y, c, alpha);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// ---------------------------------------------------------------------------
// 1. Dusk sky: deep indigo at the top, bruised purple, then burning orange.
// ---------------------------------------------------------------------------
const SKY_STOPS: Array<[number, RGB]> = [
  [0.0, [11, 16, 53]],
  [0.42, [59, 29, 94]],
  [0.72, [146, 43, 94]],
  [1.0, [255, 122, 61]],
];
function skyAt(y: number): RGB {
  const t = Math.min(1, Math.max(0, y / HORIZON));
  for (let s = 0; s < SKY_STOPS.length - 1; s++) {
    const [t0, c0] = SKY_STOPS[s];
    const [t1, c1] = SKY_STOPS[s + 1];
    if (t >= t0 && t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}
for (let y = 0; y < HORIZON; y++) {
  const c = skyAt(y);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
  }
}

// Warm halo around the sun, baked into the sky before the disc goes on.
for (let y = 0; y < HORIZON; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - SUN_X, y - SUN_Y);
    if (d < 340) {
      const g = Math.pow(1 - d / 340, 2);
      addPx(x, y, [255, 150, 60], g * 0.55);
    }
  }
}

// Stars in the dark upper sky.
for (let s = 0; s < 110; s++) {
  const x = rand() * W;
  const y = rand() * 400;
  const a = 0.25 + rand() * 0.65;
  const r = rand() < 0.12 ? 2 : 1;
  fillCircle(x, y, r, [255, 244, 214], a);
}

// ---------------------------------------------------------------------------
// 2. The sun: a huge low disc, pale gold core, hot rim.
// ---------------------------------------------------------------------------
fillCircle(SUN_X, SUN_Y, SUN_R, [255, 176, 92]);
fillCircle(SUN_X, SUN_Y, SUN_R - 22, [255, 214, 130]);
fillCircle(SUN_X, SUN_Y, SUN_R - 55, [255, 233, 168]);

// ---------------------------------------------------------------------------
// 3. The sea: dark teal, deepening with depth, sun glitter on the water.
// ---------------------------------------------------------------------------
for (let y = HORIZON; y < H; y++) {
  const depth = (y - HORIZON) / (H - HORIZON);
  const base: RGB = [
    Math.round(lerp(10, 3, depth)),
    Math.round(lerp(58, 26, depth)),
    Math.round(lerp(72, 38, depth)),
  ];
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    buf[i] = base[0];
    buf[i + 1] = base[1];
    buf[i + 2] = base[2];
  }
}
// Sun glitter: scattered gold sparkles in a column under the sun.
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
for (let y = HORIZON + 4; y < H; y++) {
  const depth = (y - HORIZON) / (H - HORIZON);
  for (let x = SUN_X - 110; x < SUN_X + 110; x++) {
    const fall = 1 - Math.abs(x - SUN_X) / 110;
    const h = hash2(x, y);
    if (h > 0.72) addPx(x, y, [255, 190, 90], (h - 0.72) * 2.4 * fall * (1 - depth));
  }
}
// Wave crests: long sine strokes, pale teal, breaking toward the viewer.
const WAVE_ROWS: Array<[number, number, number]> = [
  [788, 5, 0.0],
  [828, 7, 1.3],
  [876, 8, 2.6],
  [928, 9, 4.1],
  [984, 10, 5.4],
];
for (const [wy, amp, phase] of WAVE_ROWS) {
  for (let x = 0; x < W; x += 2) {
    const yy = wy + Math.sin(x * 0.014 + phase) * amp;
    setPx(x, yy, [120, 210, 205], 0.5);
    setPx(x, yy + 1, [120, 210, 205], 0.35);
    setPx(x + 1, yy, [120, 210, 205], 0.4);
  }
}

// ---------------------------------------------------------------------------
// 4. The whale: a breaching arc from the sea (tail) up to the sun (head).
//    Spine is a quadratic bezier; the body is a union of discs along it.
// ---------------------------------------------------------------------------
const WHALE: RGB = [13, 27, 46];
const WHALE_BELLY: RGB = [30, 56, 84];
const RIM: RGB = [255, 170, 80];

function bez(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}
const SPINE: [number, number, number, number, number, number] = [390, 845, 430, 540, 665, 315];
function spinePoint(t: number): [number, number] {
  return [bez(SPINE[0], SPINE[2], SPINE[4], t), bez(SPINE[1], SPINE[3], SPINE[5], t)];
}
function spineTangent(t: number): [number, number] {
  const dx = 2 * (1 - t) * (SPINE[2] - SPINE[0]) + 2 * t * (SPINE[4] - SPINE[2]);
  const dy = 2 * (1 - t) * (SPINE[3] - SPINE[1]) + 2 * t * (SPINE[5] - SPINE[3]);
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}
function bodyWidth(t: number): number {
  return 32 + 74 * Math.pow(Math.sin(Math.PI * (0.1 + 0.8 * t)), 1.1);
}

// Warm rim light on the sun side first, so the body covers all but a crescent.
for (let s = 0; s <= 100; s++) {
  const t = s / 100;
  const [px, py] = spinePoint(t);
  const dx = SUN_X - px;
  const dy = SUN_Y - py;
  const len = Math.hypot(dx, dy) || 1;
  fillCircle(px + (dx / len) * 7, py + (dy / len) * 7, bodyWidth(t), RIM, 0.95);
}
// The body itself, dark silhouette.
for (let s = 0; s <= 100; s++) {
  const t = s / 100;
  const [px, py] = spinePoint(t);
  fillCircle(px, py, bodyWidth(t), WHALE);
}
// Lighter underbelly on the shadow side, for a hint of volume.
for (let s = 0; s <= 100; s++) {
  const t = s / 100;
  const [px, py] = spinePoint(t);
  const [tx, ty] = spineTangent(t);
  // Shadow side is the normal pointing away from the sun.
  const nx = -ty;
  const ny = tx;
  const toSun = (SUN_X - px) * nx + (SUN_Y - py) * ny;
  const side = toSun > 0 ? -1 : 1;
  fillCircle(px + nx * side * bodyWidth(t) * 0.5, py + ny * side * bodyWidth(t) * 0.5, bodyWidth(t) * 0.5, WHALE_BELLY, 0.35);
}

// Head: the body already ends blunt and rounded; one lit eye near the tip.
const [hx, hy] = spinePoint(0.96);
fillCircle(hx + 14, hy - 12, 5, [255, 230, 170]);

// (No pectoral fin: at silhouette scale it read as a stray line, so it stays out.)

// Tail flukes fanning out where the body meets the sea.
const [tx0, ty0] = spinePoint(0.0);
fillTriangle(tx0, ty0, tx0 - 105, ty0 + 42, tx0 - 62, ty0 - 34, WHALE);
fillTriangle(tx0, ty0, tx0 + 96, ty0 + 55, tx0 + 68, ty0 - 26, WHALE);

// ---------------------------------------------------------------------------
// 5. The splash: white foam where the tail leaves the water, spray arcing up.
// ---------------------------------------------------------------------------
fillEllipse(tx0, ty0 + 6, 118, 17, [235, 250, 250], 0.6);
fillEllipse(tx0, ty0 + 2, 82, 11, [255, 255, 255], 0.7);
for (let s = 0; s < 150; s++) {
  const ang = rand() * Math.PI * 2;
  const rad = 60 + rand() * 130;
  const x = tx0 + Math.cos(ang) * rad * 1.4;
  const y = ty0 + Math.sin(ang) * rad * 0.55 - rand() * 40;
  const r = 1.5 + rand() * 4.5;
  const gold = rand() < 0.3;
  fillCircle(x, y, r, gold ? [255, 205, 130] : [245, 252, 252], 0.55 + rand() * 0.4);
}
// A tall spray plume thrown up behind the tail.
for (let s = 0; s < 60; s++) {
  const t = s / 60;
  const x = tx0 - 40 + t * 30 + (rand() - 0.5) * 46 * (1 - t * 0.5);
  const y = ty0 - t * 210 - rand() * 24;
  fillCircle(x, y, 2 + rand() * 4 * (1 - t), [240, 248, 250], 0.75);
}

// ---------------------------------------------------------------------------
// 6. The twist: the spray bursts into birds, streaming up into the sky.
// ---------------------------------------------------------------------------
function drawBird(x: number, y: number, s: number, c: RGB, alpha = 1): void {
  drawLine(x - s, y - s * 0.2, x, y + s * 0.45, 3.5, c, alpha);
  drawLine(x, y + s * 0.45, x + s, y - s * 0.2, 3.5, c, alpha);
}
for (let i = 0; i < 17; i++) {
  const t = i / 16;
  const bx = bez(430, 300, 165, t) + (rand() - 0.5) * 44;
  const by = bez(755, 520, 285, t) + (rand() - 0.5) * 30;
  const size = 20 - t * 11;
  drawBird(bx, by, size, [16, 24, 40], 0.95);
}
// Three stragglers catching the sun on the right.
drawBird(760, 330, 15, [20, 28, 46]);
drawBird(815, 285, 11, [20, 28, 46]);
drawBird(700, 240, 9, [20, 28, 46]);

// ---------------------------------------------------------------------------
// 7. The shout: BREAK FREE, big block letters across the top of the sky.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string[]> = {
  B: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  R: ["01110", "10001", "10001", "01110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
function drawText(text: string, x0: number, y0: number, scale: number, c: RGB, alpha = 1): void {
  let x = x0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) {
      x += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "1") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPx(x + col * scale + dx, y0 + row * scale + dy, c, alpha);
            }
          }
        }
      }
    }
    x += 6 * scale;
  }
}
const TITLE = "BREAK FREE";
const TITLE_SCALE = 8;
const titleW = TITLE.length * 6 * TITLE_SCALE - TITLE_SCALE;
const titleX = Math.round((W - titleW) / 2);
drawText(TITLE, titleX + 4, 70, TITLE_SCALE, [122, 45, 18]);
drawText(TITLE, titleX, 66, TITLE_SCALE, [255, 232, 163]);

// ---------------------------------------------------------------------------
// 8. PNG encode (color type 2, 8-bit) and write to $MAKEFUN_OUTPUT_DIR.
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG();
fs.writeFileSync(path.join(outDir, "entry.png"), png);
console.log(`wrote ${path.join(outDir, "entry.png")} (${png.length} bytes, ${W}x${H})`);
