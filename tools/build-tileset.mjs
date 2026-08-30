// Generates public/assets/tilesets/cave_tiles.png — the gray-box cave tileset.
// 8 tiles, 32x32, laid out 4 columns x 2 rows.
//
// Tile ids (0-based; Tiled gid = id + 1):
//   0 ground_top      1 ground_fill
//   2 ceiling_bottom  3 ceiling_fill
//   4 ledge_top       5 ledge_fill
//   6 bg_rock         7 bg_vein     (both decorative / non-colliding)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, makeRng } from './png.mjs';

const TILE = 32;
const COLS = 4;
const ROWS = 2;

const STONE_DARK = [26, 31, 44];
const STONE_MID = [40, 47, 64];
const STONE_LIGHT = [58, 68, 90];
const TEAL = [63, 224, 200];
const VIOLET = [160, 108, 255];

const raster = new Raster(COLS * TILE, ROWS * TILE);

function tileOrigin(id) {
  return { ox: (id % COLS) * TILE, oy: Math.floor(id / COLS) * TILE };
}

/** Speckled stone body shared by every solid tile. */
function stone(id, base, seed) {
  const { ox, oy } = tileOrigin(id);
  const rng = makeRng(seed);
  raster.rect(ox, oy, TILE, TILE, base);
  for (let i = 0; i < 90; i++) {
    const x = ox + Math.floor(rng() * TILE);
    const y = oy + Math.floor(rng() * TILE);
    const light = rng() > 0.55;
    raster.blend(x, y, light ? STONE_LIGHT : STONE_DARK, 0.35 + rng() * 0.3);
  }
  // Chunky rock facets so the surface reads as stone rather than noise.
  for (let i = 0; i < 5; i++) {
    const w = 4 + Math.floor(rng() * 9);
    const h = 3 + Math.floor(rng() * 6);
    raster.rect(ox + Math.floor(rng() * (TILE - w)), oy + Math.floor(rng() * (TILE - h)), w, h, STONE_LIGHT, 0.12);
  }
  return { ox, oy, rng };
}

/** Glowing moss lip along one edge — the readable "this is a surface" cue. */
function mossEdge(ox, oy, rng, colour, { flip = false, bright = 1 } = {}) {
  const edgeY = flip ? oy + TILE - 1 : oy;
  const dir = flip ? -1 : 1;
  for (let x = 0; x < TILE; x++) {
    const thickness = 2 + Math.floor(rng() * 3);
    for (let t = 0; t < thickness; t++) {
      raster.blend(ox + x, edgeY + dir * t, colour, (0.85 - t * 0.22) * bright);
    }
  }
  // Occasional brighter tufts + bleed into the rock.
  for (let i = 0; i < 4; i++) {
    const x = ox + Math.floor(rng() * TILE);
    raster.glow(x, edgeY + dir * 2, 4 + rng() * 3, colour, 0.35 * bright);
  }
  for (let x = 0; x < TILE; x++) {
    for (let t = 3; t < 8; t++) raster.blend(ox + x, edgeY + dir * t, colour, 0.05 * (8 - t) * 0.25 * bright);
  }
}

// 0 — ground top
{
  const { ox, oy, rng } = stone(0, STONE_MID, 1001);
  mossEdge(ox, oy, rng, TEAL);
}
// 1 — ground fill
stone(1, STONE_DARK, 1002);

// 2 — ceiling bottom (moss on the underside, violet so up/down read differently)
{
  const { ox, oy, rng } = stone(2, STONE_MID, 1003);
  mossEdge(ox, oy, rng, VIOLET, { flip: true, bright: 0.85 });
}
// 3 — ceiling fill
stone(3, STONE_DARK, 1004);

// 4 — ledge top (floating platform: brighter lip so it reads at a glance)
{
  const { ox, oy, rng } = stone(4, STONE_MID, 1005);
  mossEdge(ox, oy, rng, TEAL, { bright: 1.25 });
}
// 5 — ledge fill (vertical striation so a floating slab reads differently from bedrock)
{
  const { ox, oy, rng } = stone(5, STONE_DARK, 1006);
  for (let x = 2; x < TILE; x += 6) {
    for (let y = 0; y < TILE; y++) raster.blend(ox + x, oy + y, STONE_LIGHT, 0.16);
  }
}
// 6 — background rock (decorative)
// Transparent on purpose: an opaque [16,20,30] fill painted a gray rectangle onto the
// cave. Specks only, so the painted parallax shows through.
{
  const { ox, oy } = tileOrigin(6);
  const rng = makeRng(1007);
  for (let i = 0; i < 28; i++) {
    raster.blend(ox + Math.floor(rng() * TILE), oy + Math.floor(rng() * TILE), STONE_LIGHT, 0.18 + rng() * 0.2);
  }
}
// 7 — background crystal vein (decorative)
// Same trap as tile 6: the old opaque body + stacked diamond was the "gray vertical
// overlay with repeating light-blue diamonds" on the map. Glow only, no tile-shaped fill.
{
  const { ox, oy } = tileOrigin(7);
  // A soft vertical column of light. Constant x, so stacked tiles join seamlessly and it
  // reads as a seam of glowing crystal in the wall rather than a wire hanging in the air.
  for (let y = 0; y < TILE; y++) {
    for (let dx = -5; dx <= 5; dx++) {
      raster.blend(ox + 16 + dx, oy + y, TEAL, 0.22 * (1 - Math.abs(dx) / 6));
    }
  }
  // Crystal shards embedded along the seam.
  for (const [cy, size] of [[16, 5]]) {
    for (let dy = -size; dy <= size; dy++) {
      const half = Math.round((1 - Math.abs(dy) / (size + 1)) * size * 0.7);
      for (let dx = -half; dx <= half; dx++) {
        raster.blend(ox + 16 + dx, oy + cy + dy, TEAL, 0.55);
      }
    }
    raster.glow(ox + 16, oy + cy, size * 2.6, TEAL, 0.3);
  }
}

const outDir = path.resolve(fileURLToPath(new URL('../public/assets/tilesets', import.meta.url)));
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'cave_tiles.png');
fs.writeFileSync(outFile, raster.toPNG());
console.log(`tileset -> ${path.relative(process.cwd(), outFile)} (${COLS * TILE}x${ROWS * TILE})`);
