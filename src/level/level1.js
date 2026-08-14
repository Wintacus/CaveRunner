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
 * Pacing reference: the runner covers 300px/s = 9.375 tiles/s.
 *   Segment 1  x   0-168   ~18s   Entrance          -> checkpoint 1 @ 166
 *   Segment 2  x 168-393   ~24s   Bats              -> checkpoint 2 @ 376, power-up @ 386
 *   Segment 3  x 394-655   ~28s   Spiders + combo   -> checkpoint 3 @ 648
 *   Segment 4  x 656-828   ~18s   Finale            -> goal @ 828
 */

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
  { x: 123, w: 93, top: 14, kind: 'ground' }, // gap 119-122 (4) — long calm run, checkpoint 1

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
  // Segment 1 — two lone stalagmites, both on long flat runs with clear sightlines.
  { type: 'stalagmite', x: 62, y: 14 },
  { type: 'stalagmite', x: 140, y: 14 },

  // Segment 2 — one static obstacle only; bats are the new idea here.
  { type: 'stalagmite', x: 340, y: 14 },

  // Segment 3 — statics combined with both creature types.
  { type: 'stalagmite', x: 496, y: 14 },
  { type: 'spikes', x: 545, y: 14, w: 3 },
  { type: 'stalactite', x: 563, len: 5 }, // over the pit at 561-565: punishes over-jumping
  { type: 'stalagmite', x: 612, y: 12 },

  // Segment 4 — remix only.
  { type: 'stalagmite', x: 740, y: 12 },
  { type: 'spikes', x: 756, y: 14, w: 3 }
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
  { type: 'goal', x: 828, y: 14 }
];

// --- Crystals ---------------------------------------------------------------
// Authoring helpers: `trail` lays a run of pickups along a surface, `arc` traces the
// shape of a jump over a pit. Every position below is placed by hand.
const crystals = [];
const gem = (x, y) => crystals.push({ type: 'crystal', x, y });
const trail = (x0, x1, y, step = 3) => {
  for (let x = x0; x <= x1; x += step) gem(x, y);
};
const arc = (cx, y, count = 5, spread = 1.5, height = 2.4) => {
  const half = (count - 1) / 2;
  for (let i = -half; i <= half; i++) {
    const t = half === 0 ? 0 : i / half;
    gem(cx + i * spread, y - height * (1 - t * t));
  }
};

// Segment 1 — a trail at chest height to teach "jump = reward", then arcs over each pit.
trail(10, 20, 13);
arc(26, 13);
arc(50, 13);
trail(54, 60, 13, 3);
arc(72.5, 13, 5, 1.5, 3);
trail(78, 92, 13, 4);
arc(98.5, 12, 5, 0.9, 2.4);
trail(103, 116, 11, 3);
arc(120.5, 12, 5, 0.9, 2.4);
trail(126, 138, 13, 4);
trail(146, 162, 13, 4);

// Segment 2 — arcs over the gaps, plus a high trail under the bats' top position.
arc(217.5, 13, 5, 1.5, 3);
trail(222, 230, 13, 4);
trail(242, 262, 13, 5);
arc(264, 13, 5, 1.2, 3);
trail(269, 283, 11, 3);
arc(287.5, 12, 5, 0.9, 2.4);
trail(294, 318, 13, 4);
arc(322.5, 13, 5, 1.5, 3);
trail(327, 338, 13, 4);
trail(344, 364, 13, 5);
arc(367.5, 13, 5, 1.5, 3);
trail(392, 418, 13, 5);

// Segment 3 — sparser: attention belongs on the creatures here.
arc(422.5, 13, 5, 1.5, 3);
trail(428, 444, 13, 5);
arc(452, 13, 3, 1.2, 2);
trail(456, 470, 11, 4);
arc(475.5, 13, 5, 1.5, 3);
trail(482, 504, 13, 6);
arc(508.5, 12, 5, 0.9, 3);
trail(513, 529, 10, 4);
arc(533.5, 13, 5, 1.5, 3);
trail(538, 543, 13, 3);
gem(551, 13);
gem(556, 13);
arc(563, 11.5, 3, 1.5, 1.2); // threads the needle under the stalactite
trail(568, 588, 13, 5);
arc(593, 13, 5, 1.2, 3);
trail(598, 614, 11, 4);
arc(618.5, 12, 5, 1.5, 3);
trail(624, 646, 13, 5);
trail(654, 678, 13, 4);

// Segment 4 — dense reward line through the staircase, then a victory run.
arc(682, 13, 5, 1.2, 3);
trail(687, 699, 11, 3);
arc(702.5, 12, 5, 0.9, 2.4);
trail(707, 719, 10, 3);
arc(723, 11, 5, 0.9, 2.4);
trail(728, 741, 11, 3);
arc(745, 12.5, 5, 1.2, 3);
trail(750, 754, 13, 2);
trail(761, 774, 13, 3);
arc(778.5, 13, 5, 1.5, 3);
trail(783, 825, 13, 3);

export const ENTITIES = [...progression, ...hazards, ...creatures, ...crystals];

/** Segment boundaries, used by the validator's pacing report. */
export const SEGMENTS = [
  { name: 'Entrance', from: 0, to: 168 },
  { name: 'Bats', from: 168, to: 393 },
  { name: 'Spiders + combined', from: 393, to: 655 },
  { name: 'Finale', from: 655, to: 828 }
];
