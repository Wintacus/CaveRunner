// Generates the app/home-screen icons: a glowing crystal on cave stone.
// Written with the same dependency-free PNG encoder as the tileset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, makeRng } from './png.mjs';

const TEAL = [63, 224, 200];
const ICE = [207, 233, 255];

function icon(size) {
  const r = new Raster(size, size);
  const rng = makeRng(4242);
  const c = size / 2;

  // Dark stone background with a little grain.
  r.rect(0, 0, size, size, [10, 14, 23]);
  for (let i = 0; i < size * size * 0.12; i++) {
    r.blend(Math.floor(rng() * size), Math.floor(rng() * size), [30, 38, 54], 0.3 + rng() * 0.4);
  }

  // Ambient glow behind the crystal.
  r.glow(c, c, size * 0.46, TEAL, 0.42);

  // Crystal: a diamond, brighter on its left face.
  const h = size * 0.34; // half-height
  const w = size * 0.19; // half-width
  for (let y = -h; y <= h; y++) {
    const t = Math.abs(y) / h;
    const half = Math.round(w * (1 - t) * (y < 0 ? 1 : 0.92));
    for (let dx = -half; dx <= half; dx++) {
      const lit = dx < 0 ? 0.95 : 0.62;
      r.blend(Math.round(c + dx), Math.round(c + y), dx < -half * 0.55 ? ICE : TEAL, lit);
    }
  }
  // Bright rim on the upper-left edge.
  for (let y = -h; y <= 0; y++) {
    const t = Math.abs(y) / h;
    const half = Math.round(w * (1 - t));
    r.blend(Math.round(c - half), Math.round(c + y), ICE, 1);
    r.blend(Math.round(c - half + 1), Math.round(c + y), ICE, 0.5);
  }
  r.glow(c, c - h * 0.3, size * 0.1, ICE, 0.5);

  return r.toPNG();
}

const outDir = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, icon(size));
  console.log(`icon   -> ${path.relative(process.cwd(), file)} (${size}x${size})`);
}
