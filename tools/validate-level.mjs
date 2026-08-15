// Checks the hand-authored level against the real jump physics before it is
// compiled to a Tiled map. Catches "this gap is impossible" / "this stalagmite is
// floating in the air" mistakes that are otherwise only findable by playing.
import { PLATFORMS, ENTITIES, SEGMENTS, MAP_W, MAP_H, TILE, FLOOR_TOP, CEIL_BOTTOM } from '../src/level/level1.js';
import { reachForRise, apexHeight, arcPoints, holdForGap } from '../src/physics/jump-model.js';
import {
  RUN_SPEED,
  PLAYER_BODY_W,
  PLAYER_BODY_H,
  GAME_WIDTH,
  ACTIVATION_MARGIN
} from '../src/config/tuning.js';

const errors = [];
const warnings = [];
const notes = [];

const sorted = [...PLATFORMS].sort((a, b) => a.x - b.x);

// --- platforms: ordering + overlap ------------------------------------------
for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const cur = sorted[i];
  if (cur.x < prev.x + prev.w) {
    errors.push(`platforms overlap: [${prev.x}..${prev.x + prev.w - 1}] and [${cur.x}..${cur.x + cur.w - 1}]`);
  }
  if (cur.top < CEIL_BOTTOM + 1 || cur.top > MAP_H - 1) {
    errors.push(`platform at x=${cur.x} has an out-of-range top row (${cur.top})`);
  }
}

// --- gaps: is every jump actually makeable? ---------------------------------
const FULL_APEX = apexHeight();
notes.push(`full-hold jump: ${FULL_APEX.toFixed(0)}px high (${(FULL_APEX / TILE).toFixed(1)} tiles), ` +
  `${reachForRise(0).toFixed(0)}px of flat reach (${(reachForRise(0) / TILE).toFixed(1)} tiles)`);

for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const cur = sorted[i];
  const gapTiles = cur.x - (prev.x + prev.w);
  if (gapTiles <= 0) continue;

  // Distance the body has to cover: the pit itself, plus the player's own width,
  // since take-off happens with the body still on the ledge.
  const needed = gapTiles * TILE + PLAYER_BODY_W;
  const rise = (prev.top - cur.top) * TILE; // positive = stepping up
  const reach = reachForRise(rise);
  const margin = (reach - needed) / reach;

  if (needed > reach) {
    errors.push(
      `pit at x=${prev.x + prev.w}..${cur.x - 1} (${gapTiles} tiles, rise ${rise}px) needs ` +
        `${needed.toFixed(0)}px but max reach is ${reach.toFixed(0)}px`
    );
  } else if (margin < 0.2) {
    warnings.push(
      `pit at x=${prev.x + prev.w} is tight: ${needed.toFixed(0)}px of ${reach.toFixed(0)}px reach ` +
        `(${(margin * 100).toFixed(0)}% margin)`
    );
  }
  if (rise > FULL_APEX * 0.75) {
    warnings.push(`step up at x=${cur.x} is ${rise}px, over 75% of max jump height`);
  }
}

// Pit spans, reused by the crystal checks below.
const pits = [];
for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const cur = sorted[i];
  const start = prev.x + prev.w;
  if (cur.x > start) pits.push({ start, end: cur.x - 1, takeoffRow: prev.top, landingRow: cur.top });
}

// --- solidity lookup ---------------------------------------------------------
const solidTop = new Map(); // tile x -> surface row
for (const p of sorted) for (let x = p.x; x < p.x + p.w; x++) solidTop.set(x, p.top);

const isSolid = (x, y) => {
  const top = solidTop.get(Math.round(x));
  if (top === undefined) return false;
  const p = sorted.find((pp) => Math.round(x) >= pp.x && Math.round(x) < pp.x + pp.w);
  const bottom = p.kind === 'ledge' ? p.top + 2 : MAP_H - 1;
  return y >= top && y <= bottom;
};

// --- entities ---------------------------------------------------------------
const grounded = new Set(['stalagmite', 'spikes', 'checkpoint', 'goal']);
const hazardXs = [];

for (const e of ENTITIES) {
  if (e.x < 0 || e.x > MAP_W - 1) errors.push(`${e.type} at x=${e.x} is outside the map`);

  if (grounded.has(e.type)) {
    const top = solidTop.get(Math.round(e.x));
    if (top === undefined) errors.push(`${e.type} at x=${e.x} is floating over a pit`);
    else if (top !== e.y) errors.push(`${e.type} at x=${e.x} sits at row ${e.y} but the surface there is row ${top}`);
  }

  if (e.type === 'sign') {
    if (isSolid(e.x, e.y)) errors.push(`sign "${e.text}" at (${e.x},${e.y}) is buried inside solid rock`);
    if (!e.text) errors.push(`sign at (${e.x},${e.y}) has no text`);
  }

  if (e.type === 'crystal' || e.type === 'powerup') {
    if (isSolid(e.x, e.y)) errors.push(`${e.type} at (${e.x},${e.y}) is buried inside solid rock`);
    if (e.y < CEIL_BOTTOM) errors.push(`${e.type} at (${e.x},${e.y}) is inside the ceiling`);
  }

  if (e.type === 'bat') {
    if (e.yTop < CEIL_BOTTOM + 0.5) errors.push(`bat at x=${e.x} sweeps into the ceiling`);
    if (e.yBottom > FLOOR_TOP - 0.5) errors.push(`bat at x=${e.x} sweeps into the floor`);
    if (e.yBottom - e.yTop < 1.5) warnings.push(`bat at x=${e.x} has a very small sweep, may read as static`);
    hazardXs.push(e.x);
  }

  if (e.type === 'spider') {
    if (e.drop > FLOOR_TOP - 0.5) errors.push(`spider at x=${e.x} drops into the floor`);
    hazardXs.push(e.x);
  }

  if (e.type === 'stalactite') {
    const tip = CEIL_BOTTOM + e.len;
    if (tip > FLOOR_TOP - 2) errors.push(`stalactite at x=${e.x} reaches row ${tip}, leaving no way past`);
    hazardXs.push(e.x);
  }

  if (e.type === 'stalagmite' || e.type === 'spikes') hazardXs.push(e.x);
}

// Crystals sitting on a hazard would bait the player into a hit. Compare vertical
// extents too: a gem *below* a stalactite is the intended threading-the-needle reward,
// not an overlap.
for (const e of ENTITIES) {
  if (e.type !== 'crystal') continue;
  for (const h of ENTITIES) {
    if (!['stalagmite', 'spikes', 'stalactite'].includes(h.type)) continue;
    if (Math.abs(e.x - h.x) >= 1) continue;
    const span =
      h.type === 'stalactite'
        ? [CEIL_BOTTOM, CEIL_BOTTOM + h.len] // hangs down from the ceiling
        : [h.y - 2, h.y]; // sits on the surface, roughly two tiles tall
    if (e.y > span[0] - 0.5 && e.y < span[1] + 0.5) {
      warnings.push(`crystal at (${e.x},${e.y}) overlaps a ${h.type} at x=${h.x}`);
      break;
    }
  }
}

// A crystal sitting in a creature's path is the same bait in motion: the player reaches
// for it exactly where the bat sweeps or the spider drops.
for (const e of ENTITIES) {
  if (e.type !== 'crystal') continue;
  for (const c of ENTITIES) {
    if (c.type !== 'bat' && c.type !== 'spider') continue;
    if (Math.abs(e.x - c.x) >= 1.2) continue;
    const band = c.type === 'bat' ? [c.yTop, c.yBottom] : [CEIL_BOTTOM, c.drop];
    if (e.y > band[0] - 0.6 && e.y < band[1] + 0.6) {
      warnings.push(`crystal at (${e.x},${e.y}) sits in the path of the ${c.type} at x=${c.x}`);
      break;
    }
  }
}

// --- crystals over pits ------------------------------------------------------
// A pickup hanging over a pit has to sit on a path the player can actually fly. The
// failure this guards against: a gem at take-off height just past the lip. It reads as a
// reward, but the only way to be at that height there is to not have jumped — so it pays
// out as a fall. Every over-pit gem must clear the take-off surface and lie near the
// trajectory of some hold that clears the gap.
const MIN_LIFT_PX = 24;
const ARC_TOLERANCE_PX = 48;

for (const pit of pits) {
  const gapPx = (pit.end - pit.start + 1) * TILE + PLAYER_BODY_W;
  const rise = (pit.takeoffRow - pit.landingRow) * TILE;
  const minHold = holdForGap(gapPx, rise);
  if (minHold === null) continue; // already reported as an impossible gap

  const lipX = pit.start * TILE;
  const takeoffY = pit.takeoffRow * TILE;

  for (const e of ENTITIES) {
    if (e.type !== 'crystal' && e.type !== 'powerup') continue;
    const px = e.x * TILE;
    if (px < lipX - TILE / 2 || px > (pit.end + 1) * TILE + TILE / 2) continue;

    const lift = takeoffY - e.y * TILE;
    if (lift < MIN_LIFT_PX) {
      errors.push(
        `${e.type} at (${e.x},${e.y}) hangs over the pit at ${pit.start}-${pit.end} only ` +
          `${lift.toFixed(0)}px above take-off height — reachable only by falling in`
      );
      continue;
    }

    // Is it near the arc of *some* hold that clears this pit?
    let best = Infinity;
    for (let hold = minHold; hold <= 270; hold += 10) {
      for (const p of arcPoints(hold, 40, { rise, fromFrac: 0, toFrac: 1 })) {
        if (Math.abs(lipX + p.x - px) > TILE / 2) continue;
        best = Math.min(best, Math.abs(takeoffY + p.y - e.y * TILE));
      }
    }
    if (best > ARC_TOLERANCE_PX) {
      warnings.push(
        `${e.type} at (${e.x},${e.y}) over the pit at ${pit.start}-${pit.end} is ` +
          `${best.toFixed(0)}px off any clearing jump arc`
      );
    }
  }
}

// --- creature reach ----------------------------------------------------------
// A bat at the bottom of its sweep, or a spider at full extension, has to actually
// intersect a runner standing on the surface below it — otherwise the "threat" is
// decorative and the player learns to ignore it.
const CREATURE_BODY_H = 20;

const surfaceUnder = (x) => {
  const top = solidTop.get(Math.round(x));
  return top === undefined ? null : top * TILE;
};

/**
 * Creatures that actually occupy the ground lane. These force a hop exactly the way a
 * stalagmite does, so the pit-lip spacing rule below has to consider them too.
 */
const groundBlockers = [];

for (const e of ENTITIES) {
  const lowRow = e.type === 'bat' ? e.yBottom : e.type === 'spider' ? e.drop : null;
  if (lowRow === null) continue;
  const surface = surfaceUnder(e.x);
  if (surface === null) {
    warnings.push(`${e.type} at x=${e.x} hangs over a pit — it can only be met mid-jump`);
    continue;
  }
  const playerTop = surface - PLAYER_BODY_H;
  const low = lowRow * TILE;
  const creatureTop = low - CREATURE_BODY_H / 2;
  const creatureBottom = low + CREATURE_BODY_H / 2;
  const overlap = Math.min(creatureBottom, surface) - Math.max(creatureTop, playerTop);
  if (overlap < 6) {
    errors.push(
      `${e.type} at x=${e.x} bottoms out at y=${low}px, which misses a runner standing at ` +
        `y=${playerTop}..${surface} (overlap ${overlap.toFixed(0)}px) — it would never be a threat`
    );
  } else {
    groundBlockers.push(e);
  }
}

// --- spiders that drop onto the player ---------------------------------------
// The runner's x position at any instant is fixed by the constant scroll speed, so the
// only way to answer a spider is vertically: run under it while it is up, or jump over it
// while it is down. A spider that is *mid-drop* during the moment the player crosses it
// answers both — running into it is a hit, and jumping rises into it — and no amount of
// telegraphing helps, because there is no input that changes where you are.
//
// The encounter is exactly computable: creatures wind their clock back by the journey the
// runner still has to make, so the cycle time at the crossing is the same from any wake
// distance and on any approach.
const SPIDER_WINDUP = 0.32;
const SPIDER_DROP = 0.1;
const SPIDER_HANG = 0.22;
const WAKE_LEAD_PX = GAME_WIDTH - 300 + ACTIVATION_MARGIN; // runner sits 300px from the left edge
const WAKE_LEAD_MS = (WAKE_LEAD_PX / RUN_SPEED) * 1000;
const SPIDER_BODY_W = 22;
const CROSS_MS = ((PLAYER_BODY_W + SPIDER_BODY_W) / RUN_SPEED) * 1000;

/**
 * Creatures wind their clock back by the journey the runner still has to make (see
 * `seedClock` in src/objects/entities.js), so the cycle time at the crossing is fixed:
 * `phase * period + APPROACH_MS`, from any wake distance and on any approach. That is what
 * makes one check here sufficient — before it, a respawn at a nearby checkpoint delivered
 * the player to a completely different point in the creature's cycle than the run-up did,
 * and a spider could be safely overhead one way and lying in the lane the other.
 */
/** The spider's centre y at cycle time `t` — the same motion the entity runs at play time. */
const spiderYAt = (t, e, restY) => {
  const drop = e.drop * TILE;
  const p = (((t % e.period) + e.period) / e.period) % 1;
  if (p < SPIDER_WINDUP) return restY;
  if (p < SPIDER_WINDUP + SPIDER_DROP) {
    const k = (p - SPIDER_WINDUP) / SPIDER_DROP;
    return restY + (drop - restY) * k * k;
  }
  if (p < SPIDER_WINDUP + SPIDER_DROP + SPIDER_HANG) return drop;
  const k = (p - SPIDER_WINDUP - SPIDER_DROP - SPIDER_HANG) / (1 - SPIDER_WINDUP - SPIDER_DROP - SPIDER_HANG);
  const eased = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k;
  return drop + (restY - drop) * eased;
};

const ARRIVAL_OFFSET_MS = WAKE_LEAD_MS;

for (const e of ENTITIES) {
  if (e.type !== 'spider') continue;
  const px = (e.x + 0.5) * TILE;
  const surface = surfaceUnder(e.x);
  if (surface === null) continue; // already reported by the creature-reach pass
  const restY = (e.hang ?? CEIL_BOTTOM) * TILE;
  const playerTop = surface - PLAYER_BODY_H;

  {
    const t0 = (e.phase || 0) * e.period + ARRIVAL_OFFSET_MS;

    // Sample the whole crossing. The player's x at any instant is fixed by the constant
    // scroll speed, so the only answers are vertical: stay on the ground and pass under,
    // or jump and pass over. Both require the spider to hold still about it — a spider
    // that changes state mid-crossing answers both at once, and no telegraph helps,
    // because there is no input that changes where the player is.
    let blocking = 0;
    let clear = 0;
    let highest = Infinity;
    for (let dt = -CROSS_MS / 2; dt <= CROSS_MS / 2; dt += 2) {
      const y = spiderYAt(t0 + dt, e, restY);
      const top = y - CREATURE_BODY_H / 2;
      const bottom = y + CREATURE_BODY_H / 2;
      if (bottom > playerTop && top < surface) blocking++;
      else clear++;
      highest = Math.min(highest, top);
    }

    if (blocking && clear) {
      errors.push(
        `spider at x=${e.x} moves in or out of the runner's lane while the player is crossing it — ` +
          `running into it is a hit and jumping rises into it, and the player cannot ` +
          `change where they are. Retime it (phase) so it has settled before the crossing.`
      );
    } else if (blocking) {
      // Committed to a jump: the player has to get above the spider's highest point for
      // the whole crossing.
      const needed = surface - highest + 2;
      if (needed > FULL_APEX) {
        errors.push(
          `spider at x=${e.x} blocks the lane and needs ${needed.toFixed(0)}px of clearance, ` +
            `more than a full jump (${FULL_APEX.toFixed(0)}px) — there is no way past it`
        );
      }
    }
  }
}

const MIN_HOP_PX = arcPoints(0, 2, { fromFrac: 0, toFrac: 1 })[1].x;
const SAFE_HAZARD_TO_LIP = MIN_HOP_PX + 48;
notes.push(`shortest possible hop: ${MIN_HOP_PX.toFixed(0)}px (${(MIN_HOP_PX / TILE).toFixed(1)} tiles)`);

// --- dangling spiders --------------------------------------------------------
// A spider that rests below the ceiling is a ceiling for the *player*: you pass under it
// on the ground and you may not jump through it. That is a good beat, and an unfair one
// the moment the player is obliged to jump anyway, so each one has to be checked against
// every reason this level has for leaving the ground.
for (const e of ENTITIES) {
  if (e.type !== 'spider' || e.hang === undefined) continue;
  const px = (e.x + 0.5) * TILE;
  const surface = surfaceUnder(e.x);
  if (surface === null) {
    errors.push(`dangling spider at x=${e.x} hangs over a pit — it can only be met mid-jump`);
    continue;
  }

  const belly = e.hang * TILE + CREATURE_BODY_H / 2;
  const headroom = surface - PLAYER_BODY_H - belly;
  if (headroom < 8) {
    errors.push(
      `dangling spider at x=${e.x} hangs at y=${belly}px with only ${headroom}px above a runner's ` +
        `head — there is no duck in this game, so it is an unavoidable wall`
    );
  }

  // Worth having at all: it must sit inside the jump envelope, or it is scenery.
  const jumpClearance = surface - PLAYER_BODY_H - belly;
  if (jumpClearance > FULL_APEX) {
    warnings.push(
      `dangling spider at x=${e.x} hangs above the top of a full jump (${jumpClearance}px of ` +
        `${FULL_APEX.toFixed(0)}px) — it never constrains the player`
    );
  }

  // Not in the flight path of a jump the player has no choice about.
  for (const pit of pits) {
    const from = pit.start * TILE - TILE;
    const to = (pit.end + 1) * TILE + PLAYER_BODY_W + TILE;
    if (px >= from && px <= to) {
      errors.push(
        `dangling spider at x=${e.x} sits in the flight path of the pit at ${pit.start}-${pit.end} ` +
          `— the player must be airborne there and cannot pass under it`
      );
    }
  }

  // Not within a hop of a ground hazard either: hopping that hazard flies into it.
  for (const h of ENTITIES) {
    if (h.type !== 'stalagmite' && h.type !== 'spikes') continue;
    if (Math.abs((h.x + 0.5) * TILE - px) < MIN_HOP_PX) {
      errors.push(
        `dangling spider at x=${e.x} is within one hop of the ${h.type} at x=${h.x} — clearing the ` +
          `${h.type} puts the player straight into it`
      );
    }
  }
}

// --- hazards before pit lips -------------------------------------------------
// Hopping a ground hazard commits the player to a fixed arc. The shortest jump the
// controls can produce still carries ~150px of airtime, so a hazard sitting closer than
// that to the next pit lip means the hop itself lands in the pit, leaving only a
// frame-tight early hop plus a buffered re-jump. That is not a readable challenge.

const pitStarts = pits.map((p) => p.start);
const hoppables = [
  ...ENTITIES.filter((e) => e.type === 'stalagmite' || e.type === 'spikes'),
  ...groundBlockers
].sort((a, b) => a.x - b.x);

for (const e of hoppables) {
  const lip = pitStarts.find((x) => x > e.x);
  if (lip === undefined) continue;
  const gapPx = (lip - e.x) * TILE;
  if (gapPx < MIN_HOP_PX) {
    errors.push(
      `${e.type} at x=${e.x} is ${gapPx.toFixed(0)}px before the pit lip at ${lip}, closer than the ` +
        `shortest hop (${MIN_HOP_PX.toFixed(0)}px) — hopping it lands the player in the pit`
    );
  } else if (gapPx < SAFE_HAZARD_TO_LIP) {
    warnings.push(
      `${e.type} at x=${e.x} is only ${gapPx.toFixed(0)}px before the pit lip at ${lip} ` +
        `(want ${SAFE_HAZARD_TO_LIP.toFixed(0)}px for a hop plus a re-jump)`
    );
  }
}

// --- checkpoints / progression ----------------------------------------------
const checkpoints = ENTITIES.filter((e) => e.type === 'checkpoint').sort((a, b) => a.x - b.x);
if (checkpoints.length !== 3) errors.push(`expected 3 checkpoints, found ${checkpoints.length}`);
if (ENTITIES.filter((e) => e.type === 'powerup').length !== 1) errors.push('expected exactly 1 power-up');
if (ENTITIES.filter((e) => e.type === 'goal').length !== 1) errors.push('expected exactly 1 goal marker');
for (const cp of checkpoints) {
  const nearHazard = hazardXs.some((hx) => Math.abs(hx - cp.x) < 6);
  if (nearHazard) warnings.push(`checkpoint at x=${cp.x} is within 6 tiles of a hazard`);
}

// --- pacing report -----------------------------------------------------------
const tilesPerSec = RUN_SPEED / TILE;
const goal = ENTITIES.find((e) => e.type === 'goal');
notes.push(`run speed: ${RUN_SPEED}px/s = ${tilesPerSec.toFixed(2)} tiles/s`);
for (const s of SEGMENTS) {
  notes.push(`  segment "${s.name}": ${((s.to - s.from) / tilesPerSec).toFixed(1)}s (x ${s.from}-${s.to})`);
}
notes.push(`  total (spawn -> goal): ${(goal.x / tilesPerSec).toFixed(1)}s`);
notes.push(
  `entities: ${ENTITIES.filter((e) => e.type === 'crystal').length} crystals, ` +
    `${ENTITIES.filter((e) => e.type === 'bat').length} bats, ` +
    `${ENTITIES.filter((e) => e.type === 'spider').length} spiders, ` +
    `${ENTITIES.filter((e) => ['stalagmite', 'stalactite', 'spikes'].includes(e.type)).length} static hazards`
);

export function validateLevel({ silent = false } = {}) {
  if (!silent) {
    notes.forEach((n) => console.log(`  ${n}`));
    warnings.forEach((w) => console.warn(`  warn: ${w}`));
    errors.forEach((e) => console.error(`  ERROR: ${e}`));
  }
  return { errors, warnings, notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors: e } = validateLevel();
  process.exit(e.length ? 1 : 0);
}
