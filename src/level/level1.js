/**
 * Level 1 — "Cave Entrance"
 *
 * The hand-authored source of truth for the level. `tools/build-level.mjs` turns this
 * into public/assets/levels/level1.tmj (a real Tiled map, openable and editable in
 * Tiled), which is what the game actually loads.
 *
 * Coordinates are in TILES. x grows right, y grows down.
 * Row layout:
 *    0-1   ceiling rock
 *    2-13  playable air
 *    14-17 bedrock floor (14 is the walkable surface)
 *
 * Pacing reference: the runner covers 330px/s = 10.3 tiles/s.
 *   Segment 1  x   0-168   ~16s   Entrance          -> checkpoint 1 @ 166
 *   Segment 2  x 168-393   ~22s   Bats              -> checkpoint 2 @ 376, power-up @ 386
 *   Segment 3  x 394-655   ~25s   Spiders + combo   -> checkpoint 3 @ 648
 *   Segment 4  x 656-812   ~15s   Finale            -> goal @ 812
 *
 * Obstacle placement is paced against `tools/pacing-report.mjs`: device testing found a
 * third of the run was spent watching rather than playing, concentrated in four stretches
 * of 4.5-7s. The calm beat immediately after each checkpoint is deliberate and protected —
 * that is where a player recovers after a respawn.
 */

import { arcPoints, holdForGap } from '../physics/jump-model.js';
import { PLAYER_BODY_W } from '../config/tuning.js';

export const TILE = 32;
export const MAP_W = 850;
export const MAP_H = 18;

/** Topmost solid row of the bedrock floor (the surface you run on). */
export const FLOOR_TOP = 14;
/** Ceiling occupies rows 0..CEIL_BOTTOM-1. */
export const CEIL_BOTTOM = 2;

export const SPAWN = { x: 5, y: FLOOR_TOP };

/**
 * Solid ground.
 *   kind 'ground' — bedrock, filled from `top` down to the bottom of the map.
 *   kind 'ledge'  — floating slab, 3 tiles thick.
 * Anything not covered by a run is a pit (falling in = a hit).
 */
export const PLATFORMS = [
  // ---- Segment 1: Entrance ------------------------------------------------
  // Wide, flat, forgiving. Gaps grow 3 -> 3 -> 4 -> 4. One stalagmite. No creatures.
  { x: 0, w: 25, top: 14, kind: 'ground' },
  { x: 28, w: 21, top: 14, kind: 'ground' }, // gap 25-27 (3)
  { x: 52, w: 19, top: 14, kind: 'ground' }, // gap 49-51 (3)
  { x: 75, w: 22, top: 14, kind: 'ground' }, // gap 71-74 (4)
  { x: 101, w: 18, top: 12, kind: 'ledge' }, // gap 97-100 (4), first step up
  { x: 123, w: 27, top: 14, kind: 'ground' }, // gap 119-122 (4)
  { x: 153, w: 63, top: 14, kind: 'ground' }, // gap 150-152 (3) — breaks up the run to checkpoint 1

  // ---- Segment 2: Bats ----------------------------------------------------
  // Terrain stays simple on purpose: the only new thing here is creature timing.
  { x: 220, w: 43, top: 14, kind: 'ground' }, // gap 216-219 (4)
  { x: 267, w: 19, top: 12, kind: 'ledge' }, // gap 263-266 (4)
  { x: 290, w: 31, top: 14, kind: 'ground' }, // gap 286-289 (4)
  { x: 325, w: 41, top: 14, kind: 'ground' }, // gap 321-324 (4)
  { x: 370, w: 51, top: 14, kind: 'ground' }, // gap 366-369 (4) — checkpoint 2 + power-up

  // ---- Segment 3: Spiders, then everything together -----------------------
  { x: 425, w: 26, top: 14, kind: 'ground' }, // gap 421-424 (4)
  { x: 454, w: 19, top: 12, kind: 'ledge' }, // gap 451-453 (3)
  { x: 478, w: 29, top: 14, kind: 'ground' }, // gap 473-477 (5)
  { x: 511, w: 20, top: 11, kind: 'ledge' }, // gap 507-510 (4), highest ledge so far
  { x: 536, w: 25, top: 14, kind: 'ground' }, // gap 531-535 (5)
  { x: 566, w: 25, top: 14, kind: 'ground' }, // gap 561-565 (5), stalactite overhead
  { x: 596, w: 20, top: 12, kind: 'ledge' }, // gap 591-595 (5)
  { x: 621, w: 60, top: 14, kind: 'ground' }, // gap 616-620 (5) — breathing room, checkpoint 3

  // ---- Segment 4: Finale --------------------------------------------------
  // A staircase of lit ledges strung over open pits: the most dramatic run in the
  // level, built only from things already taught.
  { x: 685, w: 16, top: 12, kind: 'ledge' }, // gap 681-684 (4)
  { x: 705, w: 16, top: 11, kind: 'ledge' }, // gap 701-704 (4)
  { x: 726, w: 17, top: 12, kind: 'ledge' }, // gap 721-725 (5)
  { x: 748, w: 28, top: 14, kind: 'ground' }, // gap 743-747 (5)
  { x: 781, w: 69, top: 14, kind: 'ground' } // gap 776-780 (5) — clear run to the goal
];

/**
 * Decorative background tiles (never collide): rock patches and glowing crystal veins
 * on the back wall. Purely visual depth behind the play space.
 */
export const DECOR = [
  { x: 8, y: 11, w: 3, h: 3, kind: 'rock' },
  { x: 34, y: 9, w: 2, h: 5, kind: 'vein' },
  { x: 60, y: 10, w: 4, h: 4, kind: 'rock' },
  { x: 88, y: 8, w: 2, h: 6, kind: 'vein' },
  { x: 130, y: 10, w: 5, h: 4, kind: 'rock' },
  { x: 158, y: 9, w: 2, h: 5, kind: 'vein' },
  { x: 196, y: 11, w: 4, h: 3, kind: 'rock' },
  { x: 232, y: 8, w: 2, h: 6, kind: 'vein' },
  { x: 274, y: 6, w: 3, h: 5, kind: 'rock' },
  { x: 300, y: 10, w: 4, h: 4, kind: 'rock' },
  { x: 344, y: 9, w: 2, h: 5, kind: 'vein' },
  { x: 398, y: 10, w: 5, h: 4, kind: 'rock' },
  { x: 432, y: 8, w: 2, h: 6, kind: 'vein' },
  { x: 486, y: 10, w: 4, h: 4, kind: 'rock' },
  { x: 520, y: 5, w: 2, h: 5, kind: 'vein' },
  { x: 548, y: 9, w: 4, h: 5, kind: 'rock' },
  { x: 578, y: 10, w: 3, h: 4, kind: 'rock' },
  { x: 632, y: 8, w: 2, h: 6, kind: 'vein' },
  { x: 660, y: 10, w: 5, h: 4, kind: 'rock' },
  { x: 692, y: 6, w: 2, h: 5, kind: 'vein' },
  { x: 736, y: 6, w: 2, h: 5, kind: 'vein' },
  { x: 760, y: 10, w: 4, h: 4, kind: 'rock' },
  { x: 800, y: 9, w: 3, h: 5, kind: 'rock' },
  { x: 818, y: 7, w: 2, h: 7, kind: 'vein' }
];

// ---------------------------------------------------------------------------
// Entities
//
// y semantics per type:
//   checkpoint / goal / stalagmite / spikes  -> y = the surface row they stand on
//   crystal / powerup                        -> y = centre row
//   bat                                      -> yTop / yBottom = centre row at each
//                                               extreme of its vertical sweep
//   stalactite                               -> hangs from the ceiling; `len` tiles long
//   spider                                   -> drops from the ceiling; `drop` = centre
//                                               row at full extension
// ---------------------------------------------------------------------------

const hazards = [
  // Segment 1 — lone stalagmites on long flat runs with clear sightlines. The last one
  // sits after checkpoint 1: the stretch from there to the first bat used to be 6.4s of
  // nothing to do.
  { type: 'stalagmite', x: 62, y: 14 },
  { type: 'stalagmite', x: 140, y: 14 },
  { type: 'stalagmite', x: 186, y: 14 },

  // Segment 2 — one static obstacle only; bats are the new idea here.
  { type: 'stalagmite', x: 340, y: 14 },

  // Segment 3 — statics combined with both creature types.
  { type: 'stalagmite', x: 496, y: 14 },
  { type: 'spikes', x: 545, y: 14, w: 3 },
  { type: 'stalactite', x: 563, len: 5 }, // over the pit at 561-565: punishes over-jumping
  { type: 'stalagmite', x: 606, y: 12 }, // kept clear of the pit lip at 616 (see below)
  { type: 'stalagmite', x: 638, y: 14 }, // fills the long approach to checkpoint 3

  // Segment 4 — remix only.
  // A stalagmite used to sit at 740, three tiles before the pit lip at 743. There is no
  // fair line through that: the shortest possible hop carries ~156px of airtime, so
  // hopping the spike lands you in the pit, and the only alternative is a frame-tight
  // early hop plus a buffered re-jump. The ledge has nowhere else to put it either — the
  // landing zone from the previous pit covers its left half, and the bat at 734 covers
  // the rest — so it is gone. The finale still remixes bats, a spider and spikes.
  { type: 'spikes', x: 756, y: 14, w: 3 },
  { type: 'spikes', x: 794, y: 14, w: 3 } // last beat before the run-in to the goal
];

const creatures = [
  // --- Bats (segment 2 onward) ---------------------------------------------
  // Slow, wide sweeps first; later ones are quicker and phase-offset against each other.
  // Low = jump over it, high = run underneath. Each one pauses and pulses at both
  // extremes before moving, so the pattern is readable a full beat ahead.
  { type: 'bat', x: 200, yTop: 9.5, yBottom: 13, period: 3000, phase: 0 },
  { type: 'bat', x: 232, yTop: 10, yBottom: 13, period: 2800, phase: 0.5 },
  { type: 'bat', x: 250, yTop: 9.5, yBottom: 13, period: 2800, phase: 0 },
  { type: 'bat', x: 276, yTop: 8, yBottom: 11, period: 2600, phase: 0.25 }, // over the ledge
  { type: 'bat', x: 300, yTop: 10, yBottom: 13, period: 2400, phase: 0 },
  { type: 'bat', x: 312, yTop: 10, yBottom: 13, period: 2400, phase: 0.5 }, // call-and-response pair
  { type: 'bat', x: 352, yTop: 9.5, yBottom: 13, period: 2200, phase: 0.15 },

  // --- Spiders (segment 3) --------------------------------------------------
  // Drop from the ceiling on a beat: wind-up shake -> fast drop -> hang -> retract.
  // Bridges the quiet stretch after checkpoint 2, far enough ahead of the first spider to
  // leave that creature its own clean teaching moment.
  { type: 'bat', x: 392, yTop: 9.5, yBottom: 13, period: 2600, phase: 0.3 },

  { type: 'spider', x: 408, drop: 13, period: 2800, phase: 0 }, // solo, flat ground: teaches the beat
  { type: 'spider', x: 436, drop: 13, period: 2600, phase: 0 },
  { type: 'spider', x: 446, drop: 13, period: 2600, phase: 0.5 },
  { type: 'spider', x: 462, drop: 11, period: 2400, phase: 0.2 }, // onto the ledge

  // --- Combined challenge ---------------------------------------------------
  { type: 'bat', x: 486, yTop: 9.5, yBottom: 13, period: 2400, phase: 0.3 },
  { type: 'spider', x: 519, drop: 10, period: 2400, phase: 0 },
  { type: 'bat', x: 526, yTop: 6.5, yBottom: 10, period: 2200, phase: 0.5 },
  { type: 'bat', x: 575, yTop: 10, yBottom: 13, period: 2200, phase: 0.1 },
  { type: 'spider', x: 585, drop: 13, period: 2200, phase: 0.45 },
  { type: 'spider', x: 604, drop: 11, period: 2400, phase: 0.2 },

  // --- Finale ---------------------------------------------------------------
  // After checkpoint 3, keeping the run into the finale honest.
  { type: 'spider', x: 660, drop: 13, period: 2400, phase: 0.4 },
  { type: 'bat', x: 672, yTop: 9.5, yBottom: 13, period: 2200, phase: 0.6 },

  { type: 'bat', x: 692, yTop: 8, yBottom: 11, period: 2200, phase: 0.2 },
  { type: 'spider', x: 712, drop: 10, period: 2200, phase: 0.35 },
  { type: 'bat', x: 734, yTop: 9, yBottom: 12, period: 2000, phase: 0.5 },
  { type: 'bat', x: 766, yTop: 10, yBottom: 13, period: 2000, phase: 0.15 }
];

const progression = [
  { type: 'checkpoint', x: 166, y: 14, index: 1 },
  { type: 'checkpoint', x: 376, y: 14, index: 2 },
  { type: 'powerup', x: 386, y: 12.8 }, // banked right before the hardest stretch
  { type: 'checkpoint', x: 648, y: 14, index: 3 },
  { type: 'goal', x: 812, y: 14 } // ~1.5s of clear run-in, was 5.5s
];

// --- Crystals ---------------------------------------------------------------
// Authoring helpers. `trail` lays a run of pickups along a surface; `pitArc` strings them
// along the jump the player will actually fly over a named pit.
//
// pitArc replaced a hand-drawn parabola. The old one anchored its ends at the take-off
// row, which put a gem at surface height a third of a tile past the lip — a spot the
// player can only occupy by *not* jumping. That reads as a reward and pays out as a fall.
// Sampling the real trajectory instead keeps every gem over a pit on a path the player
// can actually be on.
const crystals = [];
const gem = (x, y) => crystals.push({ type: 'crystal', x: +x.toFixed(2), y: +y.toFixed(2) });
const trail = (x0, x1, y, step = 3) => {
  for (let x = x0; x <= x1; x += step) gem(x, y);
};

/** Pits, derived from the platform runs: {start, end, takeoffRow, landingRow}. */
const PITS = (() => {
  const sorted = [...PLATFORMS].sort((a, b) => a.x - b.x);
  const pits = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const start = prev.x + prev.w;
    if (cur.x > start) pits.push({ start, end: cur.x - 1, takeoffRow: prev.top, landingRow: cur.top });
  }
  return pits;
})();

/**
 * Lay `count` crystals along the arc of the jump over the pit beginning at tile
 * `pitStart`. The hold defaults to the shortest one that clears the gap plus a little
 * slack, so the reward line teaches the jump the pit actually needs.
 *
 * `holdMs` can be forced where something overhead limits how high the player may go.
 */
const pitArc = (pitStart, count = 5, { holdMs, fromFrac, toFrac } = {}) => {
  const pit = PITS.find((p) => p.start === pitStart);
  if (!pit) throw new Error(`pitArc: no pit starts at tile ${pitStart}`);

  const gapPx = (pit.end - pit.start + 1) * TILE + PLAYER_BODY_W;
  const rise = (pit.takeoffRow - pit.landingRow) * TILE;
  const minHold = holdForGap(gapPx, rise);
  if (minHold === null) throw new Error(`pitArc: the pit at ${pitStart} is not clearable`);

  const hold = holdMs ?? Math.min(minHold + 40, 270);
  const lipX = pit.start * TILE;
  const takeoffY = pit.takeoffRow * TILE;

  for (const p of arcPoints(hold, count, { rise, fromFrac, toFrac })) {
    gem((lipX + p.x) / TILE, (takeoffY + p.y) / TILE);
  }
};

// Segment 1 — a trail at chest height to teach "jump = reward", then arcs over each pit.
trail(10, 20, 13);
pitArc(25);
pitArc(49);
trail(54, 60, 13, 3);
pitArc(71);
trail(78, 92, 13, 4);
pitArc(97);
trail(103, 116, 11, 3);
pitArc(119);
trail(126, 138, 13, 4);
trail(144, 148, 13, 2);
pitArc(150);
trail(156, 162, 13, 3);
trail(170, 182, 13, 4);
trail(191, 197, 13, 3); // clear of the stalagmite at 186

// Segment 2 — arcs over the gaps, plus a high trail under the bats' top position.
pitArc(216);
trail(222, 230, 13, 4);
trail(242, 262, 13, 5);
pitArc(263);
trail(269, 272, 11, 3);
trail(279, 283, 11, 4); // clear of the bat at 276
pitArc(286);
trail(294, 318, 13, 4);
pitArc(321);
trail(327, 338, 13, 4);
trail(344, 364, 13, 5);
pitArc(366);
trail(396, 418, 13, 5); // starts clear of the bat at 392

// Segment 3 — sparser: attention belongs on the creatures here.
pitArc(421);
trail(428, 444, 13, 5);
pitArc(451, 3);
trail(456, 470, 11, 4);
pitArc(473);
trail(482, 504, 13, 6);
pitArc(507);
trail(513, 521, 10, 4);
trail(529, 529, 10, 4); // clear of the bat at 526
pitArc(531);
trail(538, 543, 13, 3);
gem(551, 13);
gem(556, 13);
pitArc(561, 3, { holdMs: 90 }); // forced low: the stalactite tip hangs over this pit
trail(568, 588, 13, 5);
pitArc(591);
trail(598, 601, 11, 3);
trail(610, 614, 11, 4); // split around the stalagmite at 606 and the spider at 604
pitArc(616);
trail(624, 634, 13, 5); // stops short of the stalagmite at 638
trail(642, 656, 13, 4);
trail(664, 669, 13, 5); // clear of the spider at 660
trail(675, 678, 13, 3); // and of the bat at 672

// Segment 4 — dense reward line through the staircase, then a victory run.
pitArc(681);
trail(686, 690, 11, 4);
trail(695, 699, 11, 4); // clear of the bat at 692
pitArc(701);
trail(707, 710, 10, 3);
trail(715, 719, 10, 4); // clear of the spider at 712
pitArc(721);
trail(728, 731, 11, 3);
trail(737, 741, 11, 4); // clear of the bat at 734
pitArc(743);
trail(750, 754, 13, 2);
trail(760, 764, 13, 4);
trail(769, 774, 13, 3); // clear of the bat at 766
pitArc(776);
trail(783, 791, 13, 3);
trail(800, 810, 13, 3); // run-in to the goal at 812

export const ENTITIES = [...progression, ...hazards, ...creatures, ...crystals];

/** Segment boundaries, used by the validator's pacing report. */
export const SEGMENTS = [
  { name: 'Entrance', from: 0, to: 168 },
  { name: 'Bats', from: 168, to: 393 },
  { name: 'Spiders + combined', from: 393, to: 655 },
  { name: 'Finale', from: 655, to: 828 }
];
