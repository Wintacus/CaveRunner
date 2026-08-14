// Minimal dependency-free RGBA PNG encoder + a tiny raster canvas.
// Used to generate the gray-box tileset PNG so the Tiled map references a real
// image file (Tiled needs one to open the map; Phaser needs one to build the tileset).
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Tiny software raster target with alpha blending. */
export class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  blend(x, y, [r, g, b], a = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const dstA = d[i + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) return;
    d[i] = Math.round((r * a + d[i] * dstA * (1 - a)) / outA);
    d[i + 1] = Math.round((g * a + d[i + 1] * dstA * (1 - a)) / outA);
    d[i + 2] = Math.round((b * a + d[i + 2] * dstA * (1 - a)) / outA);
    d[i + 3] = Math.round(outA * 255);
  }

  rect(x, y, w, h, colour, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(x + i, y + j, colour, a);
  }

  /** Soft radial glow, used for the bioluminescent accents. */
  glow(cx, cy, radius, colour, strength = 1) {
    const r0 = Math.ceil(radius);
    for (let j = -r0; j <= r0; j++) {
      for (let i = -r0; i <= r0; i++) {
        const d = Math.hypot(i, j) / radius;
        if (d > 1) continue;
        this.blend(cx + i, cy + j, colour, (1 - d) * (1 - d) * strength);
      }
    }
  }

  toPNG() {
    return encodePNG(this.width, this.height, this.data);
  }
}

/** Deterministic PRNG so regenerating assets never produces a noisy diff. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
