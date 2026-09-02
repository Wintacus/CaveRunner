import Phaser from 'phaser';
import { TILE } from '../config/tuning.js';
import { KEYS, ART_FILES } from '../gfx/textures.js';

/**
 * Paints the platforms with the hand-painted cave kit: a rock face over every run, growth
 * along the lips, and a feature face on the long ones.
 *
 * Why this exists at all: the tileset draws a convincing lip and then eight hundred tiles
 * of identical speckled slate under it. The face is the largest single surface on screen
 * and it was the only thing in the level with no art on it.
 *
 * Three rules shape everything below.
 *
 * ONE OBJECT PER RUN, NOT PER TILE. A TileSprite repeats its texture across whatever width
 * it is given, so a 62-tile run costs one game object instead of thirty-four. The price is
 * that it repeats, which is the trap the procedural version fell into: a single 32px tile
 * repeated across a screen holding 26 of them reads as wallpaper. The strips it repeats are
 * therefore four painted columns wide (~230px) and come in two different orderings, so
 * neighbouring runs do not line up.
 *
 * DERIVED FROM THE TILEMAP, NOT THE LEVEL SOURCE. `src/level/level1.js` is authoring input
 * compiled into a .tmj at build time and is deliberately not imported by anything that
 * runs. Reading the runs back off the tilemap keeps it that way, and means this cannot
 * drift out of step with the map the player is actually standing on.
 *
 * SEEDED, NOT RANDOM. Every placement comes from one fixed seed, so the level looks
 * identical on every run and on every device. A cave that rearranges itself between
 * attempts would be its own kind of bug, and it would make screenshots useless for
 * comparing changes.
 */

/** Depths sit between the ground layer (0) and the entities (6+), so nothing is hidden. */
const DEPTH_FACE = 1;
const DEPTH_GROWTH = 2;

/** Growth that grows UP from the lip, and growth that hangs DOWN off it. */
const STANDING = [0, 1, 2, 7, 8];
const HANGING = [3, 4, 5, 6];

/**
 * Feature faces: the three painted hero panels plus face variant 1, the one with the
 * mushroom cluster in it. That variant is deliberately not in the repeating strip — a motif
 * inside a tiling texture is a beat the eye counts, and this one read as the same mushrooms
 * every 230px of wall. Placed one at a time it does the opposite job.
 */
const FEATURES = ['hero0', 'hero1', 'hero2', 'face1'];

/** A run needs to be at least this wide before it earns a feature, and how often after. */
const FEATURE_MIN_TILES = 8;
const FEATURE_EVERY_TILES = 13;

/**
 * Platform runs, read off the ground layer.
 *
 * The ceiling lives in the same layer as the floor, so the scan starts below it: the first
 * solid tile at or under `ceilingRows` is a platform top. Columns sharing a top row and
 * touching each other are one run.
 */
function findRuns(map, layer, ceilingRows = 2) {
  const runs = [];
  let cur = null;

  for (let x = 0; x < map.width; x++) {
    let top = -1;
    for (let y = ceilingRows; y < map.height; y++) {
      const t = layer.getTileAt(x, y);
      if (t && t.index >= 0) {
        top = y;
        break;
      }
    }

    if (top === -1) {
      cur = null;
      continue;
    }

    let bottom = top;
    while (bottom + 1 < map.height) {
      const t = layer.getTileAt(x, bottom + 1);
      if (!t || t.index < 0) break;
      bottom++;
    }

    if (cur && cur.top === top && cur.x + cur.w === x) {
      cur.w++;
      cur.bottom = Math.max(cur.bottom, bottom);
    } else {
      cur = { x, w: 1, top, bottom };
      runs.push(cur);
    }
  }

  return runs;
}

/**
 * Dress every platform. Returns the created objects so the scene can dispose of them,
 * though in practice they live as long as the scene does.
 */
export function dressPlatforms(scene, map, layer) {
  const made = [];
  if (!scene.textures.exists(KEYS.faceStripA)) return made;

  const rng = new Phaser.Math.RandomDataGenerator(['cave-runner-platform-dressing']);
  const has = (k) => scene.textures.exists(k);
  const growthKey = (i) => ART_FILES[`growth${i}`].key;
  const featureKey = (i) => ART_FILES[FEATURES[i]].key;

  const runs = findRuns(map, layer);

  runs.forEach((run, index) => {
    const left = run.x * TILE;
    const width = run.w * TILE;
    const lip = run.top * TILE;
    // The painted face starts just under the MOSS, not under the whole lip tile. The moss
    // is only the top few pixels of a 32px tile, so starting a tile down left a band of the
    // old procedural slate showing between the two — the exact grey the art is here to
    // cover. It then runs to the bottom of the platform: three rows on bedrock, two on a
    // ledge. The strips are baked taller than either, and a TileSprite crops rather than
    // squashes, so both get the top of the same painting instead of a stretched copy.
    const MOSS_PX = 9;
    const faceTop = lip + MOSS_PX;
    const faceH = (run.bottom - run.top + 1) * TILE - MOSS_PX;
    if (faceH <= 0) return;

    made.push(
      scene.add
        .tileSprite(left, faceTop, width, faceH, index % 2 ? KEYS.faceStripB : KEYS.faceStripA)
        .setOrigin(0, 0)
        .setDepth(DEPTH_FACE)
    );

    // Feature faces, spaced out along the run and never within a tile of either end, where
    // half of one would hang past the platform into open air.
    if (run.w >= FEATURE_MIN_TILES) {
      const count = Math.max(1, Math.floor(run.w / FEATURE_EVERY_TILES));
      for (let i = 0; i < count; i++) {
        const key = featureKey(rng.between(0, FEATURES.length - 1));
        if (!has(key)) continue;
        const span = width - 2 * TILE;
        const at = left + TILE + span * ((i + 0.5) / count) + (rng.frac() - 0.5) * (span / count) * 0.5;
        made.push(
          scene.add.image(at, faceTop, key).setOrigin(0.5, 0).setDepth(DEPTH_FACE).setFlipX(rng.frac() > 0.5)
        );
      }
    }

    // Growth along the lip. Kept a tile clear of both ends: a mushroom cluster centred on
    // the last column of a run hangs half of itself over the pit beyond it.
    if (run.w < 3) return;
    let at = left + TILE + rng.frac() * TILE;
    const end = left + width - TILE;
    while (at < end) {
      const standing = rng.frac() > 0.42;
      const pool = standing ? STANDING : HANGING;
      const key = growthKey(pool[rng.between(0, pool.length - 1)]);
      if (has(key)) {
        made.push(
          scene.add
            .image(at, standing ? lip + 2 : lip + TILE - 1, key)
            .setOrigin(0.5, standing ? 1 : 0)
            .setDepth(DEPTH_GROWTH)
            .setFlipX(rng.frac() > 0.5)
        );
      }
      at += 72 + rng.frac() * 110;
    }
  });

  return made;
}
