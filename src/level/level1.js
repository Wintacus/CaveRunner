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
 * Pacing reference: the runner covers 370px/s = 11.6 tiles/s.
 *   Segment 1  x   0-168   ~15s   Entrance          -> checkpoint 1 @ 166
 *   Segment 2  x 168-393   ~20s   Bats              -> checkpoint 2 @ 376, power-up @ 386
 *   Segment 3  x 394-655   ~23s   Spiders + combo   -> checkpoint 3 @ 648
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
  // Wide, flat, forgiving. Gaps grow 4 -> 4 -> 5 -> 5. Stalagmites only. No creatures.
  { x: 0, w: 25, top: 14, kind: 'ground' },
  { x: 29, w: 20, top: 14, kind: 'ground' }, // gap 25-28 (4)
  { x: 53, w: 18, top: 14, kind: 'ground' }, // gap 49-52 (4)
  { x: 76, w: 21, top: 14, kind: 'ground' }, // gap 71-75 (5)
  { x: 102, w: 17, top: 12, kind: 'ledge' }, // gap 97-101 (5), first step up
  { x: 124, w: 26, top: 14, kind: 'ground' }, // gap 119-123 (5)
  { x: 154, w: 62, top: 14, kind: 'ground' }, // gap 150-153 (4) — breaks up the run to checkpoint 1

  // ---- Segment 2: Bats ----------------------------------------------------
  // Terrain stays simple on purpose: the only new thing here is creature timing.
  { x: 221, w: 42, top: 14, kind: 'ground' }, // gap 216-220 (5)
  { x: 268, w: 18, top: 12, kind: 'ledge' }, // gap 263-267 (5)
  { x: 291, w: 30, top: 14, kind: 'ground' }, // gap 286-290 (5)
  { x: 326, w: 40, top: 14, kind: 'ground' }, // gap 321-325 (5)
  { x: 371, w: 50, top: 14, kind: 'ground' }, // gap 366-370 (5) — checkpoint 2 + power-up

  // ---- Segment 3: Spiders, then everything together -----------------------
  { x: 426, w: 25, top: 14, kind: 'ground' }, // gap 421-425 (5)
  { x: 455, w: 18, top: 12, kind: 'ledge' }, // gap 451-454 (4)
  { x: 479, w: 28, top: 14, kind: 'ground' }, // gap 473-478 (6)
  { x: 512, w: 19, top: 11, kind: 'ledge' }, // gap 507-511 (5), highest ledge so far
  { x: 537, w: 24, top: 14, kind: 'ground' }, // gap 531-536 (6)
  { x: 566, w: 25, top: 14, kind: 'ground' }, // gap 561-565 (5), stalactite overhead
  { x: 597, w: 19, top: 12, kind: 'ledge' }, // gap 591-596 (6)
  { x: 622, w: 59, top: 14, kind: 'ground' }, // gap 616-621 (6) — breathing room, checkpoint 3

  // ---- Segment 4: Finale --------------------------------------------------
  // A staircase of lit ledges strung over open pits: the most dramatic run in the
  // level, built only from things already taught.
  { x: 686, w: 15, top: 12, kind: 'ledge' }, // gap 681-685 (5)
  { x: 706, w: 15, top: 11, kind: 'ledge' }, // gap 701-705 (5)
  { x: 727, w: 16, top: 12, kind: 'ledge' }, // gap 721-726 (6)
  { x: 749, w: 27, top: 14, kind: 'ground' }, // gap 743-748 (6)
  { x: 782, w: 68, top: 14, kind: 'ground' } // gap 776-781 (6) — clear run to the goal
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
  // Splits the last long flat run of the segment. At 370px/s the stretch from the pit at
  // 150 to the stalagmite at 186 was 3.1s of holding still — the longest lull left in the
  // level, and it landed in the first fifteen seconds where the player is deciding
  // whether the game is doing anything.
  { type: 'stalagmite', x: 172, y: 14 },
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
  // First dangling spider. Rests at row 9 instead of the ceiling, and phase 0.15 has it
  // still up when the player crosses it, so what gets taught here is the new idea: a
  // spider overhead occupies a band of air. Running under it is always safe; jumping into
  // that band is not. Row 9 is the forgiving version — measured against the real game, a
  // tap or a short hold clears it from any take-off point, and only the longer holds can
  // put the player into it. Wide flat ground with nothing forcing a jump, so learning it
  // costs nothing.
  { type: 'spider', x: 436, drop: 13, period: 2600, phase: 0.15, hang: 9 },
  { type: 'spider', x: 443, drop: 13, period: 2600, phase: 0.5 }, // 8 tiles clear of the lip at 451
  { type: 'spider', x: 462, drop: 11, period: 2400, phase: 0.2 }, // onto the ledge

  // --- Combined challenge ---------------------------------------------------
  { type: 'bat', x: 486, yTop: 9.5, yBottom: 13, period: 2400, phase: 0.3 },
  { type: 'spider', x: 519, drop: 10, period: 2400, phase: 0 },
  { type: 'bat', x: 523, yTop: 6.5, yBottom: 10, period: 2200, phase: 0.5 }, // 8 tiles clear of the lip at 531
  { type: 'bat', x: 575, yTop: 10, yBottom: 13, period: 2200, phase: 0.1 },
  // Same creature, opposite answer: phase 0.45 has it down on the floor when the player
  // arrives, so this one has to be jumped. That contrast is the whole point of the
  // dangle. 8 tiles clear of the lip at 591.
  { type: 'spider', x: 583, drop: 13, period: 2200, phase: 0.45, hang: 9 },
  { type: 'spider', x: 604, drop: 11, period: 2400, phase: 0.2 },

  // --- Finale ---------------------------------------------------------------
  // After checkpoint 3, keeping the run into the finale honest.
  // phase 0.5: fully down and still when the player arrives, so it is a jump-over rather
  // than a coin flip. At 0.4 it was mid-drop exactly as the player crossed it — the one
  // spider in the level with no answer. It also lands *retracting* on the respawn approach
  // from checkpoint 3, which keeps the recovery beat after a death clear.
  // Lowest of the three, at row 11, so the band it occupies starts barely above head
  // height: unlike the one at 436, even a bare tap runs into it from some take-off
  // points. Staying on the ground is still always safe, which is the only reason a gate
  // this tight is fair — and the platform runs 622-680 with nothing on it forcing a jump.
  //
  // Phase 0.20 also keeps it honest on both approaches: dangling on the run-up, and down
  // on the floor (a 44px hop) when respawning from checkpoint 3, which wakes it late.
  { type: 'spider', x: 660, drop: 13, period: 2400, phase: 0.2, hang: 11 },
  { type: 'bat', x: 672, yTop: 9.5, yBottom: 13, period: 2200, phase: 0.6 },

  { type: 'bat', x: 692, yTop: 8, yBottom: 11, period: 2200, phase: 0.2 },
  { type: 'spider', x: 712, drop: 10, period: 2200, phase: 0.35 },
  // yBottom is one row above the ledge it flies over (top 12), matching every other bat's
  // 22px of belly clearance. At 12 it bottomed out 10px inside the slab, and since ledges
  // are three tiles thick with open air below and creatures draw over the tilemap, it read
  // as the bat sinking through the floor.
  { type: 'bat', x: 734, yTop: 9, yBottom: 11, period: 2000, phase: 0.5 },
  { type: 'bat', x: 766, yTop: 10, yBottom: 13, period: 2000, phase: 0.15 }
];

/**
 * Instruction signs for the opening run — plain words in the world rather than a tutorial
 * pop-up, so they are read while playing instead of before it.
 *
 * Placement is derived from the jump model, not taste. A bare tap reaches 5.3 tiles flat,
 * which clears every pit in segment 1, so "tap" is all the player needs at first. The
 * step-up onto the ledge at 97-100 needs 148px of reach and a tap only delivers 132px at
 * that height — it is the first jump in the level a tap cannot make, so the hold lesson
 * lands just before it, at the moment it first matters.
 *
 * x avoids the decorative crystal vein at 88-89, which would sit behind the text.
 */
const signs = [
  { type: 'sign', x: 12, y: 10, text: 'TAP TO JUMP' },
  { type: 'sign', x: 82, y: 10, text: 'HOLD TO JUMP HIGHER' }
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
trail(428, 440, 13, 6); // threaded between the spiders at 436 and 443
pitArc(451, 3);
trail(456, 470, 11, 4);
pitArc(473);
trail(482, 504, 13, 6);
pitArc(507);
trail(513, 521, 10, 4);
trail(529, 529, 10, 4); // clear of the bat at 523
pitArc(531);
trail(538, 543, 13, 3);
gem(551, 13);
gem(556, 13);
pitArc(561, 3, { holdMs: 90 }); // forced low: the stalactite tip hangs over this pit
trail(568, 578, 13, 5); // threaded past the bat at 575
trail(586, 588, 13, 2); // split around the spider at 583
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

export const ENTITIES = [...progression, ...signs, ...hazards, ...creatures, ...crystals];

/** Segment boundaries, used by the validator's pacing report. */
export const SEGMENTS = [
  { name: 'Entrance', from: 0, to: 168 },
  { name: 'Bats', from: 168, to: 393 },
  { name: 'Spiders + combined', from: 393, to: 655 },
  { name: 'Finale', from: 655, to: 828 }
];
