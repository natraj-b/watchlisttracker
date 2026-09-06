// Generates the PWA / apple-touch icons as real PNGs with zero dependencies.
// A tiny hand-rolled PNG encoder (Node's zlib does the compression) draws a
// flat dark tile with the same upward "chart line" as the favicon glyph.
//
//   node scripts/gen-icons.mjs
//
// Output (committed as static assets, so the build needs no image tooling):
//   public/pwa-192.png            192  maskable:false
//   public/pwa-512.png            512  maskable:false
//   public/pwa-maskable-512.png   512  maskable:true  (content kept in safe zone)
//   public/apple-touch-icon.png   180  maskable:false

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/* ----------------------------- PNG encoder ----------------------------- */

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
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------- drawing ------------------------------- */

const BG = [0x0b, 0x0d, 0x10]; // matches --bg (dark) / theme-color
const LINE = [0x4f, 0x8c, 0xff]; // matches --accent (dark)

function render(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }

  const blend = (x, y, [r, g, b], a) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (Math.round(y) * size + Math.round(x)) * 4;
    const na = Math.min(1, a);
    const ia = 1 - na;
    buf[i] = r * na + buf[i] * ia;
    buf[i + 1] = g * na + buf[i + 1] * ia;
    buf[i + 2] = b * na + buf[i + 2] * ia;
    buf[i + 3] = 255;
  };

  const disc = (cx, cy, rad, colour) => {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rad + 0.75) blend(x, y, colour, Math.max(0, Math.min(1, rad + 0.75 - d)));
      }
    }
  };

  // Content stays inside a safe box; maskable icons need a bigger margin
  // because the launcher crops to a circle / squircle.
  const pad = size * (maskable ? 0.2 : 0.13);
  const inner = size - pad * 2;
  const at = (nx, ny) => [pad + nx * inner, pad + ny * inner];

  // Upward zig-zag "chart", normalised 0..1 inside the safe box.
  const pts = [
    [0.0, 0.74],
    [0.22, 0.54],
    [0.42, 0.63],
    [0.62, 0.30],
    [0.82, 0.44],
    [1.0, 0.12],
  ].map(([x, y]) => at(x, y));

  const thick = Math.max(2, size * 0.05);
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay] = pts[s];
    const [bx, by] = pts[s + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let t = 0; t <= steps; t++) {
      disc(ax + ((bx - ax) * t) / steps, ay + ((by - ay) * t) / steps, thick / 2, LINE);
    }
  }
  // Emphasise the vertices.
  for (const [x, y] of pts) disc(x, y, thick * 0.75, LINE);

  return encodePNG(size, buf);
}

/* -------------------------------- write ------------------------------- */

mkdirSync(PUBLIC, { recursive: true });
const files = [
  ["pwa-192.png", 192, { maskable: false }],
  ["pwa-512.png", 512, { maskable: false }],
  ["pwa-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: false }],
];
for (const [name, size, opts] of files) {
  writeFileSync(join(PUBLIC, name), render(size, opts));
  console.log("wrote public/" + name + "  (" + size + "×" + size + ")");
}
