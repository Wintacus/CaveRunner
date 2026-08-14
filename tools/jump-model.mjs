// Simulates the player's jump arc using the exact numbers the game runs on
// (src/config/tuning.js), so level validation can answer "is this gap actually
// clearable?" instead of guessing.
import {
  RUN_SPEED,
  JUMP_IMPULSE,
  HOLD_FORCE,
  HOLD_MAX_MS,
  GRAVITY_RISE,
  GRAVITY_FALL,
  MAX_FALL_SPEED
} from '../src/config/tuning.js';

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
