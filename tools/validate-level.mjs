// Checks the hand-authored level against the real jump physics before it is
// compiled to a Tiled map. Catches "this gap is impossible" / "this stalagmite is
// floating in the air" mistakes that are otherwise only findable by playing.
import { PLATFORMS, ENTITIES, SEGMENTS, MAP_W, MAP_H, TILE, FLOOR_TOP, CEIL_BOTTOM } from '../src/level/level1.js';
import { reachForRise, apexHeight } from './jump-model.mjs';
import { RUN_SPEED, PLAYER_BODY_W, PLAYER_BODY_H } from '../src/config/tuning.js';

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

// Crystals sitting on top of a hazard would bait the player into a hit.
for (const e of ENTITIES) {
  if (e.type !== 'crystal') continue;
  for (const hx of hazardXs) {
    if (Math.abs(e.x - hx) < 0.9 && e.y > 11.5) {
      warnings.push(`crystal at (${e.x},${e.y}) overlaps a hazard at x=${hx}`);
      break;
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
