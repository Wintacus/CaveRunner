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

/**
 * Rock palette, tinted to belong to the painted cavern behind it.
 *
 * These were near-neutral slate — [26,31,44] / [40,47,64] / [58,68,90], barely 25%
 * saturated. That was right when the background was procedural and equally muted, but the
 * painted backdrop is saturated cyan, and against it the floor read as a flat gray slab
 * with the pits cut out of it as hard-edged rectangles. Same hue family as the painting,
 * roughly double the saturation.
 *
 * Deliberately still dark. The floor has to stay well below the background in value or the
 * platform edges stop reading, and edge-reading is what the player jumps by — the teal moss
 * lip on the walkable surface is the cue, and it needs something dark to sit against.
 */
const STONE_DARK = [17, 29, 51];
const STONE_MID = [29, 51, 82];
const STONE_LIGHT = [47, 81, 122];
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

/**
 * Glowing moss lip along one edge — the readable "this is a surface" cue.
 *
 * This used to paint a fixed 2-4 rows at a fixed 0.85, plus a uniform bleed band under it.
 * Every column got the same treatment, so it came out as a bright bar with a ruled top and
 * a ruled bottom, running the length of the level. On a wall of hand-painted rock it was
 * the one obviously machine-drawn thing in frame, and the eye went straight to it.
 *
 * Now the mat has a depth and a brightness that both undulate, out of phase with each
 * other, so neither the bottom of the band nor its glow draws a line. The undulation is a
 * sum of integer harmonics of the TILE width, which matters: the tile repeats, so anything
 * that is not periodic over exactly 32px puts a step at every tile join and trades one
 * straight line for a row of them.
 */
function mossEdge(ox, oy, rng, colour, { flip = false, bright = 1 } = {}) {
  const edgeY = flip ? oy + TILE - 1 : oy;
  const dir = flip ? -1 : 1;
  // Phases from the tile's own rng, so the ground lip and the ledge lip do not undulate in
  // lock-step and a ledge above bedrock does not echo the shape below it.
  const ph = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);
  const wave = (x, amp) =>
    amp *
    (0.55 * Math.sin((2 * Math.PI * x) / TILE + ph[0]) +
      0.28 * Math.sin((4 * Math.PI * x) / TILE + ph[1]) +
      0.12 * Math.sin((6 * Math.PI * x) / TILE + ph[2]) +
      0.05 * Math.sin((10 * Math.PI * x) / TILE + ph[3]));

  for (let x = 0; x < TILE; x++) {
    // Both ends of the mat move. Only varying the depth left row 0 lit in every column,
    // which is a ruled line along the top of the level however ragged the underside is —
    // and it is the top edge the eye actually follows. So the mat also starts at a
    // different row per column: bare rock shows through at the surface in places, the way
    // moss actually grows on a ledge.
    // Mixed frequencies. A single fundamental moved the whole mat up and down together,
    // which came out as a neon squiggle rather than moss: one smooth curve, obviously
    // drawn. Adding a harmonic three times as fast — still an integer multiple of TILE, so
    // still seamless across the join — breaks the curve up. The top moves less than the
    // bottom, so what mostly varies is the mat's thickness, not its position.
    // Kept shallow and bright. A deep mat tints eight rows of rock and the lip stops
    // reading as a lip — it becomes a wide olive wash across the platform. It also has a
    // second job: the platform is dark and the cavern behind it is not, so the lip is what
    // stands between a very bright background and a very dark face. Dim it and that step
    // gets harder, not softer, which is the opposite of what all this is for.
    // Only a little. Pushing the mat 2-3 rows down left bare rock at the silhouette and
    // buried the glow behind it, which reads darker and *harder* than the ruled line it
    // replaced. Under a row of jitter is enough to stop the top scanning as drawn.
    // Clamped at zero rather than centred on a positive offset. Any constant offset, however
    // small, leaves the platform's topmost row bare in *every* column — one dark row along
    // the whole silhouette, which is both a ruled line and the loss of the glow. Clamping
    // means most columns still light up at row 0 and the rest step down behind them.
    const top = Math.max(0, -0.35 + wave(x + 3, 0.95) + wave(3 * x + 5, 0.7));
    const depth = 4.4 + wave(x + 11, 1.5) + wave(2 * x + 3, 0.9);
    // Floored well above zero: patchy is the point, but the lip is what the player reads a
    // jump from, and a column that goes dark is a hole in that cue.
    const lit = 0.86 + wave(x + 11, 0.14);
    for (let t = 0; t < 12; t++) {
      const q = (t - top) / depth;
      if (q < 0 || q >= 1) continue;
      // Fades in over its own first rows as well as out over its last, so the mat has
      // neither a first row nor a last row to line up with its neighbours.
      // Decays from the mat's own top, at full strength on that first row. An earlier
      // version faded in over the first row or two to avoid a hard start, which zeroed
      // row 0 by construction in every column — the fade-in *was* the dark line it was
      // meant to prevent. The raggedness has to come from which row the mat starts on,
      // not from softening the row it starts on.
      const f = Math.pow(1 - q, 1.5);
      raster.blend(ox + x, edgeY + dir * t, colour, Math.min(1, f * lit * bright));
    }
  }

  // Brighter tufts, at the depth the mat happens to have where they land.
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rng() * TILE);
    raster.glow(ox + x, edgeY + dir * (1 + Math.round(rng() * 3)), 4 + rng() * 3, colour, 0.35 * bright);
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
