// Every number that defines how the game *feels* lives here, so tuning during a
// phone playtest is a one-file edit. Units: pixels, pixels/second, milliseconds.

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const TILE = 32;

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
/**
 * Constant auto-run speed. Fixed for this build — no ramping, no per-section variation.
 *
 * Raised from 300 after device testing: too much of the run was spent watching rather than
 * playing. Note that jump airtime is set by gravity alone, so horizontal reach scales with
 * this number — every pit gets easier as it goes up, which is why the pacing fix pairs a
 * modest speed bump with more obstacles rather than leaning on speed alone.
 */
export const RUN_SPEED = 330;

/**
 * Delta-time cap. Resuming from a backgrounded tab/app can hand us a multi-second
 * delta; without this clamp every timer and creature would teleport forward.
 * 50ms == a 20fps floor.
 */
export const MAX_DELTA_MS = 50;

// ---------------------------------------------------------------------------
// Jump — tap-and-hold, variable height, asymmetric gravity
// ---------------------------------------------------------------------------
/** Instant upward velocity on press-down. A bare tap gives ~82px of height. */
export const JUMP_IMPULSE = 560;
/** Extra upward acceleration applied while the touch is held. */
export const HOLD_FORCE = 1500;
/** Hold cap. Past this, the boost ends even if the finger stays down. */
export const HOLD_MAX_MS = 270;
/** Gravity while rising. */
export const GRAVITY_RISE = 1900;
/** Gravity while falling — heavier, so the arc is snappy instead of floaty. */
export const GRAVITY_FALL = 3300;
/** Terminal fall speed, keeps long drops readable. */
export const MAX_FALL_SPEED = 1150;

/** Grace window for jumping after walking off an edge. */
export const COYOTE_MS = 140;
/** Pre-landing tap window: a jump requested this soon before touchdown still fires. */
export const JUMP_BUFFER_MS = 150;

// Derived jump envelope (kept here so the level validator and the level designer
// work from the same numbers as the player controller).
export const MAX_JUMP_HEIGHT = (() => {
  const holdS = HOLD_MAX_MS / 1000;
  const netAccel = GRAVITY_RISE - HOLD_FORCE; // still positive => decelerating slowly
  const vAtCap = JUMP_IMPULSE - netAccel * holdS;
  const hHold = JUMP_IMPULSE * holdS - 0.5 * netAccel * holdS * holdS;
  return hHold + (vAtCap * vAtCap) / (2 * GRAVITY_RISE);
})();

export const MAX_JUMP_DISTANCE = (() => {
  const holdS = HOLD_MAX_MS / 1000;
  const netAccel = GRAVITY_RISE - HOLD_FORCE;
  const vAtCap = JUMP_IMPULSE - netAccel * holdS;
  const riseS = holdS + vAtCap / GRAVITY_RISE;
  const fallS = Math.sqrt((2 * MAX_JUMP_HEIGHT) / GRAVITY_FALL);
  return (riseS + fallS) * RUN_SPEED;
})();

// ---------------------------------------------------------------------------
// Player body
// ---------------------------------------------------------------------------
export const PLAYER_SPRITE_W = 30;
export const PLAYER_SPRITE_H = 42;
/** Hitbox is deliberately smaller than the sprite — visual near-misses shouldn't kill. */
export const PLAYER_BODY_W = 20;
export const PLAYER_BODY_H = 34;

// Hazard and creature hitboxes follow the same forgiveness rule and are set per sprite in
// src/objects/entities.js, where each shape's silhouette is known.

// ---------------------------------------------------------------------------
// Damage, checkpoints, power-up
// ---------------------------------------------------------------------------
/** Invincibility after respawning at a checkpoint. */
export const RESPAWN_INVULN_MS = 1600;
/** Invincibility after the shield power-up eats a hit. */
export const SHIELD_INVULN_MS = 1400;
/** Flicker period during invincibility. */
export const INVULN_FLASH_MS = 90;
/** Death -> back-in-control. Kept short: respawning must feel low friction. */
export const RESPAWN_DELAY_MS = 480;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
/** Player sits this far from the left edge, leaving ~2/3 of the screen as look-ahead. */
export const CAMERA_LEAD = 300;
export const CAMERA_LERP_Y = 0.08;

// ---------------------------------------------------------------------------
// Streaming / pooling
// ---------------------------------------------------------------------------
/** Entities wake up this far ahead of the camera's right edge... */
export const ACTIVATION_MARGIN = 260;
/** ...and are recycled this far behind its left edge. */
export const RECYCLE_MARGIN = 220;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export const CRYSTAL_SCORE = 10;

// ---------------------------------------------------------------------------
// Palette (bioluminescent cave)
// ---------------------------------------------------------------------------
export const COLORS = {
  void: 0x05070d,
  stoneDark: 0x1a1f2c,
  stoneMid: 0x282f40,
  stoneLight: 0x3a445a,
  teal: 0x3fe0c8,
  violet: 0xa06cff,
  amber: 0xffc25c,
  rose: 0xff5d7a,
  ice: 0xcfe9ff
};
