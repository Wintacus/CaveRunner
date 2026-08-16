// Where a creature is at a given point in its cycle, using the exact numbers the game
// runs on (config/tuning.js).
//
// Two consumers, and the reason this file exists:
//   - the creature classes in objects/entities.js, which drive the sprites
//   - the level validator, which has to answer "what does the player actually meet here?"
//
// The validator used to carry its own copy of this maths, and the copies drifted: the game
// eased a spider's retract on a cosine curve while the validator used a quadratic one, so
// the two disagreed by up to 2.8% of the travel — about 10px on a full ceiling-to-floor
// climb. That is small enough to go unnoticed and large enough to matter, because the
// checks that decide whether a creature is fair are measured in tens of pixels. Same
// pattern as physics/jump-model.js: one definition, both callers.
//
// Deliberately free of Phaser imports so the validator can run it under plain node.
import { SPIDER_WINDUP, SPIDER_DROP, SPIDER_HANG, BAT_HOLD, BAT_MOVE } from '../config/tuning.js';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Cosine ease, in and out. The curve every creature travels on. */
export const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

const lerp = (a, b, t) => a + (b - a) * t;

/** Position within the cycle, 0..1. */
const cyclePhase = (t, period) => (((t % period) + period) % period) / period;

/**
 * Spider height at cycle time `t`.
 *
 * wind-up (still, at rest) -> accelerating drop -> hang -> eased retract.
 *
 * @param {number} t         cycle clock in ms
 * @param {number} period    cycle length in ms
 * @param {number} restY     where it waits between drops — the ceiling, or a `hang` row
 * @param {number} dropY     where it bottoms out
 */
export function spiderY(t, period, restY, dropY) {
  const p = cyclePhase(t, period);
  if (p < SPIDER_WINDUP) return restY;
  if (p < SPIDER_WINDUP + SPIDER_DROP) {
    // Accelerating: the fall is the telegraph, so it should read as gathering speed.
    const k = (p - SPIDER_WINDUP) / SPIDER_DROP;
    return lerp(restY, dropY, k * k);
  }
  if (p < SPIDER_WINDUP + SPIDER_DROP + SPIDER_HANG) return dropY;
  const k = (p - SPIDER_WINDUP - SPIDER_DROP - SPIDER_HANG) / (1 - SPIDER_WINDUP - SPIDER_DROP - SPIDER_HANG);
  return lerp(dropY, restY, easeInOut(k));
}

/**
 * How far into its wind-up a spider is at cycle time `t`, 0..1. Drives the shake and the
 * leg spread; the drop itself is the real tell, this is the promise of it.
 */
export function spiderWindup(t, period) {
  const p = cyclePhase(t, period);
  if (p >= SPIDER_WINDUP) return 0;
  return clamp01((p / SPIDER_WINDUP - 0.35) / 0.65);
}

/** True while the spider is anywhere below its rest position, or winding up to go there. */
export function spiderSpread(t, period) {
  const p = cyclePhase(t, period);
  if (p < SPIDER_WINDUP) return spiderWindup(t, period) > 0.15;
  return p < SPIDER_WINDUP + SPIDER_DROP + SPIDER_HANG;
}

/**
 * Bat height at cycle time `t`: parked at the top, eased sweep down, parked at the bottom,
 * eased sweep back up.
 */
export function batY(t, period, yTop, yBottom) {
  const p = cyclePhase(t, period);
  if (p < BAT_HOLD) return yTop;
  if (p < BAT_HOLD + BAT_MOVE) return lerp(yTop, yBottom, easeInOut((p - BAT_HOLD) / BAT_MOVE));
  if (p < BAT_HOLD * 2 + BAT_MOVE) return yBottom;
  return lerp(yBottom, yTop, easeInOut((p - BAT_HOLD * 2 - BAT_MOVE) / BAT_MOVE));
}

/**
 * The bat's tell: how far into the pause before it leaves an extreme, 0..1, plus which way
 * it is about to lean. Shape and motion rather than colour, so it survives colour-blindness.
 */
export function batTelegraph(t, period) {
  const p = cyclePhase(t, period);
  if (p < BAT_HOLD) {
    const telegraph = clamp01((p / BAT_HOLD - 0.5) * 2);
    return { telegraph, lean: telegraph }; // about to drop
  }
  if (p < BAT_HOLD + BAT_MOVE) return { telegraph: 0, lean: 1 };
  if (p < BAT_HOLD * 2 + BAT_MOVE) {
    const telegraph = clamp01(((p - BAT_HOLD - BAT_MOVE) / BAT_HOLD - 0.5) * 2);
    return { telegraph, lean: -telegraph }; // about to climb
  }
  return { telegraph: 0, lean: -1 };
}
