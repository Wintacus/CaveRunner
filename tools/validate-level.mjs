// Checks the hand-authored level against the real jump physics before it is
// compiled to a Tiled map. Catches "this gap is impossible" / "this stalagmite is
// floating in the air" mistakes that are otherwise only findable by playing.
import { PLATFORMS, ENTITIES, SEGMENTS, MAP_W, MAP_H, TILE, FLOOR_TOP, CEIL_BOTTOM } from '../src/level/level1.js';
import { reachForRise, apexHeight, arcPoints, holdForGap, trajectory } from '../src/physics/jump-model.js';
import { spiderY, batY } from '../src/physics/creature-motion.js';
import {
  RUN_SPEED,
  PLAYER_BODY_W,
  PLAYER_BODY_H,
  GAME_WIDTH,
  ACTIVATION_MARGIN,
  SPIDER_WINDUP,
  SPIDER_DROP
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
/**
 * Hazard geometry, declared before anything uses it.
 *
 * `HAZARD_RISE` is body height above the surface in pixels, matching entities.js: a
 * stalagmite's 40px body sits 26px down a 68px sprite drawn from its base, so it stands
 * ~42px proud; a small spike stands ~15px; a big spike 66px.
 */
const BIGSPIKE_BODY_W = 60;
const HAZARD_RISE = { stalagmite: 42, spikes: 15, bigspikes: 66 };

/**
 * How far a hazard reaches either side of its anchor, in tiles. A `bigspikes` group is
 * three 60px bodies on a 48px step, so its collidable span is 156px centred on x — wider
 * than any single-tile hazard, and the reason every rule below asks rather than assumes.
 */
/**
 * Collidable width in PIXELS. The tile version below rounds outward, which is right for
 * "which tiles must be solid ground" and wrong for "can a jump clear this" — rounding a
 * 156px group out to 6 tiles overstates it by 36px and reports a fair hazard as tight.
 */
function hazardSpanPx(e) {
  if (e.type === 'spikes') return (e.w || 1) * TILE;
  if (e.type === 'bigspikes') return ((e.count || 3) - 1) * (e.step || 48) + BIGSPIKE_BODY_W;
  return TILE;
}

function hazardTiles(e) {
  if (e.type === 'spikes') return { from: e.x, to: e.x + (e.w || 1) - 1 };
  if (e.type === 'bigspikes') {
    const count = e.count || 3;
    const step = e.step || 48;
    const halfPx = ((count - 1) * step + BIGSPIKE_BODY_W) / 2;
    return { from: Math.floor(e.x - halfPx / TILE), to: Math.ceil(e.x + halfPx / TILE) - 1 };
  }
  return { from: e.x, to: e.x };
}

const grounded = new Set(['stalagmite', 'spikes', 'bigspikes', 'checkpoint', 'goal']);
const hazardXs = [];

for (const e of ENTITIES) {
  if (e.x < 0 || e.x > MAP_W - 1) errors.push(`${e.type} at x=${e.x} is outside the map`);

  if (grounded.has(e.type)) {
    // Every tile of a run, not just its anchor. A four-wide spike run placed two tiles
    // before a lip has half of itself hanging over the pit, and checking only e.x would
    // wave that through.
    const reach = hazardTiles(e);
    for (let at = Math.round(reach.from); at <= Math.round(reach.to); at++) {
      const top = solidTop.get(at);
      if (top === undefined) errors.push(`${e.type} at x=${e.x} covers x=${at}, which is over a pit`);
      else if (top !== e.y) {
        errors.push(`${e.type} at x=${e.x} covers x=${at} at row ${e.y} but the surface there is row ${top}`);
      }
    }
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
    if (e.yBottom - e.yTop < 1.5) warnings.push(`bat at x=${e.x} has a very small sweep, may read as static`);
    hazardXs.push(e.x);
  }

  if (e.type === 'spider') {
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
  // ...and it must not reach *through* that surface. `FLOOR_TOP` is the wrong reference
  // for this: a creature over a ledge can sit well above row 14 and still be buried in the
  // slab it is flying over. Ledges are three tiles thick with open air underneath and
  // creatures draw above the tilemap, so the failure looks like the creature sinking below
  // the ground rather than clipping into it.
  if (creatureBottom > surface) {
    errors.push(
      `${e.type} at x=${e.x} reaches y=${creatureBottom}px, ${(creatureBottom - surface).toFixed(0)}px ` +
        `below the surface it is over (y=${surface}px) — it flies through the ground`
    );
  }

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
const WAKE_LEAD_PX = GAME_WIDTH - 300 + ACTIVATION_MARGIN; // runner sits 300px from the left edge
const WAKE_LEAD_MS = (WAKE_LEAD_PX / RUN_SPEED) * 1000;
const SPIDER_BODY_W = 22;
const CROSS_MS = ((PLAYER_BODY_W + SPIDER_BODY_W) / RUN_SPEED) * 1000;

/**
 * How long a spider must already be on the floor when the player arrives. At 370px/s this
 * is about 150px of run-up with the obstacle plainly in the way, on top of the fall itself
 * being visible before that.
 */
const SPIDER_SETTLE_MS = 400;

/**
 * Above this much daylight over the player's head, a spider is scenery: too high to
 * threaten, too high to make anyone hesitate. Below it the player still has to decide
 * whether to jump, which is the point of the creature being there at all.
 */
const IDLE_CLEARANCE_PX = 110;

/**
 * Creatures wind their clock back by the journey the runner still has to make (see
 * `seedClock` in src/objects/entities.js), so the cycle time at the crossing is fixed:
 * `phase * period + APPROACH_MS`, from any wake distance and on any approach. That is what
 * makes one check here sufficient — before it, a respawn at a nearby checkpoint delivered
 * the player to a completely different point in the creature's cycle than the run-up did,
 * and a spider could be safely overhead one way and lying in the lane the other.
 */
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
    let lowestBelly = -Infinity;
    for (let dt = -CROSS_MS / 2; dt <= CROSS_MS / 2; dt += 2) {
      const y = spiderY(t0 + dt, e.period, restY, e.drop * TILE);
      const top = y - CREATURE_BODY_H / 2;
      const bottom = y + CREATURE_BODY_H / 2;
      if (bottom > playerTop && top < surface) blocking++;
      else clear++;
      highest = Math.min(highest, top);
      lowestBelly = Math.max(lowestBelly, bottom);
    }

    // A spider parked near the ceiling as the player runs underneath asks nothing of them.
    // It is not unfair, so this is a warning rather than an error — but a creature the
    // player never has to answer is just scenery that costs a pooled object, and four of
    // the nine were sitting like this before anyone noticed.
    if (!blocking && playerTop - lowestBelly > IDLE_CLEARANCE_PX) {
      warnings.push(
        `spider at x=${e.x} passes ${(playerTop - lowestBelly).toFixed(0)}px over the player's head ` +
          `— out of reach and out of mind, so it asks nothing of them`
      );
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

      // ...and it has to have been there long enough to read. "Not mid-drop" is a weaker
      // promise than it sounds: a spider that landed 94ms before the crossing passes that
      // check and is still, in play, a spider arriving on the player's head. The obstacle
      // has to be standing in the way before the player is committed, or the only way to
      // learn it is to be hit by it once.
      const cycle = (((t0 % e.period) + e.period) % e.period);
      const settled = cycle - (SPIDER_WINDUP + SPIDER_DROP) * e.period;
      if (settled < SPIDER_SETTLE_MS) {
        errors.push(
          `spider at x=${e.x} lands only ${settled.toFixed(0)}ms before the player reaches it ` +
            `(want ${SPIDER_SETTLE_MS}ms) — it drops onto the player rather than standing in the way`
        );
      }
    }
  }
}

const MIN_HOP_PX = arcPoints(0, 2, { fromFrac: 0, toFrac: 1 })[1].x;
const SAFE_HAZARD_TO_LIP = MIN_HOP_PX + 48;
notes.push(`shortest possible hop: ${MIN_HOP_PX.toFixed(0)}px (${(MIN_HOP_PX / TILE).toFixed(1)} tiles)`);

// --- bats at the crossing ----------------------------------------------------
// Same question as the spiders, different motion. A bat sweeps slowly, so it is far less
// of an ambush, but "you always run underneath it" is the failure that actually happened:
// eleven of fifteen asked nothing of the player, and several of those cleared their head by
// almost nothing — one by a single pixel — which is not a near miss anyone designed.
const BAT_BODY_W = 26;
const BAT_CROSS_MS = ((PLAYER_BODY_W + BAT_BODY_W) / RUN_SPEED) * 1000;

/** Minimum daylight for a bat the player is meant to run under. Below this it is a graze. */
const BAT_MIN_CLEARANCE_PX = 20;

for (const e of ENTITIES) {
  if (e.type !== 'bat') continue;
  const surface = surfaceUnder(e.x);
  if (surface === null) continue; // reported by the creature-reach pass
  const playerTop = surface - PLAYER_BODY_H;
  const t0 = (e.phase || 0) * e.period + ARRIVAL_OFFSET_MS;

  let blocking = 0;
  let clear = 0;
  let highest = Infinity;
  let lowestBelly = -Infinity;
  for (let dt = -BAT_CROSS_MS / 2; dt <= BAT_CROSS_MS / 2; dt += 2) {
    const y = batY(t0 + dt, e.period, e.yTop * TILE, e.yBottom * TILE);
    const top = y - CREATURE_BODY_H / 2;
    const bottom = y + CREATURE_BODY_H / 2;
    if (bottom > playerTop && top < surface) blocking++;
    else clear++;
    highest = Math.min(highest, top);
    lowestBelly = Math.max(lowestBelly, bottom);
  }

  const gap = playerTop - lowestBelly;

  if (blocking && clear) {
    errors.push(
      `bat at x=${e.x} crosses into or out of the runner's lane while the player passes it — ` +
        `whether it connects is decided by a pixel rather than by anything the player did`
    );
  } else if (blocking) {
    const needed = surface - highest + 2;
    if (needed > FULL_APEX) {
      errors.push(
        `bat at x=${e.x} blocks the lane and needs ${needed.toFixed(0)}px of clearance, more than ` +
          `a full jump (${FULL_APEX.toFixed(0)}px) — there is no way past it`
      );
    }
  } else if (gap < BAT_MIN_CLEARANCE_PX) {
    errors.push(
      `bat at x=${e.x} passes ${gap.toFixed(0)}px over the player's head — too fine to be a ` +
        `designed near miss, and it reads as unfair on the run where it does connect`
    );
  } else if (gap > IDLE_CLEARANCE_PX) {
    warnings.push(
      `bat at x=${e.x} passes ${gap.toFixed(0)}px over the player's head — out of reach and out ` +
        `of mind, so it asks nothing of them`
    );
  }
}

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

// --- can a jump actually get over it? ----------------------------------------
/**
 * Body heights above the surface, in pixels, matching the Arcade bodies in entities.js.
 * A stalagmite's 40px body sits 26px down a 68px sprite drawn from its base, so it stands
 * ~42px proud; a spike's 15px body in a 30px sprite stands ~15px.
 *
 * This rule did not exist while every hazard was one tile wide, which is the only reason
 * its absence never showed. The moment runs widen or sit next to each other, "can the
 * player clear this" stops being obvious: the arc has to stay above the obstacle for its
 * whole length plus the player's own width, and a full-hold jump is only airborne so long.
 * An unclearable run is a wall the player is asked to walk into, and nothing here would
 * have said so.
 *
 * Hazards are checked as CLUSTERS, not individually. Two runs a tile apart cannot be taken
 * as two jumps — there is nowhere to land between them — so what matters is the span from
 * the first tip to the last, at the height of the tallest thing in it.
 */

/** The horizontal span of a full-hold jump that stays at least `rise` px off the ground. */
function spanAbove(rise) {
  const above = trajectory().filter((p) => -p.y >= rise);
  return above.length ? above[above.length - 1].x - above[0].x : 0;
}

const grounds = ENTITIES.filter((e) => HAZARD_RISE[e.type] !== undefined)
  .map((e) => ({ e, left: hazardTiles(e).from, right: hazardTiles(e).to }))
  .sort((a, b) => a.left - b.left);

const clusters = [];
for (const g of grounds) {
  const last = clusters[clusters.length - 1];
  // Landing between two hazards needs at least the shortest hop's worth of clear ground.
  if (last && (g.left - last.right) * TILE < MIN_HOP_PX) {
    last.right = Math.max(last.right, g.right);
    last.members.push(g.e);
  } else {
    clusters.push({ left: g.left, right: g.right, members: [g.e] });
  }
}

for (const c of clusters) {
  const rise = Math.max(...c.members.map((m) => HAZARD_RISE[m.type]));
  // Pixel extents, not tile-rounded ones: for a single hazard that is its own width, and
  // for a run of them it is first left edge to last right edge.
  const runPx = c.members.length === 1
    ? hazardSpanPx(c.members[0])
    : (c.right - c.left + 1) * TILE;
  const need = runPx + PLAYER_BODY_W;
  const span = spanAbove(rise + 4); // a little daylight over the tip
  const what = c.members.length > 1
    ? `${c.members.length} hazards from x=${c.left} to x=${c.right}`
    : `${c.members[0].type} at x=${c.left}`;
  if (span < need) {
    errors.push(
      `${what} spans ${runPx}px at ${rise}px tall, but a full-hold jump only stays above it ` +
        `for ${span.toFixed(0)}px — a runner needs ${need.toFixed(0)}px to clear it`
    );
  } else if (span < need + 40) {
    warnings.push(`${what} leaves only ${(span - need).toFixed(0)}px of margin on a full-hold jump`);
  }
}

// --- stalactites over pits ---------------------------------------------------
/**
 * A stalactite over a pit is a corridor: the player has to cross the gap while staying
 * under the tip. That is a deliberate and good beat — the one at 563 exists to punish
 * over-jumping — but it is only fair if the SHORTEST hold that crosses the gap fits
 * underneath. Otherwise the pit demands a jump and the ceiling forbids it.
 *
 * Take-off height is the part that is easy to get wrong by eye: the ceiling is flat, so a
 * pit launched from a raised ledge has far less headroom than one at floor level. Row 14
 * pits take a len of 7; row 11 ledges take 4.
 */
for (const e of ENTITIES) {
  if (e.type !== 'stalactite') continue;
  const pit = pits.find((p) => e.x >= p.start - 1 && e.x <= p.end + 1);
  if (!pit) continue;
  const rise = (pit.fromTop - pit.toTop) * TILE;
  const hold = holdForGap(pit.w * TILE, rise);
  if (hold === null) continue; // the gap itself is unmakeable; the gap rules report that
  const headY = pit.fromTop * TILE - (apexHeight(hold) + PLAYER_BODY_H);
  const tipY = (CEIL_BOTTOM + e.len) * TILE;
  const clearance = headY - tipY;
  if (clearance < 0) {
    errors.push(
      `stalactite at x=${e.x} (len ${e.len}) hangs to y=${tipY}px, but the shortest hold that ` +
        `crosses the pit at ${pit.start}-${pit.end} puts the runner's head at y=${headY.toFixed(0)}px — ` +
        `the pit demands a jump the ceiling forbids`
    );
  } else if (clearance < TILE) {
    warnings.push(
      `stalactite at x=${e.x} leaves only ${clearance.toFixed(0)}px between the tip and the head of ` +
        `the shortest hold that crosses its pit`
    );
  }
}

// --- hazards before pit lips -------------------------------------------------
// Hopping a ground hazard commits the player to a fixed arc. The shortest jump the
// controls can produce still carries ~150px of airtime, so a hazard sitting closer than
// that to the next pit lip means the hop itself lands in the pit, leaving only a
// frame-tight early hop plus a buffered re-jump. That is not a readable challenge.

const pitStarts = pits.map((p) => p.start);
const hoppables = [
  ...ENTITIES.filter((e) => HAZARD_RISE[e.type] !== undefined),
  ...groundBlockers
].sort((a, b) => a.x - b.x);

for (const e of hoppables) {
  // A spike run's far edge is what matters here, not where it starts. Measuring from the
  // left edge of a 4-tile run overstates the run-up to the next lip by three tiles.
  const right = hazardTiles(e).to;
  const lip = pitStarts.find((x) => x > right);
  if (lip === undefined) continue;
  const gapPx = (lip - right) * TILE;
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
if (!checkpoints.length) errors.push('expected at least one checkpoint');
if (ENTITIES.filter((e) => e.type === 'powerup').length !== 1) errors.push('expected exactly 1 power-up');
if (ENTITIES.filter((e) => e.type === 'goal').length !== 1) errors.push('expected exactly 1 goal marker');

/**
 * What a death costs, which is not the same as how far back it sends you.
 *
 * This used to assert "exactly 3 checkpoints" — a number that says nothing, and that
 * passed happily while the level's longest gap sat on top of its densest stretch: 16
 * hazards between checkpoints 2 and 3, 22.7s of replay for a death at the far end.
 *
 * The first version of this rule measured that replay time alone and called it unfair. It
 * was wrong, and a playtest is what said so. `director.rewindTo` un-takes every def at or
 * past the checkpoint except other checkpoints, so a power-up inside the gap is back on the
 * ground for every respawn — dying into checkpoint 2 re-arms the shield ten tiles later,
 * every time. That stretch opens by handing the player an extra hit, which is exactly what
 * pays for its length; splitting it as well left nothing at stake and had to be reverted.
 *
 * So the allowance depends on what respawning gives back. The bare cap is set above the
 * level's longest unprotected gap (16.1s, the gentle second segment) and below the 22.7s
 * that prompted all this, so a genuinely unmitigated long run still fails.
 */
const MAX_REPLAY_S = 20;
const MAX_REPLAY_WITH_PICKUP_S = 26;
const powerupXs = ENTITIES.filter((e) => e.type === 'powerup').map((e) => e.x);
const tps = RUN_SPEED / TILE;
for (const hx of hazardXs) {
  const prior = checkpoints.filter((cp) => cp.x <= hx).pop();
  const from = prior ? prior.x : 0;
  const replay = (hx - from) / tps;
  // Only a pickup the player re-collects on the way back counts: it has to sit at or after
  // the checkpoint (or `rewindTo` leaves it taken) and before the hazard.
  const rearmed = powerupXs.some((px) => px >= from && px < hx);
  const cap = rearmed ? MAX_REPLAY_WITH_PICKUP_S : MAX_REPLAY_S;
  if (replay > cap) {
    errors.push(
      `hazard at x=${hx} is ${replay.toFixed(1)}s past the last checkpoint (x=${from}) — ` +
        `dying there replays more than ${cap}s` +
        `${rearmed ? ' even with the power-up re-armed on the way back' : ' with nothing handed back'}` +
        '; the gap needs splitting'
    );
  }
}

// Clearance is measured *forward* only: `#respawn` calls `placeFeetAt(cp.x, cp.y)`, so the
// player restarts exactly on the checkpoint and runs away from anything behind it. A hazard
// two tiles back is scenery; two tiles ahead is a death with no time to read it.
for (const cp of checkpoints) {
  const ahead = hazardXs.filter((hx) => hx > cp.x && hx - cp.x < 6);
  if (ahead.length) {
    warnings.push(`checkpoint at x=${cp.x} has a hazard ${ahead[0] - cp.x} tiles ahead of it (want 6+)`);
  }
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
    `${ENTITIES.filter((e) => ['stalagmite', 'stalactite', 'spikes', 'bigspikes'].includes(e.type)).length} static hazards`
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
