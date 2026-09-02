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
 * NO REPEAT AT ALL. The first version tiled one composed strip across each run, which is
 * cheap but repeats by construction — and a motif inside a repeating texture becomes a beat
 * the eye counts, which is exactly how it failed: the same painted mushrooms every 230px of
 * wall. The kit now has 39 distinct face panels, so the wall is simply built out of them
 * laid side by side, drawn from a shuffled bag so no panel comes round again until all of
 * them have. Nothing repeats on any screen the player can see at once.
 *
 * THE PANELS SHARE ONE TEXTURE. 340-odd panels across the level, each with its own texture,
 * would flush Phaser's sprite batch on nearly every one. They are packed into a single
 * atlas in textures.js, so the whole wall draws in one batch.
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

const WALL_COUNT = 39;
const PANEL_COUNT = 9;

/** How tall each panel's painted stone cap is, so features can be inset under it. */
const CAP_PX = 14;

/**
 * Panels overlap by the width their side edges are feathered over (see the cut script).
 * Butted edge to edge instead, each panel's own dark border drew a hard vertical line down
 * the rock at every join — a grid, in art meant to read as one continuous wall.
 */
const OVERLAP_PX = 6;

/** A run needs to be at least this wide before it earns a feature panel, and how often. */
const FEATURE_MIN_TILES = 10;
const FEATURE_EVERY_TILES = 18;

/**
 * A shuffled bag: every panel comes out once before any comes out twice.
 *
 * Picking uniformly at random instead produces visible pairs — the birthday problem makes a
 * repeat within a few draws far likelier than it feels like it should, and two identical
 * panels side by side is the one thing this whole approach exists to avoid.
 */
function bag(rng, n) {
  let pool = [];
  return () => {
    if (!pool.length) {
      pool = Array.from({ length: n }, (_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = rng.between(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.pop();
  };
}

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
  if (!scene.textures.exists(KEYS.wallAtlas)) return made;

  const rng = new Phaser.Math.RandomDataGenerator(['cave-runner-platform-dressing']);
  const has = (k) => scene.textures.exists(k);
  const growthKey = (i) => ART_FILES[`growth${i}`].key;

  const runs = findRuns(map, layer);

  const wallBag = bag(rng, WALL_COUNT);
  const featureBag = bag(rng, PANEL_COUNT);
  const atlas = scene.textures.get(KEYS.wallAtlas);
  const frameW = (name) => atlas.get(name).width;

  runs.forEach((run) => {
    const left = run.x * TILE;
    const width = run.w * TILE;
    const lip = run.top * TILE;
    // The painted face starts just under the MOSS, not under the whole lip tile. The moss
    // is only the top few pixels of a 32px tile, so starting a tile down left a band of the
    // old procedural slate showing between the two — the exact grey the art is here to
    // cover. Each panel's own painted cap then reads as a cornice below the moss.
    const MOSS_PX = 9;
    const faceTop = lip + MOSS_PX;
    const faceH = (run.bottom - run.top + 1) * TILE - MOSS_PX;
    if (faceH <= 0) return;

    // The wall: panels end to end until the run is covered. The last one is cropped rather
    // than left to hang over the edge into open air, and every panel is cropped vertically
    // too — bedrock gets three rows of face and a ledge two, and cropping shows both the
    // top of the same painting instead of squashing one to fit.
    let x = left;
    while (x < left + width) {
      const frame = `w${wallBag()}`;
      const full = frameW(frame);
      const w = Math.min(full, left + width - x);
      made.push(
        scene.add
          .image(x, faceTop, KEYS.wallAtlas, frame)
          .setOrigin(0, 0)
          .setDepth(DEPTH_FACE)
          .setCrop(0, 0, w, faceH)
      );
      x += Math.max(8, w - OVERLAP_PX);
    }

    // Feature panels inset into the wall on the long runs: light falls, blooms, mushroom
    // shelves. Drawn below the cornice so they sit inside the rock rather than cutting
    // across the lip the player reads edges by.
    if (run.w >= FEATURE_MIN_TILES && faceH > CAP_PX + 8) {
      const count = Math.max(1, Math.floor(run.w / FEATURE_EVERY_TILES));
      for (let i = 0; i < count; i++) {
        const frame = `p${featureBag()}`;
        const fw = frameW(frame);
        const span = width - 2 * TILE;
        if (span <= fw) break;
        const at = left + TILE + (span - fw) * ((i + 0.5) / count);
        made.push(
          scene.add
            .image(at, faceTop + CAP_PX, KEYS.wallAtlas, frame)
            .setOrigin(0, 0)
            .setDepth(DEPTH_FACE + 0.5)
            .setCrop(0, 0, Math.min(fw, left + width - TILE - at), faceH - CAP_PX)
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
