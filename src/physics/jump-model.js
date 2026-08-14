// Simulates the player's jump arc using the exact numbers the game runs on
// (config/tuning.js).
//
// Two consumers:
//   - the level validator, to answer "is this gap actually clearable?"
//   - the level itself, to lay crystal trails along the arc the player will really fly,
//     instead of along a hand-guessed parabola that may hang gems where only a fall
//     can reach them.
import {
  RUN_SPEED,
  JUMP_IMPULSE,
  HOLD_FORCE,
  HOLD_MAX_MS,
  GRAVITY_RISE,
  GRAVITY_FALL,
  MAX_FALL_SPEED
} from '../config/tuning.js';

const STEP = 1 / 480;

/**
 * Trajectory of a jump, in pixels, relative to the take-off point.
 * @param {number} holdMs how long the player holds the jump button
 * @returns {{x:number,y:number,vy:number}[]} y is negative upward
 */
export function trajectory(holdMs = HOLD_MAX_MS) {
  const points = [];
  let x = 0;
  let y = 0;
  let vy = -JUMP_IMPULSE;
  let t = 0;
  const hold = Math.min(holdMs, HOLD_MAX_MS) / 1000;

  // Run until well past any plausible landing depth.
  while (t < 4 && y < 600) {
    const rising = vy < 0;
    let accel = rising ? GRAVITY_RISE : GRAVITY_FALL;
    if (rising && t < hold) accel -= HOLD_FORCE;
    vy = Math.min(vy + accel * STEP, MAX_FALL_SPEED);
    y += vy * STEP;
    x += RUN_SPEED * STEP;
    t += STEP;
    points.push({ x, y, vy });
  }
  return points;
}

/**
 * Furthest horizontal distance at which the player can still land on a surface
 * `rise` pixels above (positive) or below (negative) the take-off surface.
 */
export function reachForRise(rise, holdMs = HOLD_MAX_MS) {
  const targetY = -rise;
  // Landing is the *first* descending point that reaches the target height —
  // anything beyond that is the player falling past the ledge into the pit.
  for (const p of trajectory(holdMs)) {
    if (p.vy > 0 && p.y >= targetY) return p.x;
  }
  return 0;
}

/** Peak height of a full-hold jump. */
export function apexHeight(holdMs = HOLD_MAX_MS) {
  return -trajectory(holdMs).reduce((min, p) => Math.min(min, p.y), 0);
}

export { RUN_SPEED };

/**
 * Smallest hold (ms) that clears a gap of `gapPx`, landing on a surface `rise` pixels
 * above the take-off (negative = a drop), or null if even a full hold falls short.
 */
export function holdForGap(gapPx, rise = 0) {
  for (let hold = 60; hold <= HOLD_MAX_MS; hold += 5) {
    if (reachForRise(rise, hold) >= gapPx) return hold;
  }
  return null;
}

/**
 * Points along a jump, in PIXELS relative to the take-off point, sampled between two
 * fractions of the flight. The flight ends when the arc comes back down to `rise`.
 *
 * `fromFrac` deliberately defaults above zero: the very start of a jump is level with the
 * take-off surface, so a pickup placed there sits exactly at the lip of the pit and is
 * only reachable by *not* jumping — which is a trap, not a reward.
 */
export function arcPoints(holdMs, count, { rise = 0, fromFrac = 0.2, toFrac = 0.82 } = {}) {
  const path = trajectory(holdMs);
  const targetY = -rise;

  let landingIndex = path.length - 1;
  for (let i = 0; i < path.length; i++) {
    if (path[i].vy > 0 && path[i].y >= targetY) {
      landingIndex = i;
      break;
    }
  }

  const out = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? (fromFrac + toFrac) / 2 : fromFrac + ((toFrac - fromFrac) * i) / (count - 1);
    out.push(path[Math.min(landingIndex, Math.round(f * landingIndex))]);
  }
  return out.map((p) => ({ x: p.x, y: p.y }));
}
