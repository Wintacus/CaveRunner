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

/**
 * The underhangs: three painted layers, ALL drawn in front of the platform, stacked to bury
 * its bottom edge under rock.
 *
 * Every piece is roughly 40% platform face and 60% hang, and each has a ragged top that
 * fades out, so laid over the face it dissolves into it rather than ending anywhere. That
 * fade is the whole mechanism. The procedural version this replaces had a hard horizontal
 * cut with a tonal step at it, which just moved the straight line up the wall.
 *
 *   far   broad masses, softest, does the covering
 *   mid   knobs and broken shelves, breaks the silhouette
 *   near  spurs and hanging points, darkest, sells the depth
 *
 * `step` is the fraction of a piece's width to advance by, so neighbours overlap and their
 * feathered sides cross-fade. `every` on the near layer is a pixel spacing instead: those
 * are accents, and a solid row of them would read as a fringe.
 */
const UNDERHANG_LAYERS = [
  { prefix: 'f', count: 12, depth: 3.0, over: 0.4, step: 0.72 },
  { prefix: 'm', count: 12, depth: 3.1, over: 0.4, step: 0.66 },
  { prefix: 'n', count: 16, depth: 3.2, over: 0.4, step: 1.9 }
];

/** Feature panels are inset a little so they read as set into the wall, not stuck on it. */
const FEATURE_INSET_PX = 10;

/**
 * Panels overlap by the width their side edges are feathered over (see the cut script).
 * Butted edge to edge instead, each panel's own dark border drew a hard vertical line down
 * the rock at every join — a grid, in art meant to read as one continuous wall.
 */
const OVERLAP_PX = 6;

/**
 * Growth keeps this far from any hazard's centre.
 *
 * The wall put glowing mushrooms along every lip, including right beside the spikes, and a
 * hazard has to be the most legible thing on its patch of ground. Brightening the hazard
 * rim fixes half of that; the other half is not putting decoration next to it in the first
 * place. 56px is the widest growth overlay's half-width plus the widest hazard's.
 */
const HAZARD_CLEAR_PX = 56;

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
 * Hide everything off screen, and keep doing it as the camera moves.
 *
 * Three layers of underhang over every platform put the dressing past 1500 display objects,
 * and Phaser walks its whole display list every frame whether an object is on screen or not.
 * An invisible one bails out immediately, so this turns most of that walk into a flag check.
 *
 * The objects are sorted by x once and tracked with two pointers, so a frame only touches
 * the handful entering or leaving the view rather than rescanning. Widths vary but none
 * exceeds ~250px, hence the 320px slack on the left edge: an object whose x has passed out
 * of view may still be drawing into it.
 */
function makeCuller(objects) {
  const items = objects
    .map((o) => ({ o, x: o.x }))
    .sort((a, b) => a.x - b.x);
  for (const it of items) it.o.visible = false;

  const SLACK = 320;
  let lo = 0;
  let hi = 0;

  return (left, right) => {
    while (hi < items.length && items[hi].x < right) items[hi++].o.visible = true;
    while (hi > 0 && items[hi - 1].x >= right) items[--hi].o.visible = false;
    while (lo < items.length && items[lo].x + SLACK < left) items[lo++].o.visible = false;
    // Only un-hide what is also inside the right edge. Without the `lo < hi` guard a jump
    // backwards — a respawn, or the camera being moved for a screenshot — walks this pointer
    // back over the whole level marking everything visible, because it has no idea the right
    // pointer already retreated past it.
    while (lo > 0 && items[lo - 1].x + SLACK >= left) {
      lo--;
      if (lo < hi) items[lo].o.visible = true;
    }
    if (lo > hi) lo = hi;
  };
}

/**
 * Dress every platform. Returns a cull function the scene calls each frame with the camera's
 * horizontal extent; the objects themselves live as long as the scene does.
 */
export function dressPlatforms(scene, map, layer, defs = []) {
  const made = [];
  if (!scene.textures.exists(KEYS.wallAtlas)) return made;

  const rng = new Phaser.Math.RandomDataGenerator(['cave-runner-platform-dressing']);
  const has = (k) => scene.textures.exists(k);
  const growthKey = (i) => ART_FILES[`growth${i}`].key;

  // Hazard centres in world pixels, sorted, so the growth walk can skip past them.
  const HAZARDS = new Set(['stalagmite', 'spike', 'bigspike', 'stalactite']);
  const hazardXs = defs.filter((d) => HAZARDS.has(d.type)).map((d) => d.x).sort((a, b) => a - b);
  const nearHazard = (x) => hazardXs.some((hx) => Math.abs(hx - x) < HAZARD_CLEAR_PX);

  const runs = findRuns(map, layer);

  const wallBag = bag(rng, WALL_COUNT);
  const featureBag = bag(rng, PANEL_COUNT);
  const underBags = UNDERHANG_LAYERS.map((l) => bag(rng, l.count));
  const atlas = scene.textures.get(KEYS.wallAtlas);
  const frameW = (name) => atlas.get(name).width;

  runs.forEach((run) => {
    const left = run.x * TILE;
    const width = run.w * TILE;
    const lip = run.top * TILE;
    // The painted face starts just under the MOSS, not under the whole lip tile. The moss is
    // only the top few pixels of a 32px tile, so starting a tile down left a band of the old
    // procedural slate showing between the two — the exact grey the art is here to cover.
    // The panels' own tops are faded out over 10px, and starting 5px down puts that fade
    // across the moss bleed rather than across bare slate, so there is no edge anywhere.
    const MOSS_PX = 5;
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
    // shelves. Inset a little from the top of the face so they read as set into the wall
    // rather than stuck on it; their own top edges are faded at cut time, so a fixed inset
    // draws no line.
    if (run.w >= FEATURE_MIN_TILES && faceH > FEATURE_INSET_PX + 8) {
      const count = Math.max(1, Math.floor(run.w / FEATURE_EVERY_TILES));
      for (let i = 0; i < count; i++) {
        const frame = `p${featureBag()}`;
        const fw = frameW(frame);
        const span = width - 2 * TILE;
        if (span <= fw) break;
        const at = left + TILE + (span - fw) * ((i + 0.5) / count);
        made.push(
          scene.add
            .image(at, faceTop + FEATURE_INSET_PX, KEYS.wallAtlas, frame)
            .setOrigin(0, 0)
            .setDepth(DEPTH_FACE + 0.5)
            .setCrop(0, 0, Math.min(fw, left + width - TILE - at), Math.max(8, faceH - FEATURE_INSET_PX))
        );
      }
    }

    // The underhangs. Three passes along the bottom edge, back to front, each piece hung
    // so its painted face-overlap lands on the platform and the rest falls below. Bedrock
    // runs to the bottom of the map where the camera is already clamped, so those fall
    // outside the view and cost nothing.
    const bottomY = (run.bottom + 1) * TILE;
    UNDERHANG_LAYERS.forEach((layer, li) => {
      let ux = left;
      while (ux < left + width) {
        const frame = `${layer.prefix}${underBags[li]()}`;
        if (!atlas.has(frame)) break;
        const f = atlas.get(frame);
        const w = Math.min(f.width, left + width - ux);
        // Vary how far each piece rides up the face. Every piece in a layer is the same
        // height, so a fixed fraction puts all their tops at one y — and even a painted
        // fade accumulates into a soft band when forty of them agree on where to start.
        // Safe to vary here in a way it was not for the wall panels: these tops are fades,
        // so moving them makes no new edge.
        const over = layer.over + rng.frac() * 0.14;
        made.push(
          scene.add
            .image(ux, bottomY - Math.round(f.height * over), KEYS.wallAtlas, frame)
            .setOrigin(0, 0)
            .setDepth(layer.depth)
            .setCrop(0, 0, w, f.height)
            // Flip only when the piece is whole. Crop is in texture space, so a flipped and
            // cropped sprite keeps the mirrored half of the crop and lands somewhere other
            // than where it was placed. Only the last piece of a run is ever cropped.
            .setFlipX(w === f.width && rng.frac() > 0.5)
        );
        ux += Math.max(12, f.width * layer.step);
      }
    });

    // Growth along the lip. Kept a tile clear of both ends: a mushroom cluster centred on
    // the last column of a run hangs half of itself over the pit beyond it.
    if (run.w < 3) return;
    let at = left + TILE + rng.frac() * TILE;
    const end = left + width - TILE;
    while (at < end) {
      const standing = rng.frac() > 0.42;
      const pool = standing ? STANDING : HANGING;
      const key = growthKey(pool[rng.between(0, pool.length - 1)]);
      if (has(key) && !nearHazard(at)) {
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

  return makeCuller(made);
}
